import {existsSync,readFileSync} from 'node:fs';import path from 'node:path';import type {Config} from './config.js';
export function applyBundledTemplate(config:Config,appRoot:string,fresh:boolean):Config {
 const manifest=path.join(appRoot,'default-template.json');if(!existsSync(manifest))return config;
 const template=JSON.parse(readFileSync(manifest,'utf8'));
 // Never copy credentials, memories, permissions or histories from a template.
 if(fresh&&template.persona)config.persona={...config.persona,...template.persona};
 const local=template.localSpeech;if(!local)return config;
 const resolve=(relative:string)=>{if(typeof relative!=='string'||path.isAbsolute(relative))throw new Error('默认模板要求相对路径');const p=path.resolve(appRoot,relative),r=path.relative(appRoot,p);if(r.startsWith('..')||path.isAbsolute(r))throw new Error('模板路径越界');return p;};
 const install=resolve(local.installPath),python=resolve(local.pythonPath),gpt=resolve(local.gptModelPath),sovits=resolve(local.sovitsModelPath),reference=resolve(local.referenceAudioPath);
 if(![path.join(install,'api_v2.py'),python,gpt,sovits,reference].every(existsSync))return config;
 const c=config.speech.gptSovits;
 if(fresh||!c.installPath||!existsSync(c.installPath)){
  Object.assign(c,{installPath:install,pythonPath:python,gptModelPath:gpt,sovitsModelPath:sovits,referenceAudioPath:reference,device:'auto',enabled:true,language:'ja',promptLanguage:'ja',promptText:'',auxReferenceAudioPaths:[]});
  if(fresh){config.speech.outputMode='gpt-sovits';config.speech.replyEnabled=true;}
 }
 return config;
}
