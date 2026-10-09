import {modelCapability,type ModelCapability} from './modelCatalog.js';
/** Model discovery sends only an authenticated GET, never chat/image contents, redirects, or secrets in errors. */
export async function fetchModelCatalog(base:string,key:string,signal?:AbortSignal){
 const {completionUrl}=await import('./llm.js');const u=new URL(completionUrl(base));u.pathname=u.pathname.replace(/chat\/completions$/,'models');
 const r=await fetch(u,{headers:key?{Authorization:'Bearer '+key}:{},signal:signal?AbortSignal.any([signal,AbortSignal.timeout(12000)]):AbortSignal.timeout(12000),redirect:'error'});
 if(!r.ok)throw Error('模型目录HTTP '+r.status+'；未自动重试，也没有发起对话推理。');
 const text=await r.text();if(text.length>2*1024*1024)throw Error('模型目录过大');const j=JSON.parse(text);if(!Array.isArray(j.data))throw Error('服务商未提供兼容的data模型列表；请手工输入模型ID。');
 const capabilities=j.data.slice(0,500).map((raw:any)=>modelCapability(raw,base));return {models:capabilities.map((m:ModelCapability)=>m.id),capabilities,message:'连接成功（目录不等于推理已验证）'};
}
