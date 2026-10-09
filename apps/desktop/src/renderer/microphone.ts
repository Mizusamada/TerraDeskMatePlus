// @ts-nocheck
import { VadTracker,pcm16 } from './audio.js';
const api=window.petApi;
export class Microphone {
  active=false;ending=false;context=null;stream=null;processor=null;sessionId=null;sentences=new Map();partial='';timer=null;vad=null;
  constructor(public settings,public events){
    api.on('asr:message',m=>{
      if(m.sessionId!==this.sessionId)return;
      if(m.type==='result'){
        this.sentences.set(m.sentence??0,m.text);this.partial=[...this.sentences.entries()].sort((a,b)=>a[0]-b[0]).map(x=>x[1]).join('');this.events.text(this.partial);
      }else if(m.type==='ended'){
        const text=this.partial.trim();this.cleanup();this.events.state('识别结束');if(text)this.events.complete(text);else this.events.error('没有识别到有效语音，未调用 LLM。');
      }else if(m.type==='error'){this.cleanup();this.events.error(m.message);}
    });
  }
  async start(config,flags){
    if(this.active)return;
    if(!config.enabled||!config.appId||!config.secretId||!flags.tencentSecretKey)throw new Error('请先在语音系统启用腾讯识别并保存三项凭据。');
    this.settings=config;this.partial='';this.sentences.clear();this.ending=false;
    try{
      this.stream=await navigator.mediaDevices.getUserMedia({audio:{channelCount:1,echoCancellation:true,noiseSuppression:true,autoGainControl:false},video:false});
      this.context=new AudioContext();await this.context.audioWorklet.addModule('./pcm-worklet.js');
      this.processor=new AudioWorkletNode(this.context,'pcm-collector');
      const source=this.context.createMediaStreamSource(this.stream);source.connect(this.processor);this.processor.connect(this.context.destination);
      const response=await api.startAsr();this.sessionId=response.sessionId;this.active=true;
      this.vad=new VadTracker(config.volumeThreshold,config.silenceMs,config.maxRecordingMs);
      this.processor.port.onmessage=e=>{
        if(!this.active||this.ending)return;
        const a=e.data;const rms=Math.sqrt(a.reduce((n,x)=>n+x*x,0)/a.length);this.events.level(rms);api.sendPcm(pcm16(a));
        if(this.vad.accept(rms))void this.finish();
      };
      this.timer=setTimeout(()=>void this.finish(),config.maxRecordingMs);
      this.events.state('录音中 · 等待说话');
    }catch(e){this.cleanup();await api.cancelAsr();throw e;}
  }
  async finish(){if(!this.active||this.ending)return;this.ending=true;this.stopTracks();this.events.state('正在收尾识别…');await api.stopAsr();}
  async cancel(){this.cleanup();await api.cancelAsr();this.events.state('麦克风已关闭');}
  stopTracks(){clearTimeout(this.timer);this.processor?.disconnect();this.stream?.getTracks().forEach(t=>t.stop());void this.context?.close();this.context=null;this.stream=null;this.processor=null;}
  cleanup(){this.stopTracks();this.active=false;this.ending=false;this.sessionId=null;}
}
