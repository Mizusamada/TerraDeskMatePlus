import {existsSync,lstatSync,readFileSync,statSync} from 'node:fs';import path from 'node:path';import {createHash}from'node:crypto';
import type {Config}from'./config.js';import {emptyVoiceTrainingProfile,voiceTrainingKey}from'./voiceTraining.js';import {roleId,bundledVoicePath}from'./roleSpeech.js';
/** Optional weights belong to the current role; accepting a file copy is not trained
 * timbre approval. Only manifest-listed, hash-checked files can prefill this profile.
 * The bounded cache is invalidated by package replacement/mutation; no user secrets
 * or audio are uploaded and no optimizer/inference process is launched here.
 */
const cache=new Map<string,{signature:string;row:any}>();
export function loadManagedVoiceTraining(config:Config,dataDir:string,builtinRoot:string):Config{
 const key=voiceTrainingKey(roleId(config));if(!key||key==='.'||key==='..'||/[\\/:*?"<>|]/.test(key))return config;
 const packageRoot=path.resolve(dataDir,'resource-packages','voice-model',key),manifestFile=path.join(packageRoot,'manifest.json');
 if(!existsSync(manifestFile))return config;
 const previous=config.voiceTraining[key];
 // Explicit user selections or ongoing/newly exported training data always win.
 if(previous&&!['not_started','trained_unverified'].includes(previous.status))return config;
 try{
  const manifest=JSON.parse(readFileSync(manifestFile,'utf8'));if(manifest.schemaVersion!==1||manifest.roleId!==key||manifest.kind!=='voice-model'||!Array.isArray(manifest.files))return config;
  const listed=new Map<string,any>();const items=[];
  for(const item of manifest.files){
   if(typeof item.path!=='string'||path.isAbsolute(item.path))return config;
   const file=path.resolve(packageRoot,item.path),relative=path.relative(packageRoot,file);
   if(relative.startsWith('..')||path.isAbsolute(relative)||listed.has(relative)||!existsSync(file)||!lstatSync(file).isFile()||lstatSync(file).isSymbolicLink())return config;
   listed.set(relative,item);const stat=statSync(file);items.push({file,item,size:stat.size,mtime:stat.mtimeMs});
  }
  if(!listed.has('voice-profile.json'))return config;
  const signature=createHash('sha256').update(readFileSync(manifestFile)).update(JSON.stringify(items.map(i=>[i.file,i.size,i.mtime]))).digest('hex');
  let row=cache.get(packageRoot)?.signature===signature?cache.get(packageRoot)!.row:undefined;
  if(!row){
   for(const value of items){if(value.size!==value.item.sizeBytes||createHash('sha256').update(readFileSync(value.file)).digest('hex')!==value.item.sha256)return config;}
   row=JSON.parse(readFileSync(path.join(packageRoot,'voice-profile.json'),'utf8'));
   if(row.schemaVersion!==1||row.roleId!==key||row.status!=='trained_unverified')return config;
   // Validate the index's own listed files rather than scanning for arbitrary .pth names.
   for(const rel of [row.gpt,row.sovits,row.dataset])if(typeof rel!=='string'||!listed.has(path.normalize(rel)))return config;
   if(cache.size>=8)cache.delete(cache.keys().next().value!);cache.set(packageRoot,{signature,row});
  }
  const resolve=(rel:string)=>path.resolve(packageRoot,rel),gpt=resolve(row.gpt),sovits=resolve(row.sovits);
  if(previous?.trainedGptModelPath&&previous.trainedGptModelPath!==gpt)return config;
  const samples=(row.samples||[]).map((sample:any)=>{
   let audioPath;if(typeof sample.audio!=='string')throw Error('missing sample audio');
   if(sample.audio.startsWith('builtin:')){
    if(!sample.audio.startsWith('builtin:干员语音/'+key+'/'))throw Error('foreign role sample');
    audioPath=bundledVoicePath(builtinRoot,sample.audio);
   }else{if(!listed.has(path.normalize(sample.audio)))throw Error('unlisted sample');audioPath=resolve(sample.audio);}
   if(!existsSync(audioPath)||typeof sample.text!=='string'||!['ja','zh','en','ko','yue'].includes(sample.language))throw Error('invalid role sample');
   return {audioPath,text:sample.text,language:sample.language};
  });
  const next=structuredClone(config);next.voiceTraining[key]={...emptyVoiceTrainingProfile(key,row.displayName||key),...previous,status:'trained_unverified',trainedGptModelPath:gpt,trainedSovitsModelPath:sovits,datasetListPath:resolve(row.dataset),samples,validation:{status:'not_run',checkedAt:'',notes:['已安装本角色音色扩展，仍需独立试听验证。'],sampleIds:[]}};return next;
 }catch{return config;}
}
