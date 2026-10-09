import {defaultDeploymentBinding,type DeploymentBinding} from './deploymentPolicy.js';
import type {EventAction} from './stoneBug.js';

export const CHARACTER_TEMPLATE_SCHEMA = 1 as const;
export type CharacterKind = 'builtin' | 'custom';
export type CharacterActionGroup = '基建' | '战斗' | '自定义' | '全部';

export interface CharacterTemplate {
 schemaVersion: typeof CHARACTER_TEMPLATE_SCHEMA;
 id: string;
 displayName: string;
 kind: CharacterKind;
 role?: string;
 description?: string;
 model: {
  format: 'spine3.8';
  bundleIds: string[];
  defaultSkin: string;
  defaultActionGroup: CharacterActionGroup;
  deploymentAnimationNames: string[];
  standbyAnimationNames: string[];
  interactionAnimationNames: Partial<Record<'head_touch'|'face_poke'|'foot_poke'|'greet'|'deployment', string[]>>;
 };
 persona: {
  profileId: string;
  displayName: string;
  addressCn: string;
  addressJa: string;
 };
 speech: {
  languages: Array<'ja'|'zh'>;
  referenceAudioPaths: string[];
 };
 behaviour: {
  deployment?: DeploymentBinding;
  idleEnabled: boolean;
  idleSpeechEnabled: boolean;
  touchBattleAnimations: boolean;
  defaultActionGroup: CharacterActionGroup;
 };
 audit: {
  source: 'bundled'|'user-imported';
  importedAt?: string;
  modelVersion?: string;
  missing: string[];
 };
}

export interface CharacterTemplateInput {
 id: string;
 displayName: string;
 kind?: CharacterKind;
 role?: string;
 skin?: string;
 bundleIds?: string[];
 actionNames?: string[];
 actionGroups?: Record<string,string>;
 referenceAudioPaths?: string[];
 modelVersion?: string;
 importedAt?: string;
}

const deployment=/^start$|^(appear|spawn|entrance)$/i;
const standby=/relax|idle|stand|待机/i;
const action=(names:string[],pattern:RegExp)=>names.filter(name=>pattern.test(name));

export function normalizeCharacterTemplate(input:CharacterTemplateInput):CharacterTemplate {
 const names=[...new Set(input.actionNames||[])];
 const groups=input.actionGroups||{};
 const group=input.kind==='custom'?'自定义':(Object.values(groups).includes('基建')?'基建':'战斗');
 const deploymentAnimationNames=action(names,deployment);
 const standbyAnimationNames=action(names,standby);
 const first=(pattern:RegExp)=>action(names,pattern).slice(0,6);
 const id=input.id.trim();
 const displayName=input.displayName.trim()||'未命名角色';
 return {schemaVersion:CHARACTER_TEMPLATE_SCHEMA,id,displayName,kind:input.kind||'custom',role:input.role||'用户自定义角色',description:'由统一角色模板生成；角色内容、动作和语音独立保存。',model:{format:'spine3.8',bundleIds:[...(input.bundleIds||[])],defaultSkin:input.skin||displayName,defaultActionGroup:group as CharacterActionGroup,deploymentAnimationNames,standbyAnimationNames,interactionAnimationNames:{deployment:deploymentAnimationNames.slice(0,1),head_touch:first(/head|touch|pat/i),face_poke:first(/face|poke/i),foot_poke:first(/foot|interact/i),greet:first(/greet|hello|appear|start/i)}},persona:{profileId:id,displayName,addressCn:'博士',addressJa:'ドクター'},speech:{languages:['ja','zh'],referenceAudioPaths:[...(input.referenceAudioPaths||[])]},behaviour:{deployment:defaultDeploymentBinding(),idleEnabled:true,idleSpeechEnabled:true,touchBattleAnimations:false,defaultActionGroup:group as CharacterActionGroup},audit:{source:input.kind==='builtin'?'bundled':'user-imported',importedAt:input.importedAt,modelVersion:input.modelVersion,missing:[]}};
}

export function validateCharacterTemplate(template:CharacterTemplate):string[] {
 const errors:string[]=[];
 if(template.schemaVersion!==CHARACTER_TEMPLATE_SCHEMA)errors.push('角色模板版本不受支持');
 if(!template.id.trim())errors.push('角色模板缺少 id');
 if(!template.displayName.trim())errors.push('角色模板缺少显示名');
 if(template.model.format!=='spine3.8')errors.push('角色模板只支持 Spine3.8');
 if(!template.model.bundleIds.length)errors.push('角色模板缺少模型 bundle');
 if(!template.model.standbyAnimationNames.length)errors.push('角色模板缺少待机动作');
 if(template.model.deploymentAnimationNames.length>1)errors.push('部署动作必须由优先级列表控制，不能自动播放多条');
 if(!template.persona.profileId)errors.push('角色模板缺少独立人设 profileId');
 if(!template.speech.languages.length)errors.push('角色模板缺少语音语言');
 return errors;
}

export function firstDeploymentAnimation(template:CharacterTemplate, available:EventAction[]):EventAction|undefined {
 const preferred=template.model.deploymentAnimationNames;
 return preferred.map(name=>available.find(action=>action.name===name)).find(Boolean)
  ||available.find(action=>deployment.test(action.name));
}
