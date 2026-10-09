import {existsSync,mkdirSync,readdirSync}from'node:fs';import path from'node:path';import{spawn}from'node:child_process';import{randomUUID}from'node:crypto';import type{Config}from'./config.js';
// Contract verified against official RVC infer/cli.py, commit 81eed5e8f68b6bed1789f682fe78cdd324495afc.
// There is intentionally NO ASR or TTS fallback: this route preserves source prosody rather than re-reading text.
export async function convertVoice(c:Config,input:string,dir:string,signal:AbortSignal){return convertSeed(c,input,dir,signal);}

export function seedArguments(v:Config['voiceChanger'],input:string,output:string){
 const args=[path.join(v.installPath,'inference.py'),'--source',input,'--target',v.referenceAudioPath,'--output',output,'--diffusion-steps',String(v.diffusionSteps),'--length-adjust','1.0','--inference-cfg-rate','0.7','--f0-condition','True','--auto-f0-adjust','False','--semi-tone-shift',String(v.pitch),'--fp16','True'];
 if(v.modelPath)args.push('--checkpoint',v.modelPath);if(v.configPath)args.push('--config',v.configPath);return args;
}
async function convertSeed(c:Config,input:string,dir:string,signal:AbortSignal){
 const v={...c.voiceChanger,referenceAudioPath:c.voiceChanger.referenceAudioPath||c.speech.gptSovits.referenceAudioPath};
 if(!v.installPath||!existsSync(path.join(v.installPath,'inference.py'))||!v.pythonPath||!existsSync(v.pythonPath))throw new Error('零样本Seed-VC需要其独立环境及inference.py；不需要角色RVC权重。当前未配置，没有调用TTS冒充。');
 if(!existsSync(input)||!existsSync(v.referenceAudioPath))throw new Error('需输入录音和角色参考音频，直接语音转换，不重读文字。');
 if(!v.allowModelDownload&&(!v.modelPath||!v.configPath))throw new Error('请配置Seed-VC通用F0模型及配置，或明确允许首次下载通用权重；不会擅自下载。');
 if(v.modelPath&&!existsSync(v.modelPath)||v.configPath&&!existsSync(v.configPath))throw new Error('Seed-VC通用模型或配置路径不存在');
 const output=path.join(dir,'converted','seed-'+randomUUID());mkdirSync(output,{recursive:true});
 await new Promise<void>((resolve,reject)=>{const child=spawn(v.pythonPath,seedArguments(v,input,output),{cwd:v.installPath,windowsHide:true,signal,env:{...process.env,PYTHONIOENCODING:'utf-8',...(!v.allowModelDownload?{HF_HUB_OFFLINE:'1',TRANSFORMERS_OFFLINE:'1'}:{})}});let error='';child.stderr?.on('data',b=>error+=b);const timer=setTimeout(()=>{child.kill();reject(new Error('Seed-VC处理180秒超时，已停止；没有TTS回退。'));},180000);child.on('error',e=>{clearTimeout(timer);reject(e);});child.on('close',code=>{clearTimeout(timer);code===0?resolve():reject(new Error('Seed-VC转换失败：'+error.slice(-1800)));});});
 const file=readdirSync(output).find(f=>f.endsWith('.wav'));if(!file)throw new Error('Seed-VC未产生可播放WAV');return {path:path.join(output,file),sourceProsodyRequested:true,engine:'Seed-VC',f0Condition:true,automaticF0Adjustment:false,lengthAdjustment:1,pitch:v.pitch,qualityNeedsListening:true};
}
