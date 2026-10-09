import type {Config} from './config.js';
/** Safe local budgets are distinct from provider capacity; never raise costs to the model's maximum silently. */
export interface ModelCapability {id:string;name:string;contextWindow:number|null;maxOutputTokens:number|null;vision:boolean|null;source:'catalog'|'official'|'unknown';}
export const modelPreferenceKey=(base:string,model:string)=>{const u=new URL(base);return u.origin+u.pathname.replace(/\/+$/,'')+'::'+model;};
const bounded=(value:unknown)=>Number.isInteger(value)&&Number(value)>=64&&Number(value)<=2000000?Number(value):null;
/** Only explicit model metadata or exact official aliases establish capabilities; names alone cannot prove vision support. */
export function modelCapability(raw:any,base:string):ModelCapability {
 const id=typeof raw==='string'?raw:raw?.id;if(typeof id!=='string'||!id.trim()||id.length>250)throw Error('模型目录含无效ID');
 const modalities=raw?.input_modalities??raw?.architecture?.input_modalities;
 const result:ModelCapability={id,name:typeof raw?.name==='string'?raw.name.slice(0,250):id,contextWindow:bounded(raw?.context_window??raw?.context_length??raw?.max_model_len),maxOutputTokens:bounded(raw?.max_output_tokens??raw?.top_provider?.max_completion_tokens),vision:Array.isArray(modalities)?modalities.includes('image'):null,source:typeof raw==='object'?'catalog':'unknown'};
 if(new URL(base).hostname==='api.deepseek.com'&&['deepseek-flash','deepseek-v4-flash','deepseek-v4-flash-vision-exp','deepseek-v4-pro'].includes(id)){
  // Exact aliases confirmed from official /models schema and pricing page on 2026-10-07; live catalog values take precedence.
  result.contextWindow??=1000000;result.maxOutputTokens??=393216;result.vision??=id!=='deepseek-v4-pro';if(result.source==='unknown')result.source='official';
 }
 return result;
}
/** Store per-endpoint/model manual preferences instead of mixing limits when providers or models change. */
export function selectModelSettings(current:Config['llm'],base:string,model:string,cap:ModelCapability,preferences:Record<string,any>={}){
 const saved=preferences[modelPreferenceKey(base,model)];const seed=saved||{maxContextTokens:Math.min(cap.contextWindow||4096,16384),maxOutputTokens:Math.min(cap.maxOutputTokens||1024,cap.id==='deepseek-v4-pro'?2048:1024),visionEnabled:false};
 let output=Math.max(64,Math.min(cap.maxOutputTokens||32768,Number(seed.maxOutputTokens)||1024,32768));
 let context=Math.max(512,Math.min(cap.contextWindow||1048576,Number(seed.maxContextTokens)||4096,1048576));
 if(output>=context)output=Math.max(64,Math.min(output,context-256));
 return {...current,baseUrl:base,model,maxContextTokens:context,maxOutputTokens:output,visionEnabled:cap.vision===false?false:!!seed.visionEnabled};
}
