import {existsSync,readFileSync} from 'node:fs';
import path from 'node:path';
import type {Config} from './config.js';
import {emptyVoiceTrainingProfile} from './voiceTraining.js';
/** Bundled inference artifacts contain no training optimizer/cache or personal config; paths must stay inside this bundle. */
export function loadBundledVoiceTraining(config:Config,root:string):Config {
 // A role owns a training entry even when the optional weight extension is absent.
 // Empty/not_started is metadata, not a trained model or a fake validation result.
 const referenceFile=path.join(root,'role-reference-catalog.json');
 const c=structuredClone(config);
 if(existsSync(referenceFile))for(const id of Object.keys(JSON.parse(readFileSync(referenceFile,'utf8')).roles||{})){
  if(!c.voiceTraining[id])c.voiceTraining[id]=emptyVoiceTrainingProfile(id,id);
 }
 const file=path.join(root,'trained-voices','index.json');if(!existsSync(file))return c;
 const data=JSON.parse(readFileSync(file,'utf8'));if(data.schemaVersion!==1||!Array.isArray(data.roles))throw Error('内置训练产物目录格式无效');
 const resolve=(rel:string)=>{if(typeof rel!=='string'||path.isAbsolute(rel))throw Error('内置训练权重必须使用相对路径');const p=path.resolve(root,rel),r=path.relative(root,p);if(r.startsWith('..')||path.isAbsolute(r))throw Error('内置训练权重路径越界');return p;};
 for(const row of data.roles){if(!row.roleId||row.status!=='trained_unverified')continue;const previous=c.voiceTraining[row.roleId];if(previous&&previous.status!=='not_started'&&previous.status!=='trained_unverified')continue;
  const gpt=resolve(row.gpt),sovits=resolve(row.sovits);if(!existsSync(gpt)||!existsSync(sovits))continue;
  // A new bundle may prefill model paths but must never silently replace user-selected verified weights or forge human validation.
  if(previous?.trainedGptModelPath&&previous.trainedGptModelPath!==gpt)continue;
  c.voiceTraining[row.roleId]={...emptyVoiceTrainingProfile(row.roleId,row.displayName||row.roleId),...previous,status:'trained_unverified',trainedGptModelPath:gpt,trainedSovitsModelPath:sovits,datasetListPath:resolve(row.dataset),samples:(row.samples||[]).map((s:any)=>({audioPath:resolve(s.audio),text:s.text,language:s.language})),validation:{status:'not_run',checkedAt:'',notes:['真实训练权重已随包部署，人工音色相似度仍待试听。'],sampleIds:[]}};
 }
 return c;
}
