class PcmCollector extends AudioWorkletProcessor {
  constructor(){super();this.values=[];this.ratio=sampleRate/16000;this.phase=0;}
  process(inputs){
    const a=inputs[0]?.[0];if(!a)return true;
    for(let i=0;i<a.length;i++){
      this.phase+=1;
      if(this.phase>=this.ratio){this.phase-=this.ratio;this.values.push(a[i]);}
      if(this.values.length===3200){this.port.postMessage(new Float32Array(this.values));this.values=[];}
    }
    return true;
  }
}
registerProcessor('pcm-collector',PcmCollector);
