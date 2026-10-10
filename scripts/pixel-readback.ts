// Readback rectangle is conservatively bounded by the rendered attachment envelope.
// Padding retains rasterization-edge pixels; invalid bounds request a full-canvas scan.
// This saves local CPU/RAM without removing any animation/frame checks or screenshots.
export function pixelReadbackRect(width:number,height:number,bounds?:{x:number;y:number;width:number;height:number}|null,padding=3){
 if(!bounds||![bounds.x,bounds.y,bounds.width,bounds.height].every(Number.isFinite)||bounds.width<0||bounds.height<0)return {x:0,y:0,width,height};
 const x=Math.max(0,Math.min(width,Math.floor(bounds.x)-padding));
 const y=Math.max(0,Math.min(height,Math.floor(bounds.y)-padding));
 const right=Math.max(x,Math.min(width,Math.ceil(bounds.x+bounds.width)+padding));
 const top=Math.max(y,Math.min(height,Math.ceil(bounds.y+bounds.height)+padding));
 return {x,y,width:right-x,height:top-y};
}
