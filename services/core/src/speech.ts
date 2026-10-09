import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, writeFileSync, copyFileSync } from 'node:fs';
import path from 'node:path';
import type { Config } from './config.js';
import { isVerifiedVoiceTraining, voiceTrainingKey } from './voiceTraining.js';
import { roleId } from './roleSpeech.js';
import type { Store } from './store.js';

/**
 * 统一语音路由：已训练语音与本地参考推理共用同一个本地 API，区别只在于
 * 权重是否是当前角色专属、是否通过独立验证。这样不会复制一套不一致的 TTS 行为。
 */
export async function synthesize(c: Config, text: string, key: string, store: Store, signal: AbortSignal) {
  if (c.speech.outputMode === 'text-only' || c.ui.muted || !c.speech.replyEnabled) return null;
  if (text.length > 2000) throw new Error('语音单次不超过2000字');
  const mode = c.speech.outputMode;
  const training = c.voiceTraining?.[voiceTrainingKey(roleId(c))];
  if (mode === 'trained-voice' && !isVerifiedVoiceTraining(training)) {
    throw new Error('当前角色的已训练语音尚未通过独立验证；请继续使用本地GPT-SoVITS参考推理或原声，软件不会把未验证权重部署为已训练语音');
  }
  const params = mode === 'gpt-sovits'
    ? c.speech.gptSovits
    : mode === 'trained-voice'
      ? { ...c.speech.gptSovits, gptModelPath: training!.trainedGptModelPath, sovitsModelPath: training!.trainedSovitsModelPath, auxReferenceAudioPaths: [] }
      : c.speech.bailian;
  const hash = createHash('sha256').update(JSON.stringify({ text, mode, params: { ...params, apiKeyConfigured: undefined } })).digest('hex');
  const dir = path.join(store.dir, 'audio');
  mkdirSync(dir, { recursive: true });
  const cache = path.join(dir, hash + '.wav');
  if (existsSync(cache)) return { path: cache, cached: true };
  let data: Buffer;
  if (mode === 'gpt-sovits' || mode === 'trained-voice') {
    const p = params as Config['speech']['gptSovits'];
    if (!p.enabled) throw new Error('GPT-SoVITS 未启用');
    if (!existsSync(p.referenceAudioPath)) throw new Error('参考音频路径不存在');
    // Official API permits an empty prompt_text (reference-audio-only mode); do not invent a transcript.
    const u = new URL(p.apiUrl);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(u.hostname) || u.protocol !== 'http:') throw new Error('本地 TTS 只允许 localhost HTTP 服务');
    await applyWeights(p, signal);
    for (const file of p.auxReferenceAudioPaths) if (!existsSync(file)) throw new Error('辅助参考音频不存在');
    const r = await fetch(u.origin + '/tts', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ text, text_lang: p.language, ref_audio_path: p.referenceAudioPath, aux_ref_audio_paths: p.auxReferenceAudioPaths, prompt_text: p.promptText, prompt_lang: p.promptLanguage, media_type: 'wav', streaming_mode: false, text_split_method: 'cut5', speed_factor: p.speed }),
      signal: AbortSignal.any([signal, AbortSignal.timeout(90000)]),
      redirect: 'error',
    });
    if (!r.ok) throw new Error(`本地 TTS HTTP ${r.status}，请检查模型/API及参考文本`);
    if (!(r.headers.get('content-type') || '').match(/audio|octet/i)) throw new Error('本地服务未返回音频');
    data = Buffer.from(await r.arrayBuffer());
  } else {
    const p = c.speech.bailian;
    if (!p.enabled || !key || !p.voiceId) throw new Error('云端 TTS 需要启用、API Key 和音色 ID');
    const u = new URL(p.baseUrl);
    if (u.protocol !== 'https:' || !['dashscope.aliyuncs.com', 'dashscope-intl.aliyuncs.com', 'dashscope-us.aliyuncs.com'].includes(u.hostname)) throw new Error('百炼 TTS 端点应为阿里官方HTTPS地址，不是LLM compatible-mode地址');
    const hosts: Record<string, string> = { 'cn-beijing': 'dashscope.aliyuncs.com', 'ap-southeast-1': 'dashscope-intl.aliyuncs.com', 'us-east-1': 'dashscope-us.aliyuncs.com' };
    if (!hosts[p.region] || u.hostname !== hosts[p.region]) throw new Error('地域与百炼官方端点不匹配');
    const t = new Date().toISOString();
    if (store.total('tts', t.slice(0, 10)) + text.length > p.dailyCharBudget || store.total('tts', t.slice(0, 7)) + text.length > p.monthlyCharBudget) throw new Error('云端语音额度上限已达到，未发送请求');
    store.usage('tts', text.length);
    const r = await fetch(p.baseUrl, { method: 'POST', headers: { Authorization: 'Bearer ' + key, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: p.model, input: { text, voice: p.voiceId, language_type: p.language ?? 'Japanese' } }), signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]), redirect: 'error' });
    if (!r.ok) throw new Error(`百炼 TTS HTTP ${r.status}，未自动重试（本地额度已保守计入）`);
    const j: any = await r.json();
    const audio = j.output?.audio?.url;
    if (!audio) throw new Error('百炼未返回 output.audio.url；检查模型和音色匹配。未自动重试。');
    const au = new URL(audio);
    if (au.protocol !== 'https:' || !/(^|\.)(aliyuncs\.com|alicdn\.com)$/.test(au.hostname)) throw new Error('拒绝非阿里云音频下载地址');
    const ar = await fetch(au, { signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]), redirect: 'error' });
    if (!ar.ok) throw new Error('语音已生成但下载失败，不重复收费请求');
    data = Buffer.from(await ar.arrayBuffer());
  }
  if (signal.aborted) throw new Error('已取消');
  if (data.length < 44 || data.length > 20 * 1024 * 1024) throw new Error('音频数据大小异常');
  writeFileSync(cache, data);
  return { path: cache, cached: false };
}

