import { existsSync, lstatSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { inspectModel } from './assets.js';

export interface WorkshopPreflight {
  folder: string;
  format: 'spine3.8' | 'spine4' | 'live2d' | 'unknown';
  ready: boolean;
  required: Array<{ name: string; present: boolean; detail: string }>;
  optional: Array<{ name: string; present: boolean; detail: string }>;
  skeleton?: { version: string; name: string; animations: string[]; bones: number; slots: number };
  warnings: string[];
  capabilities: { actions: boolean; deployment: boolean; idle: boolean; collision: boolean; chase: boolean; voiceBinding: boolean };
}

/**
 * 工作台预检只读取目录，不复制、不执行外部程序、不调用云端。
 * 必填/可选分层是为了让不完整的第三方工程可修复，而不是被误报为完整桌宠。
 */
export function inspectWorkshopFolder(folder: string): WorkshopPreflight {
  if (!path.isAbsolute(folder) || !existsSync(folder)) throw new Error('请选择存在的本地模型目录');
  const names = readdirSync(folder);
  const has = (re: RegExp) => names.some(name => re.test(name));
  const live2d = has(/\.model3\.json$/i) || has(/\.moc3$/i);
  if (live2d) {
    return {
      folder, format: 'live2d', ready: false,
      required: [{ name: 'Live2D运行时适配', present: false, detail: '当前版本只做格式识别，尚未把Live2D伪装成Spine动作角色' }],
      optional: [{ name: '贴图/物理/动作', present: has(/\.png$/i), detail: '已发现文件但不会误报为骨骼动作能力' }],
      warnings: ['Live2D可登记为待适配资源，但当前不能接入Spine动作池、源石虫追击或部署动作。'],
      capabilities: { actions: false, deployment: false, idle: false, collision: false, chase: false, voiceBinding: false },
    };
  }
  const skeleton = names.filter(name => /\.(skel|json)$/i.test(name) && name !== 'manifest.json' && name !== 'character.json');
  if (skeleton.length !== 1) {
    return {
      folder, format: 'unknown', ready: false,
      required: [{ name: '唯一Spine骨骼文件', present: skeleton.length === 1, detail: '需要一个 .skel 或骨骼 .json，不能把 character.json 当骨骼' }],
      optional: [], warnings: ['目录未形成可解析的完整Spine工程。'],
      capabilities: { actions: false, deployment: false, idle: false, collision: false, chase: false, voiceBinding: false },
    };
  }
  try {
    const model = inspectModel(path.join(folder, skeleton[0]), true);
    const atlasPresent = model.files.some(file => /\.atlas$/i.test(file));
    const pngPresent = model.files.some(file => /\.(png|jpg|jpeg|webp)$/i.test(file));
    const spine38 = String(model.version || '').startsWith('3.8');
    const idle = model.animations.some((a: any) => /^(relax|idle|stand)$/i.test(a.name));
    const deployment = model.animations.some((a: any) => /^(start|appear|spawn|entrance)$/i.test(a.name));
    const required = [
      { name: 'Spine 3.8骨骼', present: spine38, detail: `检测到版本 ${model.version || '未知'}` },
      { name: 'atlas图集', present: atlasPresent, detail: atlasPresent ? '已找到并由骨骼引用' : '缺少atlas' },
      { name: 'PNG/纹理', present: pngPresent, detail: pngPresent ? '已找到贴图' : '缺少PNG/贴图' },
      { name: '可回待机动作', present: idle, detail: idle ? 'Relax/Idle/Stand 至少一个' : '缺少安全待机动作' },
    ];
    const optional = [
      { name: '部署动作', present: deployment, detail: deployment ? '可接入部署动作选择器' : '缺失时使用模板默认并标记待配置' },
      { name: '交互动作', present: model.animations.some((a: any) => /interact|touch|poke/i.test(a.name)), detail: '按名称匹配，仍可手动映射' },
      { name: '语音目录', present: has(/语音|voice|audio/i), detail: '语音需要另行导入并绑定' },
      { name: '碰撞/脚线', present: existsSync(path.join(folder, 'collision.json')) || existsSync(path.join(folder, 'character.json')), detail: '缺失时使用安全默认并标记待配置' },
    ];
    return {
      folder, format: spine38 ? 'spine3.8' : 'spine4', ready: required.every(row => row.present), required, optional,
      skeleton: { version: model.version, name: model.name, animations: model.animations.map((a: any) => a.name), bones: model.skeletonSignature.bones.length, slots: model.skeletonSignature.slots.length },
      warnings: [
        ...(spine38 ? [] : ['当前只支持 Spine 3.8；Spine 4 需要转换后再导入。']),
        ...(deployment ? [] : ['没有出场动作：导入后不能自动获得部署动作，请在工作台手动配置。']),
      ],
      capabilities: { actions: spine38 && required[1].present && required[2].present, deployment: spine38 && deployment, idle, collision: optional[3].present, chase: spine38 && idle, voiceBinding: false },
    };
  } catch (error: any) {
    return {
      folder, format: 'unknown', ready: false,
      required: [{ name: 'Spine工程解析', present: false, detail: error?.message || '解析失败' }], optional: [], warnings: ['识别文件不等于拥有可运行骨骼能力。'],
      capabilities: { actions: false, deployment: false, idle: false, collision: false, chase: false, voiceBinding: false },
    };
  }
}

export interface WorkshopRoleProfile {
  displayName: string;
  addressCn: string;
  addressJa: string;
  role: string;
  personality: string;
  tone: string;
  speechHabits: string;
}

export interface WorkshopVoiceBinding {
  deploymentVoiceId: string;
  idleVoiceIds: string[];
  interactionVoiceIds: string[];
}

export interface WorkshopProject {
  schemaVersion: 1 | 2;
  id: string;
  roleId: string;
  displayName: string;
  sourceFormat: WorkshopPreflight['format'];
  sourceFolder: string;
  targetBundleId: string;
  actionMappings: { idle: string; deployment: string; interact: string; move: string };
  capabilities: WorkshopPreflight['capabilities'];
  roleProfile?: WorkshopRoleProfile;
  voiceBinding?: WorkshopVoiceBinding;
  createdAt: string;
  updatedAt: string;
}

/**
 * 工作台工程是可迁移的角色边界；角色卡和语音绑定必须与动作一起校验，
 * 防止只导入模型后意外复用阿米娅的人设或跨角色声音。
 */
export function validateWorkshopProject(project: WorkshopProject): string[] {
  const errors: string[] = [];
  if (project.schemaVersion !== 1 && project.schemaVersion !== 2) errors.push('工作台工程版本不受支持');
  if (!project.id || !project.roleId || !project.displayName) errors.push('工作台工程缺少角色身份');
  if (!['spine3.8', 'spine4', 'live2d', 'unknown'].includes(project.sourceFormat)) errors.push('工作台工程格式无效');
  if (!project.targetBundleId) errors.push('缺少目标模型');
  if (!project.actionMappings || typeof project.actionMappings !== 'object') errors.push('缺少动作映射');
  if (project.schemaVersion === 2) {
    const p = project.roleProfile;
    if (p) {
      for (const key of ['displayName', 'addressCn', 'addressJa', 'role', 'personality', 'tone', 'speechHabits']) {
        if (typeof (p as any)[key] !== 'string') errors.push('角色卡字段无效：' + key);
      }
    }
    const v = project.voiceBinding;
    if (v) {
      if (typeof v.deploymentVoiceId !== 'string') errors.push('部署语音绑定无效');
      if (!Array.isArray(v.idleVoiceIds) || !v.idleVoiceIds.every((x: any) => typeof x === 'string')) errors.push('闲置语音绑定无效');
      if (!Array.isArray(v.interactionVoiceIds) || !v.interactionVoiceIds.every((x: any) => typeof x === 'string')) errors.push('互动语音绑定无效');
    }
  }
  return errors;
}
