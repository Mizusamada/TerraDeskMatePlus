import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

/**
 * 训练状态故意拆成“数据、训练、验证”三个阶段。
 * 这样 UI 和运行时不会把多参考推理、导出清单或手工填入权重误报成已训练。
 */
export type VoiceTrainingStatus = 'not_started' | 'dataset_ready' | 'training' | 'trained_unverified' | 'verified' | 'failed';
export type VoiceValidationStatus = 'not_run' | 'passed' | 'failed';
export type VoiceTrainingLanguage = 'ja' | 'zh' | 'en' | 'ko' | 'yue';

/**
 * 训练档案的状态不是普通标签，而是运行时门禁的审计轨迹。
 * 统一从这里校验迁移，避免 UI/IPC 通过直接改字符串越过“训练完成”和“独立验证”。
 */
const voiceTrainingTransitions: Record<VoiceTrainingStatus, VoiceTrainingStatus[]> = {
  not_started: ['dataset_ready'],
  dataset_ready: ['training'],
  training: ['trained_unverified', 'failed'],
  trained_unverified: ['verified', 'failed', 'training'],
  verified: ['trained_unverified', 'failed', 'training'],
  failed: ['dataset_ready', 'training'],
};

export interface VoiceTrainingSample {
  /** 复制到角色训练目录后的最终路径；原始 D:\\ak 素材保持只读。 */
  audioPath: string;
  text: string;
  language: VoiceTrainingLanguage;
}

export interface VoiceTrainingProfile {
  schemaVersion: 1;
  roleId: string;
  displayName: string;
  status: VoiceTrainingStatus;
  samples: VoiceTrainingSample[];
  datasetListPath: string;
  baseGptModelPath: string;
  baseSovitsModelPath: string;
  trainedGptModelPath: string;
  trainedSovitsModelPath: string;
  validation: {
    status: VoiceValidationStatus;
    checkedAt: string;
    notes: string[];
    sampleIds: string[];
  };
  /** 最近一次本地环境预检结果，只保存诊断，不保存密钥。 */
  environment?: {
    checkedAt: string;
    pythonPath: string;
    installPath: string;
    device: 'cpu' | 'cuda' | 'unknown';
    ready: boolean;
    checks: string[];
  };
  /** 任务状态可恢复，但不会让任务状态绕过验证门禁。 */
  job?: {
    id: string;
    stage: 'preflight' | 'data' | 'feature' | 'gpt' | 'sovits' | 'validation';
    status: 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';
    startedAt: string;
    finishedAt: string;
    logPath: string;
  };
  error: string;
}

export function voiceTrainingKey(roleId: string): string {
  return roleId || 'amiya_caster';
}

export function emptyVoiceTrainingProfile(roleId: string, displayName: string): VoiceTrainingProfile {
  return {
    schemaVersion: 1,
    roleId: voiceTrainingKey(roleId),
    displayName,
    status: 'not_started',
    samples: [],
    datasetListPath: '',
    baseGptModelPath: '',
    baseSovitsModelPath: '',
    trainedGptModelPath: '',
    trainedSovitsModelPath: '',
    validation: { status: 'not_run', checkedAt: '', notes: [], sampleIds: [] },
    error: '',
  };
}

export function canTransitionVoiceTraining(from: VoiceTrainingStatus, to: VoiceTrainingStatus): boolean {
  return from === to || voiceTrainingTransitions[from]?.includes(to) === true;
}

/**
 * 只更新状态与验证记录，不启动训练、不伪造权重。
 * 真实训练仍由 GPT-SoVITS 官方环境执行；本应用只保存用户明确登记的阶段和可追溯说明。
 */
