import type {Config} from './config.js';
export function choosePool<T>(items:T[],previous?:T,random=Math.random):T|undefined{const distinct=[...new Set(items)],alternative=distinct.filter(x=>x!==previous),pool=alternative.length?alternative:distinct;return pool[Math.min(pool.length-1,Math.floor(random()*pool.length))];}
export function selectRoleVoice(c:Config,voices:any[],setting:string,pool:string[]=[],locale:'ja'|'zh'='ja',previous='',random=Math.random){
 const available=voices.filter(v=>v.languages?.includes(locale)||!v.languages||v.language==='unknown');
 if(!setting)return undefined;
 // The caller already supplies the current role's catalog. Foot questions keep
 // that role's own recorded words/tone; no generic Amiya recording is borrowed.
 if(setting==='__question__'){const dedicated=available.find(v=>v.id==='foot_poke');if(dedicated)return dedicated;const questions=available.filter(v=>/[？?]/.test(v.textZh||v.textJa||''));const id=choosePool(questions.map(v=>v.id),previous,random);return questions.find(v=>v.id===id);}
if(setting==='__trust__')return available.find(v=>/信赖触摸/.test(v.title))||available.find(v=>/(?:^|_)cn_036$/.test(v.id));
 if(setting==='__random__'||setting==='__pool__'){const candidates=setting==='__pool__'?available.filter(v=>pool.includes(v.id)):available;const id=choosePool(candidates.map(v=>v.id),previous,random);return candidates.find(v=>v.id===id);}
 return available.find(v=>v.id===setting);
}
export function defaultsForRole(c:Config):Config{const next=structuredClone(c);next.behaviour.defaultsRevision=3;next.behaviour.actionVoiceEnabled=true;next.behaviour.actionVoiceRandomPool=true;next.behaviour.actionVoiceChance=1;next.ui.idleEnabled=true;next.ui.idleSpeechEnabled=true;next.ui.edgeWalkEnabled=true;next.behaviour.clickBindings={...next.behaviour.clickBindings,head_touch:{action:'random',voiceId:'__random__',actionIds:[],voiceIds:[]},face_poke:{action:'Interact',voiceId:'__trust__',actionIds:[],voiceIds:[]},foot_poke:{action:'',voiceId:'__question__',actionIds:[],voiceIds:[]}};return next;}
