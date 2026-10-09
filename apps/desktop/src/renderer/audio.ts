// RMS-based endpoint detection is local; transcription is still performed by Tencent.
export class VadTracker {
  lastVoice: number; started: number; heard = false;
  constructor(public threshold:number,public silenceMs:number,public maxMs:number,now=Date.now()){this.started=now;this.lastVoice=now;}
  accept(rms:number,now=Date.now()) {
    if(rms>=this.threshold){this.heard=true;this.lastVoice=now;}
    return now-this.started>=this.maxMs || (this.heard && now-this.lastVoice>=this.silenceMs) || (!this.heard && now-this.started>=Math.min(10000,this.maxMs));
  }
}
export function pcm16(samples:Float32Array):Uint8Array {
  const output=new Uint8Array(samples.length*2),v=new DataView(output.buffer);
  samples.forEach((s,i)=>v.setInt16(i*2,Math.round(Math.max(-1,Math.min(1,s))*(s<0?32768:32767)),true));
  return output;
}
