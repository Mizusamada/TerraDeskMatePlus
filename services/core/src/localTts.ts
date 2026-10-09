import { spawn, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, appendFileSync } from 'node:fs';
import path from 'node:path';
import {userInfo,homedir} from 'node:os';
import {localTtsThreadEnvironment} from './localTtsRuntimePolicy.js';
import type { Config } from './config.js';
export class LocalTts {
  child:ChildProcess|null=null;
  constructor(private dir:string){}
  async start(config:Config) {
    if(this.child&&!this.child.killed)return {message:'本软件的语音进程已在运行。若仍在启动，请稍候再试听。'};
    const c=config.speech.gptSovits;
    if(!c.installPath||!existsSync(path.join(c.installPath,'api_v2.py')))throw new Error('安装目录必须包含 api_v2.py；请先安装完整 GPT-SoVITS 包。未下载模型或训练。');
    const python=[c.pythonPath,path.join(c.installPath,'runtime','python.exe'),path.join(c.installPath,'env','python.exe'),path.join(c.installPath,'env','Scripts','python.exe'),path.join(c.installPath,'.venv','Scripts','python.exe'),path.join(c.installPath,'venv','Scripts','python.exe')].find(p=>p&&existsSync(p));
    if(!python)throw new Error('未找到包内 Python，请填写已装 torch 与模型依赖的 Python 路径。');
    // Windows CPU transformer loads crash in the supplied native runtime when copying state across many OpenMP threads. A bounded thread count preserves CUDA availability and avoids editing the shared environment.
    const pythonDir=path.dirname(python);const runtimeEnv={...process.env,USERNAME:process.env.USERNAME||userInfo().username,USERPROFILE:process.env.USERPROFILE||homedir(),TORCHINDUCTOR_CACHE_DIR:path.join(this.dir,'torch-cache'),PATH:[path.join(pythonDir,'Library','bin'),path.join(pythonDir,'Scripts'),process.env.PATH||''].join(path.delimiter),...localTtsThreadEnvironment(c.device,process.env),PYTHONIOENCODING:'utf-8'};
    const u=new URL(c.apiUrl);if(u.protocol!=='http:'||!['127.0.0.1','localhost','[::1]'].includes(u.hostname))throw new Error('本地 API 只允许 localhost HTTP。');
    try{const r=await fetch(u.origin+'/openapi.json',{signal:AbortSignal.timeout(1000)});const j:any=await r.json();if(r.ok&&j.paths?.['/tts'])return {message:'检测到已有本机GPT-SoVITS API，直接使用；不会启动重复进程，也不会停止它。'};}catch{}
    const configFile=path.join(c.installPath,'GPT_SoVITS','configs','tts_infer.yaml');if(!existsSync(configFile))throw new Error('缺少 GPT_SoVITS/configs/tts_infer.yaml');
    const port=Number(u.port||9880);if(!Number.isInteger(port)||port<1024||port>65535)throw new Error('本地 API 端口无效');
    mkdirSync(this.dir,{recursive:true});const owned=path.join(this.dir,'local-tts.yaml');const log=path.join(this.dir,'local-tts.log');
    const code=`import json,sys,yaml,torch\nc=yaml.safe_load(open(sys.argv[1],encoding='utf-8'))\navailable=torch.cuda.is_available()\nmode=sys.argv[3]\nassert mode!='cuda' or available, 'CUDA requested but unavailable'\ndevice='cuda' if mode=='cuda' or (mode=='auto' and available) else 'cpu'\nfor v in c.values():\n if isinstance(v,dict): v['device']=device; v['is_half']=device=='cuda'\nif sys.argv[4]: c.setdefault('custom',{})['t2s_weights_path']=sys.argv[4]\nif sys.argv[5]: c.setdefault('custom',{})['vits_weights_path']=sys.argv[5]\nyaml.safe_dump(c,open(sys.argv[2],'w',encoding='utf-8'),allow_unicode=True)\nprint(json.dumps({'device':device}))`;
    const probe=await new Promise<string>((resolve,reject)=>{const ch=spawn(python,['-c',code,configFile,owned,c.device,c.gptModelPath,c.sovitsModelPath],{cwd:c.installPath,windowsHide:true,env:runtimeEnv});let out='',err='';const timer=setTimeout(()=>{ch.kill();reject(new Error('Python / torch 检查30秒超时。'));},30000);ch.stdout?.on('data',b=>out+=b);ch.stderr?.on('data',b=>err+=b);ch.on('error',e=>{clearTimeout(timer);reject(e);});ch.on('close',n=>{clearTimeout(timer);n===0?resolve(out.trim()):reject(new Error('本地依赖检查失败：'+err.slice(-1500)));});});
    const device=JSON.parse(probe.split('\n').at(-1)||'{}').device;
    const bootstrap="import torch._dynamo,runpy,sys; sys.argv=['api_v2.py',*sys.argv[1:]]; runpy.run_path('api_v2.py',run_name='__main__')";
    const child=spawn(python,['-c',bootstrap,'-a','127.0.0.1','-p',String(port),'-c',owned],{cwd:c.installPath,windowsHide:true,env:runtimeEnv});this.child=child;
    child.stdout?.on('data',b=>appendFileSync(log,b));child.stderr?.on('data',b=>appendFileSync(log,b));child.on('error',e=>appendFileSync(log,e.message));child.once('exit',()=>{if(this.child===child)this.child=null;});
    await new Promise<void>((resolve,reject)=>{child.once('spawn',resolve);child.once('error',reject);});
    const deadline=Date.now()+60000;
    while(Date.now()<deadline){if(child.exitCode!==null)throw new Error(`服务启动失败（退出码 ${child.exitCode}）。日志：${log}`);try{const r=await fetch(`http://127.0.0.1:${port}/openapi.json`,{signal:AbortSignal.timeout(1000)});const j:any=await r.json();if(r.ok&&j.paths?.['/tts'])return {message:`GPT-SoVITS API 就绪，${device.toUpperCase()} 推理。试听验证音色。日志：${log}`};}catch{}await new Promise(r=>setTimeout(r,750));}
    this.stop();throw new Error(`启动60秒未就绪，已停止本软件子进程。请检查完整权重。日志：${log}`);
  }
  stop(){if(this.child&&!this.child.killed){this.child.kill();this.child=null;return {message:'已停止本软件启动的 GPT-SoVITS 子进程。'};}return {message:'没有本软件拥有的语音子进程；未终止其他 Python。'};}
}