export function transitionVoiceTraining(
  profile: VoiceTrainingProfile,
  to: VoiceTrainingStatus,
  details: { notes?: string[]; sampleIds?: string[]; validation?: VoiceValidationStatus } = {},
): VoiceTrainingProfile {
  if (!canTransitionVoiceTraining(profile.status, to)) {
    throw new Error(`语音训练状态不能从 ${profile.status} 直接迁移到 ${to}；请按数据→训练→待验证→验证顺序操作`);
  }
  if (to === 'training' && (!profile.datasetListPath || !profile.samples.length)) {
    throw new Error('没有当前角色训练清单和样本，不能登记训练开始');
  }
  if (to === 'trained_unverified' && (!profile.trainedGptModelPath || !profile.trainedSovitsModelPath || !existsSync(profile.trainedGptModelPath) || !existsSync(profile.trainedSovitsModelPath))) {
    throw new Error('请先填写当前角色专属 GPT 与 SoVITS 权重路径，再登记训练完成待验证');
  }
  if (to === 'verified' && (profile.validation.status !== 'passed' && details.validation !== 'passed')) {
    throw new Error('独立验证尚未记录为通过，不能进入已验证状态');
  }
  if (to === 'verified' && (!profile.trainedGptModelPath || !profile.trainedSovitsModelPath || !existsSync(profile.trainedGptModelPath) || !existsSync(profile.trainedSovitsModelPath))) {
    throw new Error('缺少当前角色专属 GPT/SoVITS 权重，不能通过独立验证');
  }
  const now = new Date().toISOString();
  return {
    ...profile,
    status: to,
    error: to === 'failed' ? (details.notes?.join('；') || profile.error || '训练或验证失败') : '',
    validation: {
      // A real new optimization run invalidates an old listening approval; its new weights must be checked independently.
      ...(to==='training'?{status:'not_run' as VoiceValidationStatus,checkedAt:'',notes:[],sampleIds:[]}:profile.validation),
      ...(details.validation ? { status: details.validation } : {}),
      ...(to === 'verified' || details.validation ? { checkedAt: now } : {}),
      ...(details.notes ? { notes: details.notes } : {}),
      ...(details.sampleIds ? { sampleIds: details.sampleIds } : {}),
    },
  };
}

export function validateVoiceTrainingProfile(profile: VoiceTrainingProfile): string[] {
  const errors: string[] = [];
  if (profile.schemaVersion !== 1) errors.push('语音训练配置版本不受支持');
  if (!profile.roleId.trim()) errors.push('缺少角色ID');
  if (!profile.samples.length) errors.push('没有训练音频');
  for (const [index, row] of profile.samples.entries()) {
    if (!row.audioPath || !existsSync(row.audioPath)) errors.push(`第${index + 1}条训练音频不存在`);
    if (!row.text.trim()) errors.push(`第${index + 1}条缺少准确原文`);
    if (!['ja', 'zh', 'en', 'ko', 'yue'].includes(row.language)) errors.push(`第${index + 1}条语言无效`);
    if (/[|\r\n]/.test(row.text)) errors.push(`第${index + 1}条原文不能包含竖线或换行`);
  }
  if (!profile.datasetListPath || !existsSync(profile.datasetListPath)) errors.push('尚未生成训练清单');
  return errors;
}

/** Only this predicate may unlock a trained voice for generated speech or future workshop roles. */
export function isVerifiedVoiceTraining(profile: VoiceTrainingProfile | undefined): boolean {
  return !!profile
    && profile.status === 'verified'
    && profile.validation.status === 'passed'
    && existsSync(profile.trainedGptModelPath)
    && existsSync(profile.trainedSovitsModelPath);
}

export function voiceTrainingReadiness(profile: VoiceTrainingProfile | undefined) {
  if (!profile) return { ready: false, code: 'missing', message: '当前角色尚未建立语音训练档案；现有原声/参考推理不能称为训练完成。' };
  const errors = validateVoiceTrainingProfile(profile);
  const verified = errors.length === 0 && isVerifiedVoiceTraining(profile);
  if (!verified && !errors.length) {
    return { ready: false, code: profile.status, message: '训练数据已登记，但角色专属权重或独立验证尚未通过。' };
  }
  return { ready: verified, code: verified ? 'verified' : 'invalid', message: verified ? '角色专属语音已训练并通过验证。' : errors.join('；') };
}

/** Write an auditable manifest next to exported data; this is metadata only, not a training result. */
export function writeVoiceTrainingManifest(profile: VoiceTrainingProfile, folder: string): string {
  mkdirSync(folder, { recursive: true });
  const file = path.join(folder, 'voice-training-manifest.json');
  writeFileSync(file, JSON.stringify(profile, null, 2), 'utf8');
  return file;
}

