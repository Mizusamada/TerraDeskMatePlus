import { existsSync } from 'node:fs';
import { spawn } from 'node:child_process';
import path from 'node:path';
import type { Config } from './config.js';
import type { VoiceTrainingProfile } from './voiceTraining.js';

export interface VoiceTrainingEnvironmentCheck {
  ready: boolean;
  pythonPath: string;
  installPath: string;
  device: 'cpu' | 'cuda' | 'unknown';
  checks: string[];
  missing: string[];
  message: string;
}

export interface VoiceTrainingCommand {
  stage: 'data' | 'feature' | 'gpt' | 'sovits';
  label: string;
  executable: string;
  args: string[];
  cwd: string;
  /** 环境变量只记录非敏感的本地路径和设备信息。 */
  env: Record<string, string>;
}

export interface VoiceTrainingPlan {
  roleId: string;
  outputDir: string;
  stages: VoiceTrainingCommand[];
  warnings: string[];
}

function candidatePython(config: Config): string {
  const install = config.speech.gptSovits.installPath;
  return [
    config.speech.gptSovits.pythonPath,
    path.join(install, 'env', 'python.exe'),
    path.join(install, 'runtime', 'python.exe'),
    path.join(install, 'env', 'Scripts', 'python.exe'),
    path.join(install, 'venv', 'Scripts', 'python.exe'),
  ].find(value => !!value && existsSync(value)) || '';
}

/**
 * 训练前只做本机只读检查。
 * 不安装依赖、不下载权重、不修改原始素材，避免训练按钮意外改变用户环境。
 */
export async function inspectVoiceTrainingEnvironment(config: Config, profile?: VoiceTrainingProfile): Promise<VoiceTrainingEnvironmentCheck> {
  const installPath = config.speech.gptSovits.installPath;
  const pythonPath = candidatePython(config);
  const checks: string[] = [];
  const missing: string[] = [];
  if (!installPath || !existsSync(path.join(installPath, 'api_v2.py'))) missing.push('完整GPT-SoVITS安装目录（api_v2.py）');
  else checks.push('已找到 GPT-SoVITS API 与训练目录');
  if (!pythonPath) missing.push('包内或用户指定 Python');
  else checks.push('已找到本地 Python：' + pythonPath);
  const listPath = profile?.datasetListPath || '';
  if (!listPath || !existsSync(listPath)) missing.push('当前角色训练清单');
  else checks.push('已找到当前角色训练清单');
  if (!profile?.samples?.length) missing.push('当前角色带文本的训练样本');
  if (!config.speech.gptSovits.gptModelPath || !existsSync(config.speech.gptSovits.gptModelPath)) missing.push('共用 GPT 基础权重');
  else checks.push('已找到 GPT 基础权重');
  if (!config.speech.gptSovits.sovitsModelPath || !existsSync(config.speech.gptSovits.sovitsModelPath)) missing.push('共用 SoVITS 基础权重');
  else checks.push('已找到 SoVITS 基础权重');

  let device: 'cpu' | 'cuda' | 'unknown' = 'unknown';
  if (pythonPath) {
    const probe = await new Promise<{ ok: boolean; cuda: boolean; error: string }>(resolve => {
      const child = spawn(pythonPath, ['-c', 'import json;\ntry:\n import torch; print(json.dumps({"ok":True,"cuda":bool(torch.cuda.is_available())}))\nexcept Exception as e: print(json.dumps({"ok":False,"cuda":False,"error":str(e)}))'], {
        cwd: installPath || path.dirname(pythonPath),
        windowsHide: true,
        timeout: 30000,
      });
      let output = '';
      let error = '';
      child.stdout?.on('data', chunk => { output += String(chunk); });
      child.stderr?.on('data', chunk => { error += String(chunk); });
      child.once('error', e => resolve({ ok: false, cuda: false, error: e.message }));
      child.once('close', () => {
        try {
          const parsed = JSON.parse(output.trim().split(/\r?\n/).at(-1) || '{}');
          resolve({ ok: !!parsed.ok, cuda: !!parsed.cuda, error: parsed.error || error.slice(-800) });
        } catch {
          resolve({ ok: false, cuda: false, error: error.slice(-800) || 'Python未返回torch检查结果' });
        }
      });
    });
    if (probe.ok) {
      device = probe.cuda ? 'cuda' : 'cpu';
      checks.push(probe.cuda ? 'torch 与 CUDA 可用' : 'torch 可用，但未检测到 CUDA，将使用 CPU');
    } else missing.push('Python torch（' + probe.error + '）');
  }
  const ready = missing.length === 0;
  return { ready, pythonPath, installPath, device, checks, missing, message: ready ? '训练环境预检通过；下一步仍需按阶段执行并完成独立验证。' : '训练环境尚未就绪：' + missing.join('、') };
}

