// @ts-nocheck
import { createHmac } from 'node:crypto';
import WebSocket from 'ws';
export function signAsr(c:{appId:string;secretId:string;engine:string},secret:string,voice:string,timestamp=Math.floor(Date.now()/1000),nonce=String(Math.floor(Math.random()*1e8))){
 const params:any={engine_model_type:c.engine,expired:timestamp+3600,filter_dirty:0,filter_modal:0,filter_punc:0,needvad:1,nonce,secretid:c.secretId,timestamp,voice_format:1,voice_id:voice};
 const query=Object.keys(params).sort().map(k=>`${k}=${params[k]}`).join('&');const target=`asr.cloud.tencent.com/asr/v2/${c.appId}`;
 const signature=createHmac('sha1',secret).update(target+'?'+query).digest('base64');return 'wss://'+target+'?'+query+'&signature='+encodeURIComponent(signature);
}
export class AsrSession{
 ws:any; closed=false;ready=false;timer:any;finalTimer:any;
 constructor(c:any,key:string,private send:(x:any)=>void){if(!c.enabled||!/^\d+$/.test(c.appId)||!c.secretId||!key)throw new Error('请启用并填写腾讯 AppID / SecretID / SecretKey');this.ws=new WebSocket(signAsr({...c,engine:c.engine||'16k_zh'},key,crypto.randomUUID()));this.timer=setTimeout(()=>this.stop(),Math.min(120000,c.maxRecordingMs)+15000);this.ws.on('message',(data:any)=>{let j:any;try{j=JSON.parse(data.toString());}catch{return;}if(j.code!==0){this.send({type:'error',message:`腾讯识别错误 ${j.code}：检查账号、识别语言/权限/额度`});this.close();return;}if(!this.ready){this.ready=true;this.send({type:'ready'});}if(j.result)this.send({type:'result',text:j.result.voice_text_str||'',sentence:j.result.index,final:j.result.slice_type===2});if(j.final===1){this.send({type:'ended'});this.close();}});this.ws.on('error',()=>{if(!this.closed)this.send({type:'error',message:'腾讯识别连接失败；未自动重试，请检查网络和凭据'});this.close();});this.ws.on('close',()=>{if(!this.closed){this.send({type:'ended'});this.close();}});}
 write(bytes:Uint8Array){if(!this.closed&&this.ready&&this.ws.readyState===1&&bytes.byteLength<=64000){if(this.ws.bufferedAmount>256000){this.send({type:'error',message:'识别网络积压，已停止以控制费用'});this.close();return;}this.ws.send(Buffer.from(bytes));}}
 stop(){if(this.closed)return;if(this.ws.readyState===1){this.ws.send(JSON.stringify({type:'end'}));if(!this.finalTimer)this.finalTimer=setTimeout(()=>{this.send({type:'ended'});this.close();},5000);}else this.close();}
 close(){this.closed=true;clearTimeout(this.timer);clearTimeout(this.finalTimer);this.ws.terminate();}
}