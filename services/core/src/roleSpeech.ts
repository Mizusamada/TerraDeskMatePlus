import {existsSync,readFileSync,statSync} from 'node:fs';import path from 'node:path';import type {Config} from './config.js';
import {isVerifiedVoiceTraining,voiceTrainingKey} from './voiceTraining.js';
export function roleId(c:Config){return c.assets.customId?.startsWith('operator:')?c.assets.customId.slice(9):c.assets.customId||'Amiya';}
export function bundledVoicePath(root:string,value:string){if(!value.startsWith('builtin:'))return value;const rel=value.slice(8),file=path.resolve(root,rel),r=path.relative(root,file);if(r.startsWith('..')||path.isAbsolute(r))throw Error('内置语音引用越界');return file;}
type RoleReferenceSample=Config['speech']['gptSovits']['trainingReferences'][number];
// One bounded cache avoids parsing a multi-megabyte catalog several times for each
// config refresh. File size/mtime invalidate it after a resource package update.
let referenceCache:{file:string;signature:string;data:any}|undefined;
function readReferences(file:string){
 const info=statSync(file),signature=info.size+'|'+info.mtimeMs;
 if(referenceCache?.file===file&&referenceCache.signature===signature)return referenceCache.data;
 const data=JSON.parse(readFileSync(file,'utf8'));referenceCache={file,signature,data};return data;
}

/** Output language and reference-recording language are independent in GPT-SoVITS.
 * If this role lacks Chinese originals, condition on its OWN native recording for
 * cross-language synthesis; never label a Japanese recording as Chinese or borrow another role.
 */
function referenceFor(c:Config,file:string,locale:'ja'|'zh'){
 const languages=readReferences(file).roles?.[roleId(c)]?.languages;
 const ref=languages?.[locale]||languages?.ja||languages?.zh;
 if(!ref)throw Error('当前角色缺少所选语言及自身可用原声参考；不会借用其他角色声音。');
 const sourceLocale=languages?.[locale]?locale:languages?.ja?'ja':'zh';
 return {ref,referenceLanguage:ref.referenceLanguage||sourceLocale};
}
/**
 * 读取当前角色自己的训练样本；路径先保持 builtin: URI，只有真正导出训练数据时才解析到随包文件。
 * 这样角色切换不会把阿米娅或上一个角色的录音带进来，也不会让 publicConfig 携带机器相关的绝对路径。
 */
export function roleTrainingReferences(c:Config,root:string,locale:'ja'|'zh',materialize=false):RoleReferenceSample[]{
 const file=path.join(root,'role-reference-catalog.json');
 if(!existsSync(file))return [];
 const {ref}=referenceFor(c,file,locale);
 const samples=ref.samples;
 if(!Array.isArray(samples))return [];
 return samples
   .filter((sample:any)=>typeof sample?.audio==='string')
   .map((sample:any)=>({
     audioPath:materialize?bundledVoicePath(root,'builtin:'+sample.audio):'builtin:'+sample.audio,
     text:typeof sample.text==='string'?sample.text.trim():'',
     language:sample.language||locale,
     transcriptSource:sample.transcriptSource,
     needsReview:sample.transcriptSource==='local_whisper_small_unreviewed',
     reviewed:false,
   }));
}

export function roleReferenceConfig(c:Config,root:string,locale:'ja'|'zh',materialize=false):Config{
 const next=structuredClone(c);
 const materializeRows=(rows:RoleReferenceSample[])=>rows.map(row=>({...row,audioPath:bundledVoicePath(root,row.audioPath)}));
 if(!next.speech.autoLanguageReference){
   if(materialize){
     next.speech.gptSovits.referenceAudioPath=bundledVoicePath(root,next.speech.gptSovits.referenceAudioPath);
     next.speech.gptSovits.auxReferenceAudioPaths=next.speech.gptSovits.auxReferenceAudioPaths.map(v=>bundledVoicePath(root,v));
     next.speech.gptSovits.trainingReferences=materializeRows(next.speech.gptSovits.trainingReferences);
   }
   return next;
 }
 const file=path.join(root,'role-reference-catalog.json');
 if(!existsSync(file))return next;
 const {ref,referenceLanguage}=referenceFor(next,file,locale);
 const address=(s:string)=>materialize?bundledVoicePath(root,'builtin:'+s):'builtin:'+s;
 Object.assign(next.speech.gptSovits,{referenceAudioPath:address(ref.main),auxReferenceAudioPaths:ref.aux.map(address),promptText:ref.samples?.find((sample:any)=>sample.audio===ref.main)?.text||'',promptLanguage:referenceLanguage,language:locale});
 // 只在当前角色还没有用户编辑过训练样本时自动填充，避免每次保存设置都覆盖用户的筛选结果。
 const ownPrefix='builtin:干员语音/'+roleId(next)+'/';
 const originalRows=next.speech.gptSovits.trainingReferences;
 // Auto-generated builtin rows from a previously controlled role must never survive
 // a role switch. Explicit local user recordings remain under that role's saved profile.
 const rows=originalRows.filter(row=>!row.audioPath.startsWith('builtin:干员语音/')||row.audioPath.startsWith(ownPrefix));
 next.speech.gptSovits.trainingReferences=rows.length?(materialize?materializeRows(rows):rows):roleTrainingReferences(next,root,locale,materialize);
 return next;
}
export function sharedLocalSpeech(next:Config,previous:Config){
 const p=previous.speech.gptSovits,n=next.speech.gptSovits;if(p.installPath&&!n.installPath)Object.assign(n,{installPath:p.installPath,pythonPath:p.pythonPath,apiUrl:p.apiUrl,device:p.device});
 if(n.installPath&&next.speech.autoLanguageReference){n.enabled=true;if(next.speech.outputMode==='text-only')next.speech.outputMode='gpt-sovits';}return next;
}

/**
 * Resolve role-owned GPT/SoVITS paths without copying a previous role's trained
 * weights. The generic base paths remain a fallback; a trained pair is used only
 * after the existing independent-validation gate passes.
 */
export function applyRoleVoiceWeightDefaults(c:Config,previous?:Config):Config {
 const next=structuredClone(c);
 const key=voiceTrainingKey(roleId(next));
 const profile=next.voiceTraining?.[key];
 const previousKey=previous?voiceTrainingKey(roleId(previous)):'';
 const previousProfile=previous?.voiceTraining?.[previousKey];
 let inheritedGpt=next.speech.gptSovits.gptModelPath;
 let inheritedSovits=next.speech.gptSovits.sovitsModelPath;
 // If the inherited paths were the previous role's trained pair, do not leak
 // them into a new role. Prefer that role's explicitly saved base pair instead.
 if(previousProfile?.trainedGptModelPath&&inheritedGpt===previousProfile.trainedGptModelPath) inheritedGpt=previousProfile.baseGptModelPath||'';
 if(previousProfile?.trainedSovitsModelPath&&inheritedSovits===previousProfile.trainedSovitsModelPath) inheritedSovits=previousProfile.baseSovitsModelPath||'';
 if(profile?.status==='verified'&&isVerifiedVoiceTraining(profile)){
   next.speech.gptSovits.gptModelPath=profile.trainedGptModelPath;
   next.speech.gptSovits.sovitsModelPath=profile.trainedSovitsModelPath;
 } else {
   next.speech.gptSovits.gptModelPath=profile?.baseGptModelPath||inheritedGpt||'';
   next.speech.gptSovits.sovitsModelPath=profile?.baseSovitsModelPath||inheritedSovits||'';
 }
 return next;
}