export async function applyWeights(p: Config['speech']['gptSovits'], signal: AbortSignal) {
  const u = new URL(p.apiUrl);
  if (u.protocol !== 'http:' || !['localhost', '127.0.0.1', '[::1]'].includes(u.hostname)) throw new Error('语音服务必须在本机');
  const endpoints: Array<[string, string]> = [['/set_gpt_weights', p.gptModelPath], ['/set_sovits_weights', p.sovitsModelPath]];
  for (const [endpoint, weights] of endpoints) {
    if (!weights) continue;
    if (!existsSync(weights)) throw new Error('模型路径不存在：' + path.basename(weights));
    const url = new URL(endpoint, u.origin);
    url.searchParams.set('weights_path', weights);
    const r = await fetch(url, { signal: AbortSignal.any([signal, AbortSignal.timeout(60000)]), redirect: 'error' });
    if (!r.ok) throw new Error('切换语音模型HTTP ' + r.status);
  }
  return { message: endpoints.some(e => e[1]) ? '已提交所选GPT/SoVITS权重，试听后判断音色。' : '未选择权重，服务将使用自身当前模型。' };
}

/**
 * 训练导出只做数据整理，不调用训练脚本。
 * 原始录音复制到用户数据目录，清单使用当前角色ID，避免阿米娅的 speaker 标签污染其他角色。
 */
export function exportTrainingDataset(c: Config, dir: string) {
  const rows = c.speech.gptSovits.trainingReferences;
  if (!rows.length) throw new Error('请多选训练参考，并为每条填写准确文本与语言');
  const currentRole = voiceTrainingKey(roleId(c));
  // GPT-SoVITS speaker 字段只用稳定的角色标签；保留历史默认 amiya，其他角色使用其独立ID。
  const speaker = currentRole === 'Amiya' ? 'amiya' : currentRole.replace(/[^a-zA-Z0-9_-]/g, '_');
  for (const row of rows) {
    // ASR remains a draft until its own recording/text/language have been checked.
    if(row.needsReview&&!row.reviewed)throw new Error('本地识别的原文候选需要先核对录音、文本和语言，再确认用于训练');
    if (!existsSync(row.audioPath) || !row.text.trim()) throw new Error('每条训练参考都需要存在的音频和非空原文');
    if (!['ja', 'zh', 'en', 'ko', 'yue'].includes(row.language) || /[|\r\n]/.test(row.text)) throw new Error('文本不能包含竖线/换行，语言需ja/zh/en/ko/yue');
  }
  const folder = path.join(dir, 'training', currentRole, 'dataset-' + Date.now());
  const audioDir = path.join(folder, 'audio');
  mkdirSync(audioDir, { recursive: true });
  const lines: string[] = [];
  const samples = rows.map((row, index) => {
    const file = path.join(audioDir, String(index + 1).padStart(3, '0') + path.extname(row.audioPath).toLowerCase());
    copyFileSync(row.audioPath, file);
    const sample = { audioPath: file, text: row.text.trim(), language: row.language as any };
    lines.push(file + '|' + speaker + '|' + sample.language.toUpperCase() + '|' + sample.text);
    return sample;
  });
  const list = path.join(folder, currentRole + '.list');
  writeFileSync(list, lines.join('\n'), 'utf8');
  writeFileSync(path.join(folder, 'README.txt'), `角色：${c.persona.displayName}（${currentRole}）\nGPT-SoVITS训练清单。需在完整官方包WebUI的数据处理页使用此list，完成特征提取与SoVITS/GPT训练。多参考推理不等于训练。本软件未训练/上传，也未修改原始素材。\n`, 'utf8');
  return { folder, list, count: rows.length, roleId: currentRole, samples, message: `已导出 ${rows.length} 条标注数据到 ${folder}。这只是训练数据，不是训练完成的模型。` };
}



