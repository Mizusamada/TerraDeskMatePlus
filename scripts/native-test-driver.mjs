import {spawn} from 'node:child_process';
import {chromium} from 'playwright';
import WebSocket from 'ws';
/** Native Electron + CDP adapter used only by isolated tests. No app/renderer monkey patching,
 * synthetic model clocks, GPU disabling, production profile, or source-copy into delivery folders. */
export async function launchNative(runtime,executablePath,env,timeout=90000){
 const child=spawn(executablePath,['--inspect=0','--remote-debugging-port=0',runtime],{env,stdio:['ignore','pipe','pipe'],windowsHide:true});
 let log='';const endpoints=await new Promise((resolve,reject)=>{
  const deadline=setTimeout(()=>reject(Error('native launch endpoints timeout: '+log)),timeout);
  child.once('exit',code=>{clearTimeout(deadline);reject(Error('native exit '+code+': '+log));});
  child.stderr.on('data',data=>{log+=data;const node=log.match(/Debugger listening on (ws:\/\/[^\s]+)/),browser=log.match(/DevTools listening on (ws:\/\/[^\s]+)/);if(node&&browser){clearTimeout(deadline);resolve({node:node[1],browser:browser[1]});}});
 });
 const ws=new WebSocket(endpoints.node);await new Promise((r,j)=>{ws.once('open',r);ws.once('error',j)});
 let id=0;const requests=new Map();ws.on('message',data=>{const v=JSON.parse(data.toString());const job=requests.get(v.id);if(job){requests.delete(v.id);v.error?job.reject(Error(JSON.stringify(v.error))):job.resolve(v.result);}});
 const evaluate=async(fn,arg)=>{
  const key=++id;const result=await new Promise((resolve,reject)=>{requests.set(key,{resolve,reject});ws.send(JSON.stringify({id:key,method:'Runtime.evaluate',params:{expression:`(${fn.toString()})(process.getBuiltinModule('module').createRequire(process.execPath)('electron'),${JSON.stringify(arg)??'undefined'})`,awaitPromise:true,returnByValue:true}}));});
  if(result.exceptionDetails)throw Error(JSON.stringify(result.exceptionDetails));return result.result.value;
 };
 const browser=await chromium.connectOverCDP(endpoints.browser,{timeout});
 return {windows:()=>browser.contexts()[0].pages(),firstWindow:async()=>{for(let i=0;i<timeout/100;i++){const p=browser.contexts()[0].pages()[0];if(p)return p;await new Promise(r=>setTimeout(r,100));}throw Error('no control page');},evaluate,close:async()=>{await evaluate(({app})=>{app.quit();return true;}).catch(()=>{});ws.close();await browser.close().catch(()=>{});child.kill();},process:()=>child,logs:()=>log};
}