/**
 * 生成官方 GPT-SoVITS 阶段命令的审计计划，不直接启动训练。
 * 先把命令写入角色目录/日志，再由明确的“开始训练”操作执行，可避免猜错参数时误改权重。
 */
export function buildVoiceTrainingPlan(config: Config, profile: VoiceTrainingProfile, outputDir: string, environment: VoiceTrainingEnvironmentCheck): VoiceTrainingPlan {
  if (!environment.ready) throw new Error(environment.message);
  if (!profile.datasetListPath || !existsSync(profile.datasetListPath)) throw new Error('当前角色训练清单不存在，请先导出并校验训练清单');
  const install = environment.installPath;
  const python = environment.pythonPath;
  const role = profile.roleId.replace(/[^a-zA-Z0-9_-]/g, '_');
  const roleDir = path.join(outputDir, role);
  const expDir = path.join(roleDir, 'gpt-sovits-exp');
  const envBase = { PYTHONIOENCODING: 'utf-8', DESKTOP_PET_ROLE_ID: profile.roleId, DESKTOP_PET_DATASET: profile.datasetListPath };
  const commonArgs = ['-s'];
  const stages: VoiceTrainingCommand[] = [
    { stage: 'data', label: '官方数据处理：文本/音频整理', executable: python, args: [...commonArgs, 'GPT_SoVITS/prepare_datasets/1-get-text.py'], cwd: install, env: { ...envBase, inp_text: profile.datasetListPath, inp_wav_dir: path.dirname(profile.samples[0]?.audioPath || profile.datasetListPath), exp_name: expDir } },
    { stage: 'feature', label: '官方数据处理：HuBERT 特征', executable: python, args: [...commonArgs, 'GPT_SoVITS/prepare_datasets/2-get-hubert-wav32k.py'], cwd: install, env: { ...envBase, inp_text: profile.datasetListPath, inp_wav_dir: path.dirname(profile.samples[0]?.audioPath || profile.datasetListPath), exp_name: expDir, device: environment.device } },
    { stage: 'feature', label: '官方数据处理：语义 Token', executable: python, args: [...commonArgs, 'GPT_SoVITS/prepare_datasets/3-get-semantic.py'], cwd: install, env: { ...envBase, inp_text: profile.datasetListPath, exp_name: expDir, device: environment.device } },
    { stage: 'gpt', label: 'GPT 角色权重微调（配置需由当前版本WebUI确认）', executable: python, args: [...commonArgs, 'GPT_SoVITS/s1_train.py'], cwd: install, env: { ...envBase, exp_name: expDir, base_gpt_weight: config.speech.gptSovits.gptModelPath, device: environment.device } },
    { stage: 'sovits', label: 'SoVITS 角色权重微调（配置需由当前版本WebUI确认）', executable: python, args: [...commonArgs, 'GPT_SoVITS/s2_train.py'], cwd: install, env: { ...envBase, exp_name: expDir, base_sovits_weight: config.speech.gptSovits.sovitsModelPath, device: environment.device } },
  ];
  return { roleId: profile.roleId, outputDir: roleDir, stages, warnings: ['此计划只描述官方阶段；GPT/SoVITS训练配置项会随本地版本变化，未通过版本探测前不自动执行。', '训练完成后必须导入角色专属GPT/SoVITS权重并完成独立中日验证，状态才可改为 verified。'] };
}

/** 官方流程分阶段列出，供 UI/教程显示，不把计划当成已完成训练。 */
export const voiceTrainingStages = [
  { id: 'data', label: '数据校验与清单', detail: '检查音频、文本、语言和角色 speaker 标签。' },
  { id: 'feature', label: '特征提取', detail: '在本机提取 HuBERT/语音特征，不上传原始音频。' },
  { id: 'gpt', label: 'GPT 微调', detail: '用当前角色数据训练角色专属 GPT 权重。' },
  { id: 'sovits', label: 'SoVITS 微调', detail: '用当前角色数据训练角色专属 SoVITS 权重。' },
  { id: 'validation', label: '独立验证', detail: '使用训练集外的中日验证句，人工确认音色、咬字和稳定性。' },
] as const;
