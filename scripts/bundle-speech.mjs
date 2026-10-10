import {mkdirSync,readdirSync,statSync,existsSync,copyFileSync,readFileSync,writeFileSync} from 'node:fs';
import {cp} from 'node:fs/promises';import {spawn} from 'node:child_process';import path from 'node:path';import {root}from './launch.mjs';
import {defaultPersona} from '../packages/contracts/src/index.ts';
const source='D:/ai/GPT-SoVITS',delivery=process.env.TERRA_DELIVERY_DIR||path.join(root,'release','Amiya-MVP'),target=path.join(delivery,'resources','app'),runtime=path.join(target,'speech-runtime','GPT-SoVITS');
if(!existsSync(path.join(source,'env','python.exe')))throw new Error('缺少提供的语音环境');mkdirSync(runtime,{recursive:true});
async function directory(src,dst,exclusions=[]){mkdirSync(dst,{recursive:true});await new Promise((resolve,reject)=>{const args=[src,dst,'/E','/MT:8','/R:1','/W:1','/NFL','/NDL','/NJH','/NJS','/NP','/XF','*.pyc','*.log','/XD','__pycache__',...exclusions];const child=spawn('robocopy.exe',args,{windowsHide:true});let text='';child.stdout.on('data',b=>text+=b);child.stderr.on('data',b=>text+=b);child.on('error',reject);child.on('close',n=>n<8?resolve():reject(new Error('copy failed '+n+' '+text.slice(-1000))));});}
console.log('正在复制独立Python环境（不复制聊天、密钥、旧训练TEMP数据）…');
await directory(path.join(source,'env'),path.join(runtime,'env'));
await directory(path.join(source,'GPT_SoVITS'),path.join(runtime,'GPT_SoVITS'),[path.join(source,'GPT_SoVITS','pretrained_models')]);
await directory(path.join(source,'tools'),path.join(runtime,'tools'));
for(const f of ['api_v2.py','webui.py','config.py','LICENSE','requirements.txt','README.md'])if(existsSync(path.join(source,f)))copyFileSync(path.join(source,f),path.join(runtime,f));
const models=path.join(source,'GPT_SoVITS','pretrained_models'),modelsOut=path.join(runtime,'GPT_SoVITS','pretrained_models');mkdirSync(modelsOut,{recursive:true});
for(const d of ['chinese-roberta-wwm-ext-large','chinese-hubert-base','gsv-v2final-pretrained','g2pw-chinese','fast_langdetect'])await directory(path.join(models,d),path.join(modelsOut,d));
// Retain only the v2 configuration actually selected, not unrelated large v3/v4 weights.
const config={custom:{version:'v2',device:'cpu',is_half:false,bert_base_path:'GPT_SoVITS/pretrained_models/chinese-roberta-wwm-ext-large',cnhuhbert_base_path:'GPT_SoVITS/pretrained_models/chinese-hubert-base',t2s_weights_path:'GPT_SoVITS/pretrained_models/gsv-v2final-pretrained/s1bert25hz-5kh-longer-epoch=12-step=369668.ckpt',vits_weights_path:'GPT_SoVITS/pretrained_models/gsv-v2final-pretrained/s2G2333k.pth'}};
writeFileSync(path.join(runtime,'GPT_SoVITS','configs','tts_infer.yaml'),JSON.stringify(config,null,2));
// Reference is application-bundled original audio. Inference-only default, not falsely labelled as fine-tuned.
const speechRoot='speech-runtime/GPT-SoVITS';const manifest={version:1,id:'amiya-caster-japanese',description:'阿米娅默认模板：Spine模型、完整角色卡、中日原声、预训练v2参考合成（未额外微调）。',persona:defaultPersona,localSpeech:{installPath:speechRoot,pythonPath:speechRoot+'/env/python.exe',gptModelPath:speechRoot+'/'+config.custom.t2s_weights_path,sovitsModelPath:speechRoot+'/'+config.custom.vits_weights_path,referenceAudioPath:'dist/assets/builtin/干员语音/Amiya/cn_003.mp3',device:'auto',language:'ja',promptText:''},privacy:{includesApiKeys:false,includesChatHistory:false,includesUserMemories:false}};
writeFileSync(path.join(target,'default-template.json'),JSON.stringify(manifest,null,2));
writeFileSync(path.join(target,'speech-runtime','README.txt'),'Windows x64本机默认语音运行包。完整独立环境及选定预训练v2模型来自Mizu提供路径；使用自动CPU/CUDA，其他电脑须具备可用Windows运行环境。未包含私人云端密钥、聊天记录或训练TEMP。不是训练完成的新声线。安装移动位置由应用解析相对路径。','utf8');
console.log('语音模板复制完成：'+runtime);

