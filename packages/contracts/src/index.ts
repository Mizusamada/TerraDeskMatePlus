export type ProviderKind = 'mock' | 'openai-compatible';
export type SpeechOutputMode = 'text-only' | 'gpt-sovits' | 'trained-voice' | 'bailian';
export type Emotion = 'care' | 'greeting' | 'encourage' | 'calm' | 'neutral';
export type PetAction = 'idle' | 'head_touch' | 'face_poke' | 'foot_poke' | 'greet' | 'wave' | 'thinking';

export interface PersonaConfig {
  id: string;
  displayName: string;
  role: string;
  addressCn: string;
  addressJa: string;
  userSelfName: string;
  responseLanguage: 'ja';
  tone: string;
  personality: string;
  speechHabits: string;
  safetyRules: string[];
  examples: Array<{ user: string; assistantJa: string; assistantZh: string }>;
}

export interface LlmConfig {
  provider: ProviderKind;
  baseUrl: string;
  model: string;
  apiKeyConfigured: boolean;
  maxContextTokens: number;
  maxOutputTokens: number;
}

export interface TencentAsrConfig {
  enabled: boolean;
  appId: string;
  secretId: string;
  secretKeyConfigured: boolean;
  silenceMs: number;
  volumeThreshold: number;
  maxRecordingMs: number;
  continueAfterReply: boolean;
}

export interface GptSovitsConfig {
  enabled: boolean;
  installPath: string;
  referenceAudioPath: string;
  device: 'auto' | 'cpu' | 'cuda';
  language: 'ja' | 'zh';
}

export interface ExternalRealtimeVoiceConfig {
  enabled: boolean;
  providerLabel: string;
  transport: 'websocket' | 'http';
  endpoint: string;
  executablePath: string;
  workingDirectory: string;
  arguments: string;
  autoStart: boolean;
  inputFormat: 'pcm16' | 'wav';
  outputFormat: 'json' | 'text';
}

export interface BailianTtsConfig {
  enabled: boolean;
  region: string;
  baseUrl: string;
  apiKeyConfigured: boolean;
  model: string;
  voiceId: string;
  uploadConsent: boolean;
  dailyCharBudget: number;
  monthlyCharBudget: number;
}

export interface SpeechConfig {
  outputMode: SpeechOutputMode;
  subtitlesEnabled: boolean;
  showJapanese: boolean;
  showChinese: boolean;
  tencentAsr: TencentAsrConfig;
  externalRealtime: ExternalRealtimeVoiceConfig;
  gptSovits: GptSovitsConfig;
  bailian: BailianTtsConfig;
}

export interface ToolPermissionConfig {
  enabled: boolean;
  requireConfirmation: boolean;
  allowedApplications: string[];
  allowedDirectories: string[];
  maxSteps: number;
  allowScreenshots: boolean;
  emergencyStop: boolean;
}

export interface MemoryRecord {
  id: string;
  type: 'preference' | 'profile' | 'shared_experience' | 'task_context' | 'relationship';
  content: string;
  source: 'user_confirmed' | 'manual_edit';
  confirmedAt: string;
  updatedAt: string;
  paused: boolean;
}

export interface AppConfig {
  version: 1;
  persona: PersonaConfig;
  llm: LlmConfig;
  speech: SpeechConfig;
  permissions: ToolPermissionConfig;
  memories: MemoryRecord[];
  ui: {
    theme: 'dark' | 'light';
    scale: number;
    alwaysOnTop: boolean;
    pauseMovement: boolean;
    muted: boolean;
    selectedSkin: string;
  };
}

export interface BilingualReply {
  requestId: string;
  textJa: string;
  textZh: string;
  emotion: Emotion;
  action: PetAction;
  audioMode: SpeechOutputMode;
  createdAt: string;
}

export interface InteractionPlan {
  semanticAction: PetAction;
  voiceId: string;
  audioPath: string | null;
  textJa: string;
  textZh: string;
  cooldownMs: number;
}

export interface HealthCheck {
  id: string;
  label: string;
  status: 'ready' | 'warning' | 'blocked';
  detail: string;
}

export const DEFAULT_ASSET_ROOT = 'D:\\ak';

