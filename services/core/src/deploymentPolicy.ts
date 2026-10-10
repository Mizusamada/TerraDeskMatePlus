import {standbyAnimationName} from './desktopPolicy.js';
import type {Config} from './config.js';
import {choosePool,selectRoleVoice} from './roleBehaviour.js';

export interface DeploymentBinding {action:string;voiceId:string;actionIds?:string[];voiceIds?:string[]}
export interface DeploymentAction {id:string;name:string;bundleId:string;group:string;duration:number}

/** A fresh object prevents role templates from sharing mutable pools; legacy interactions remain untouched. */
export function defaultDeploymentBinding():DeploymentBinding {
 return {action:'__default__',voiceId:'__deployment__',actionIds:[],voiceIds:[]};
}
/** Keep the existing current-bundle first Start rule. A default must never borrow a second entrance or reload another skin. */
export function firstDeploymentAction<T extends DeploymentAction>(actions:T[],bundleId:string):T|undefined {
 const own=actions.filter(a=>a.bundleId===bundleId&&a.duration>0);
 return own.find(a=>/^start$/i.test(a.name))||own.find(a=>/^(appear|spawn|entrance)$/i.test(a.name));
}
/** Explicit choices may use the current skin's other bundles; invalid/old-skin IDs cannot select another role. */
export function selectDeploymentAction<T extends DeploymentAction>(binding:DeploymentBinding,actions:T[],bundleId:string,previous='',random=Math.random):T|undefined {
 const usable=actions.filter(a=>a.duration>0&&!/^default$/i.test(a.name));
 if(!binding.action)return undefined;
 if(binding.action==='__default__')return firstDeploymentAction(usable,bundleId);
 if(binding.action==='__pool__'){
  const pool=usable.filter(a=>binding.actionIds?.includes(a.id));
  const id=choosePool(pool.map(a=>a.id),previous,random);return pool.find(a=>a.id===id);
 }
 if(binding.action==='random'){
  const daily=usable.filter(a=>(a.group==='基建'||a.group==='自定义')&&!/^die$|^start(?:_|$)|^(?:appear|spawn|entrance)(?:_|$)|_begin$|_end$/i.test(a.name));
  const id=choosePool(daily.map(a=>a.id),previous,random);return daily.find(a=>a.id===id);
 }
 return usable.find(a=>a.id===binding.action)||usable.find(a=>a.bundleId===bundleId&&a.name===binding.action)||firstDeploymentAction(usable,bundleId);
}
/** Default speech is the current role's deployment recording, not greet cn_042 or generated/cloud speech.
 * Caller provides an already role-filtered inventory; imported roles can label their own recording 部署/出场/登场.
 */
export function selectDeploymentVoice(c:Config,voices:any[],binding:DeploymentBinding,locale:'ja'|'zh',previous='',random=Math.random):any {
 if(binding.voiceId!=='__deployment__')return selectRoleVoice(c,voices,binding.voiceId,binding.voiceIds||[],locale,previous,random);
 const own=voices.filter(v=>v.languages?.includes(locale)||!v.languages||v.language==='unknown');
 return own.find(v=>/部署\s*1(?:\D|$)/.test(v.title))||own.find(v=>/(?:^|_)cn_023$/.test(v.id))||own.find(v=>/部署|出场|登场/.test(v.title));
}
/** Deployment completion uses the same per-action speed as playback, so a slow entrance is not cut short. */
export function deploymentReturnDelay(action:DeploymentAction,c:Config):number {
 const speed=c.behaviour.actionSpeeds[action.id]||c.behaviour.actionSpeeds[action.name]||c.behaviour.animationSpeed;
 return Math.max(500,action.duration*1000/speed)+250;
}
/** Match ordinary standby exactly. Skill/doll Idle suffixes are explicitly selected actions, never automatic deployment follow-ups. */
export function deploymentStandbyAction<T extends DeploymentAction>(actions:T[],bundleId:string):T|undefined {
 const own=actions.filter(a=>a.bundleId===bundleId&&a.duration>0),name=standbyAnimationName(own.map(a=>a.name));return own.find(a=>a.name===name);
}
