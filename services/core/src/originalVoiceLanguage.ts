// Original recording language is not the selected synthesis/output language.
// Consume only explicit own-role sample metadata; never infer from Chinese translated subtitles or directory presets.
import fs from 'node:fs';import path from 'node:path';
export function readOriginalVoiceCatalog(root:string):any{
 try{return JSON.parse(fs.readFileSync(path.join(root,'role-reference-catalog.json'),'utf8'));}catch{return {};}
}
export function originalVoiceMetadata(catalog:any,operatorId:string,filename:string){
 const audio='干员语音/'+operatorId+'/'+filename;
 for(const reference of Object.values(catalog.roles?.[operatorId]?.languages||{}) as any[]){
  const sample=reference.samples?.find((item:any)=>item.audio===audio);
  if(sample&&['ja','zh','en'].includes(sample.language))return{language:sample.language,text:sample.text||'',evidence:sample.transcriptSource||'role-reference-catalog'};
 }
 // Preserve legacy packages until their language is declared, but label the evidence as unverified rather than claiming detection.
 return{language:'ja',text:'',evidence:'legacy-unverified-default'};
}
export function originalVoicePaths(metadata:{language:string},nativePath:string,chinesePath=''){
 // A native Chinese file belongs under zh even if the reference-to-Japanese preset happened to point to it.
 const audioPaths:Record<string,string>={[metadata.language]:nativePath};if(chinesePath)audioPaths.zh=chinesePath;
 return{audioPaths,audioLanguages:Object.fromEntries(Object.keys(audioPaths).map(language=>[language,language])),languages:Object.keys(audioPaths)};
}
