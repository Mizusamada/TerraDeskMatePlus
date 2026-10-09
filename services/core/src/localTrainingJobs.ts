import {existsSync,readFileSync,writeFileSync,mkdirSync,appendFileSync} from 'node:fs';
import {spawn,type ChildProcess} from 'node:child_process';
import {createHash,randomUUID} from 'node:crypto';
import path from 'node:path';
import type {Config} from './config.js';
import type {VoiceTrainingProfile} from './voiceTraining.js';
/** Real optimizer process ownership is separate from DPAPI/chat/window state. Only fixed application scripts can execute. */
export class LocalVoiceTrainingJobs {
 private child:ChildProcess|null=null;
 constructor(private dir:string,private scriptRoot:string){}
 private roleDir(role:string){return path.join(this.dir,'training-jobs','role-'+createHash('sha256').update(role).digest('hex').slice(0,16));}
 status(role:string){const base=this.roleDir(role),pointer=path.join(base,'active-job.json');if(!existsSync(pointer))return null;const job=JSON.parse(readFileSync(pointer,'utf8'));const output=path.resolve(base,job.id);if(path.relative(base,output).startsWith('..'))throw Error('训练任务路径无效');const file=path.join(output,'job-status.json');if(!existsSync(file))return null;const result=JSON.parse(readFileSync(file,'utf8'));if(result.roleId!==role)throw Error('训练产物角色归属不一致');return result;}
 async start(c:Config,profile:VoiceTrainingProfile){
  if(this.child&&this.child.exitCode===null)throw Error('已有本机训练正在运行；禁止同时占用同一GPU。');
  if(!profile.samples.length||!profile.datasetListPath||!existsSync(profile.datasetListPath))throw Error('请先导出当前角色的准确原文/音频训练清单。');
  const python=c.speech.gptSovits.pythonPath||path.join(c.speech.gptSovits.installPath,'env','python.exe'),script=path.join(this.scriptRoot,'train-role.py');
  if(!existsSync(python)||!existsSync(script))throw Error('缺少本机Python或应用训练脚本；未下载/启动训练。');
  // A new job gets a new directory: old feature caches/checkpoints must not silently replace changed training data.
  const id=randomUUID(),base=this.roleDir(profile.roleId),output=path.join(base,id);mkdirSync(output,{recursive:true});writeFileSync(path.join(base,'active-job.json'),JSON.stringify({id,roleId:profile.roleId}));const request={installPath:c.speech.gptSovits.installPath,outputDir:output,roleId:profile.roleId,samples:profile.samples,baseGptModelPath:profile.baseGptModelPath||c.speech.gptSovits.gptModelPath,baseSovitsModelPath:profile.baseSovitsModelPath||c.speech.gptSovits.sovitsModelPath,gptEpochs:4,sovitsEpochs:8,batchSize:2,stageTimeoutSeconds:1800};
  const file=path.join(output,'request.json'),log=path.join(output,'runner.log');writeFileSync(file,JSON.stringify(request,null,2),'utf8');
  const child=spawn(python,[script,'--request',file],{windowsHide:true,cwd:this.scriptRoot,env:{...process.env,PYTHONUTF8:'1',PYTHONIOENCODING:'utf-8'}});this.child=child;
  child.stdout?.on('data',b=>appendFileSync(log,b));child.stderr?.on('data',b=>appendFileSync(log,b));child.once('exit',()=>{if(this.child===child)this.child=null;});child.once('error',e=>{appendFileSync(log,e.message);if(this.child===child)this.child=null;});
  await new Promise<void>((resolve,reject)=>{child.once('spawn',()=>resolve());child.once('error',reject);});return {id,roleId:profile.roleId,status:'running',outputDir:output,logPath:log,startedAt:new Date().toISOString()};
 }
 /** Stop only the owned process tree; other Python/TTS apps are never killed. */
 stop(){const child=this.child;if(!child?.pid||child.exitCode!==null)return {stopped:false};if(process.platform==='win32')spawn('taskkill.exe',['/PID',String(child.pid),'/T','/F'],{windowsHide:true});else child.kill();this.child=null;return {stopped:true};}
}
