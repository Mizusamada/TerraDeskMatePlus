// Build optional per-role voice packages in a NEW candidate directory. The base
// app keeps all models/original voices but omits 41 separate optimizer-free pairs.
// Directory artifacts are not called final until import/restart/timbre gates pass.
import fs from 'node:fs';import path from 'node:path';import {createHash}from'node:crypto';
const root=path.resolve('assets/builtin'),source=JSON.parse(fs.readFileSync(path.join(root,'trained-voices/index.json'),'utf8'));
const requested=process.argv.find(a=>a.startsWith('--role='))?.slice(7),roles=source.roles.filter(r=>!requested||r.roleId===requested);
if(!roles.length)throw Error('requested role has no real bundled weight pair');
const release=path.resolve('release');fs.mkdirSync(release,{recursive:true});const out=fs.mkdtempSync(path.join(release,'VoiceExtensions-Candidate-'));
const sha=b=>createHash('sha256').update(b).digest('hex'),report=[];
for(const row of roles){const slug='role-'+sha(Buffer.from(row.roleId)).slice(0,16),folder=path.join(out,slug);fs.mkdirSync(folder);
 const inside=rel=>{if(path.isAbsolute(rel))throw Error('absolute source');const file=path.resolve(root,rel),r=path.relative(root,file);if(r.startsWith('..')||path.isAbsolute(r)||!fs.existsSync(file))throw Error('invalid source');return file;};
 // Copy only final inference weights, not logs, CUDA, optimizer checkpoints or private data.
 for(const [name,rel]of [['gpt.ckpt',row.gpt],['sovits.pth',row.sovits]])fs.copyFileSync(inside(rel),path.join(folder,name));
 const samples=row.samples.map(sample=>{if(!sample.audio.startsWith('干员语音/'+row.roleId+'/'))throw Error('foreign sample');return {...sample,audio:'builtin:'+sample.audio};});
 fs.writeFileSync(path.join(folder,'dataset.json'),JSON.stringify(samples,null,2));
 fs.writeFileSync(path.join(folder,'voice-profile.json'),JSON.stringify({schemaVersion:1,roleId:row.roleId,displayName:row.displayName,status:'trained_unverified',gpt:'gpt.ckpt',sovits:'sovits.pth',dataset:'dataset.json',samples,humanValidation:'not_run'},null,2));
 const files=fs.readdirSync(folder).sort().map(name=>{const b=fs.readFileSync(path.join(folder,name));return {path:name,sizeBytes:b.length,sha256:sha(b)};});
 const size=files.reduce((n,f)=>n+f.sizeBytes,0),manifest={schemaVersion:1,roleId:row.roleId,displayName:row.displayName,kind:'voice-model',version:'0.3.0',source:'managed',installSizeBytes:size,downloadSizeBytes:size,sha256:sha(Buffer.from(JSON.stringify(files))),files,includes:['current-role-final-GPT','current-role-final-SoVITS','unverified-training-metadata'],excludes:['optimizer','feature-cache','user-settings','secrets','chat-history','bundled-base-resources']};
 fs.writeFileSync(path.join(folder,'manifest.json'),JSON.stringify(manifest,null,2));report.push({roleId:row.roleId,folder,sizeBytes:size,manifestSha256:manifest.sha256,formalValidation:false});
 console.log('VOICE EXTENSION CANDIDATE',row.roleId,size);
}
fs.writeFileSync(path.join(out,'候选清单.json'),JSON.stringify({date:new Date().toISOString(),status:'candidate-not-final-delivery',roles:report,sourceFilesModified:false},null,2));
console.log(JSON.stringify({out,roles:report.length,bytes:report.reduce((n,r)=>n+r.sizeBytes,0)}));