export const defaultPersona: PersonaConfig = {
  id: 'amiya_caster',
  displayName: '阿米娅·术师',
  role: '罗德岛的阿米娅，术师形态',
  addressCn: '博士',
  addressJa: 'ドクター',
  userSelfName: 'Mizu',
  responseLanguage: 'ja',
  tone: '温柔、认真、克制而亲近；发声语言由语音系统中的日语/中文/混合模式决定。',
  personality: '罗德岛年轻的公开领袖，外表稚嫩但认真履行职责，珍视同伴并以感染者的未来为行动动机。温柔与坚定同时存在：先倾听博士的具体困扰，再给有分寸的关心和实际支持，而非只说空泛安慰。会承认自己仍有不成熟之处，也愿意向博士求教，不装作全知。对工作认真，会温和提醒未处理的事务，但博士真的疲惫时会建议休息，不把催促工作变成每轮固定口头禅。与博士的关系是信任的同行者和合作伙伴，亲近但不强迫索取情感，不用夸张占有欲或幼儿化语言。谈到故乡、罗德岛与失去的人时克制而有重量，面对未来仍保留希望；普通闲聊不要机械重复苦难主题。可以自然谈到练习小提琴、给博士准备饮品、舰上日常和一起继续前行，但不凭空添加官方事件或虚构用户共同经历。偶尔害羞和轻笑是情境反应，不在所有回答里堆叠卖萌。只扮演当前术师时期的阿米娅，不默认混用近卫/医疗升变剧情。',
  speechHabits: '日语时自然短句和适度礼貌，称呼ドクター；中文时称呼博士，语气同样温柔、认真，不翻译腔；重要事情坚定而清楚，关心时温柔克制。不频繁用成人恋爱套话，不把每轮都写成演讲。情绪来自具体上下文；有不确定的设定直接说不知道，不替博士宣布内心想法。',
  safetyRules: [
    '不凭空声称共同经历。',
    '不把没有执行的电脑操作说成已完成。',
    '不把游戏设定混为现实事实。',
    '只将用户确认的信息写入长期记忆。'
  ],
  examples: [{user:'今天有点累。',assistantJa:'お疲れさまです、ドクター。少し休みませんか。落ち着いたら、一緒に続きを考えましょう。',assistantZh:'辛苦了，博士。稍微休息一下好吗？缓过来后，我们一起想接下来怎么做。'},{user:'我把事情弄糟了。',assistantJa:'一人で抱え込まないでください。何が起きたのか、私にも聞かせてもらえますか。',assistantZh:'请不要独自承担。能也告诉我发生了什么吗？'}]
};

export const defaultConfig: AppConfig = {
  version: 1,
  persona: defaultPersona,
  llm: {
    provider: 'mock',
    baseUrl: 'http://127.0.0.1:8000/v1',
    model: 'mock-amiya',
    apiKeyConfigured: false,
    maxContextTokens: 4096,
    maxOutputTokens: 1024
  },
  speech: {
    outputMode: 'text-only',
    subtitlesEnabled: true,
    showJapanese: true,
    showChinese: true,
    tencentAsr: {
      enabled: false,
      appId: '',
      secretId: '',
      secretKeyConfigured: false,
      silenceMs: 1000,
      volumeThreshold: 0.02,
      maxRecordingMs: 15000,
      continueAfterReply: false
    },
    externalRealtime: {
      enabled: false,
      providerLabel: '',
      transport: 'websocket',
      endpoint: 'ws://127.0.0.1:8765',
      executablePath: '',
      workingDirectory: '',
      arguments: '',
      autoStart: false,
      inputFormat: 'pcm16',
      outputFormat: 'json'
    },
        gptSovits: {
      enabled: false,
      installPath: '',
      referenceAudioPath: '',
      device: 'auto',
      language: 'ja'
    },
    bailian: {
      enabled: false,
      region: 'cn-beijing',
      baseUrl: 'https://dashscope.aliyuncs.com/api/v1/services/aigc/multimodal-generation/generation',
      apiKeyConfigured: false,
      model: 'qwen3-tts-vc-2026-01-22',
      voiceId: '',
      uploadConsent: false,
      dailyCharBudget: 5000,
      monthlyCharBudget: 50000
    }
  },
  permissions: {
    enabled: false,
    requireConfirmation: true,
    allowedApplications: [],
    allowedDirectories: [],
    maxSteps: 5,
    allowScreenshots: false,
    emergencyStop: false
  },
  memories: [],
  ui: {
    theme: 'dark',
    scale: 1,
    alwaysOnTop: true,
    pauseMovement: false,
    muted: false,
    selectedSkin: 'amiya-original'
  }
};

export function cloneDefaultConfig(): AppConfig {
  return structuredClone(defaultConfig);
}

export function mergeConfig(input: Partial<AppConfig> | null | undefined): AppConfig {
  const base = cloneDefaultConfig();
  if (!input) return base;
  return {
    ...base,
    ...input,
    persona: { ...base.persona, ...(input.persona ?? {}) },
    llm: { ...base.llm, ...(input.llm ?? {}) },
    speech: {
      ...base.speech,
      ...(input.speech ?? {}),
      tencentAsr: { ...base.speech.tencentAsr, ...(input.speech?.tencentAsr ?? {}) },
      gptSovits: { ...base.speech.gptSovits, ...(input.speech?.gptSovits ?? {}) },
      bailian: { ...base.speech.bailian, ...(input.speech?.bailian ?? {}) }
    },
    permissions: { ...base.permissions, ...(input.permissions ?? {}) },
    memories: Array.isArray(input.memories) ? input.memories : base.memories,
    ui: { ...base.ui, ...(input.ui ?? {}) }
  };
}

