export interface Rect {x:number;y:number;width:number;height:number}
export function floorFor(pet:Rect,area:Rect,edges:Rect[],margin=0){
 let floor=area.y+area.height-pet.height-margin;
 const foot=pet.y+pet.height;
 for(const w of edges){const overlap=pet.x+pet.width*.65>w.x&&pet.x+pet.width*.35<w.x+w.width;if(overlap&&foot<=w.y+3&&w.y<=area.y+area.height-margin&&w.y>=area.y)floor=Math.min(floor,w.y-pet.height);}
 return floor;
}
/** RISK: native DIP support meets body geometry. Snap only physical feet near a top, never a whole transparent canvas.
 * Three DIP below the top cover native rounding; a deliberate downward drag must pass through instead of teleporting upward.
 * Choose the nearest eligible top, so z-order and pointer position cannot pull a pet to an unrelated window.
 */
export function windowLanding(pet:Rect,area:Rect,edges:Rect[],margin=0):Rect|undefined{
 const foot=pet.y+pet.height,bottom=area.y+area.height-margin;
 let nearest:Rect|undefined,distance=Infinity;
 for(const edge of edges){
  const overlap=pet.x+pet.width*.65>edge.x&&pet.x+pet.width*.35<edge.x+edge.width;
  const delta=Math.abs(foot-edge.y);
  if(overlap&&edge.y>=area.y&&edge.y<bottom&&foot<=edge.y+3&&delta<=12&&delta<distance){nearest=edge;distance=delta;}
 }
 return nearest;
}
export function walkStep(x:number,direction:number,min:number,max:number,speed=1.3){
 if(max<=min)return {x:min,direction:1};
 // Only reverse when travelling into an edge. Do not flip direction for an existing overshoot every frame.
 let d=direction<0?-1:1;
 if(x<=min&&d<0)d=1;else if(x>=max&&d>0)d=-1;
 return {x:Math.max(min,Math.min(max,x+d*speed)),direction:d};
}
export function chooseRandomAction<T extends {name:string}>(actions:T[],previous='',random=Math.random):T|undefined {
 const eligible=actions.filter(a=>!/^default$|^die$|^start$|_begin$|_end$/i.test(a.name));
 const alternate=eligible.filter(a=>a.name!==previous);
 const pool=alternate.length?alternate:eligible;
 return pool[Math.min(pool.length-1,Math.floor(random()*pool.length))];
}
