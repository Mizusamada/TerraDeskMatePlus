// @ts-nocheck
export class VoiceRecorder {
 stream=null;recorder=null;chunks=[];timer=null;
 constructor(public onSaved,public onStatus){}
 async start(){if(this.recorder?.state==='recording')return;this.stream=await navigator.mediaDevices.getUserMedia({audio:{echoCancellation:true,noiseSuppression:false,autoGainControl:false},video:false});this.chunks=[];try{this.recorder=new MediaRecorder(this.stream,{mimeType:'audio/webm'});}catch(e){this.stream.getTracks().forEach(t=>t.stop());throw e;}this.recorder.ondataavailable=e=>{if(e.data.size)this.chunks.push(e.data);};this.recorder.onstop=async()=>{clearTimeout(this.timer);this.stream?.getTracks().forEach(t=>t.stop());const bytes=new Uint8Array(await new Blob(this.chunks,{type:'audio/webm'}).arrayBuffer());this.onStatus('录音已停止，正在保存本机源音频…');try{const r=await window.petApi.saveRecording(bytes);this.onSaved(r.path);this.onStatus('原始语调录音已保存在本机，不做语音识别。');}catch(e){this.onStatus(e.message);}};this.recorder.start(250);this.timer=setTimeout(()=>this.stop(),60000);this.onStatus('正在录音（最多60秒）。保留你的原始语调/停顿；不会调用LLM/ASR。');}
 stop(){if(this.recorder?.state==='recording')this.recorder.stop();}
}