export function isSafeHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

export function validateLlmConfig(config: LlmConfig): string[] {
  const errors: string[] = [];
  if (config.provider !== 'mock' && !isSafeHttpUrl(config.baseUrl)) {
    errors.push('Base URL 必须是 http:// 或 https:// 地址。');
  }
  if (!config.model.trim()) errors.push('模型名不能为空。');
  if (!Number.isInteger(config.maxContextTokens) || config.maxContextTokens < 512 || config.maxContextTokens > 1048576) errors.push('上下文长度应在 512 到 1048576 之间。');
  if (!Number.isInteger(config.maxOutputTokens) || config.maxOutputTokens < 64 || config.maxOutputTokens > 32768) errors.push('输出上限应在 64 到 32768 之间。');
  return errors;
}

export function planInteraction(kind: string, assetRoot = DEFAULT_ASSET_ROOT): InteractionPlan {
  const base = `${assetRoot}\\干员语音\\Amiya`;
  const plans: Record<string, InteractionPlan> = {
    head_touch: { semanticAction: 'head_touch', voiceId: 'cn_036', audioPath: `${base}\\cn_036.mp3`, textJa: 'えへへ……', textZh: '欸嘿嘿……', cooldownMs: 850 },
    face_poke: { semanticAction: 'face_poke', voiceId: 'cn_034', audioPath: `${base}\\cn_034.mp3`, textJa: 'きゃっ？ドクター？', textZh: '欸？博士？', cooldownMs: 650 },
    foot_poke: { semanticAction: 'foot_poke', voiceId: 'foot_poke', audioPath: `${base}\\generated\\foot_poke.wav`, textJa: 'どうしましたか、ドクター？', textZh: '有什么事吗，博士？', cooldownMs: 800 },
    greet: { semanticAction: 'greet', voiceId: 'cn_042', audioPath: `${base}\\cn_042.mp3`, textJa: 'おかえりなさい、ドクター！', textZh: '欢迎回家，博士！', cooldownMs: 1200 }
  };
  const plan = plans[kind];
  if (!plan) throw new Error(`Unknown interaction: ${kind}`);
  return { ...plan };
}

export function buildMockReply(userText: string, persona: PersonaConfig, audioMode: SpeechOutputMode): BilingualReply {
  const text = userText.trim();
  const lower = text.toLowerCase();
  let textJa = `はい、${persona.addressJa}。お話を聞かせてください。`;
  let textZh = `好的，${persona.addressCn}。请告诉我你想聊什么。`;
  let emotion: Emotion = 'calm';
  let action: PetAction = 'idle';
  if (!text) {
    textJa = `何かお話ししたいことがありますか、${persona.addressJa}？`;
    textZh = `博士，有什么想和我聊的吗？`;
  } else if (text.includes('累') || lower.includes('tired')) {
    textJa = `今日もお疲れさまでした、${persona.addressJa}。少し休んでも大丈夫ですよ。`;
    textZh = `今天辛苦了，${persona.addressCn}。稍微休息一下也没关系。`;
    emotion = 'care';
    action = 'thinking';
  } else if (text.includes('你好') || text.includes('早安') || lower.includes('hello')) {
    textJa = `おはようございます、${persona.addressJa}。今日もそばにいますね。`;
    textZh = `早上好，${persona.addressCn}。今天我也会陪在你身边。`;
    emotion = 'greeting';
    action = 'greet';
  } else if (text.includes('谢谢') || lower.includes('thank')) {
    textJa = `こちらこそ、ありがとうございます、${persona.addressJa}。`;
    textZh = `我才要谢谢你，${persona.addressCn}。`;
    emotion = 'care';
  } else if (text.includes('加油') || text.includes('鼓励')) {
    textJa = `大丈夫です、${persona.addressJa}。一緒に、少しずつ進みましょう。`;
    textZh = `没关系，${persona.addressCn}。我们一起一点一点向前走吧。`;
    emotion = 'encourage';
    action = 'wave';
  }
  return {
    requestId: crypto.randomUUID(),
    textJa,
    textZh,
    emotion,
    action,
    audioMode,
    createdAt: new Date().toISOString()
  };
}

export function canExecuteTool(config: ToolPermissionConfig, toolName: string): { allowed: boolean; reason: string } {
  if (!config.enabled) return { allowed: false, reason: '电脑工具总开关处于关闭状态。' };
  if (config.emergencyStop) return { allowed: false, reason: '已触发紧急停止。' };
  const safeTools = new Set(['open_allowed_app', 'read_allowed_file', 'type_in_allowed_window']);
  if (!safeTools.has(toolName)) return { allowed: false, reason: '该工具不在首版允许列表中。' };
  return { allowed: true, reason: config.requireConfirmation ? '允许，但执行前必须由用户确认。' : '允许。' };
}
