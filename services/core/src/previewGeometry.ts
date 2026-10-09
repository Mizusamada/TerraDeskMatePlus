// Preview-only aliases: native pet collision/contact remains on the established measureBody contract.
import {standbyAnimationName} from './desktopPolicy.js';
import {bodySlot,measureBody} from './bodyGeometry.js';
import {visibleSkeletonBounds} from './visibleBounds.js';
const excluded=/weapon|staff|sword|shield|fx|effect|annex|shadow|ear/i;
const feet=/(?:^|_)(?:foot|feet|shoes?|boots?|heels?|hooves?|hoof|xie(?:zi)?|wheel)(?:_|\d|$)/i;
export const previewBodySlot=(name:string)=>!excluded.test(name)&&(bodySlot(name)||/(?:^|_)(?:bigleg|smallleg|thigh|shin|shoes?|boots?|feet|heel|hoof|xiaotui|datui|xie(?:zi)?|kua|shangti|xiasheng|chassis|wheel)(?:_|\d|$)/i.test(name));
function bounds(sk:any,match:(name:string)=>boolean){
 // Hide only for the measurement and restore in finally, so no authored part disappears from rendering.
 const held:any[]=[];try{for(const slot of sk.slots)if(slot.attachment&&!match(slot.data.name)){held.push([slot,slot.attachment]);slot.attachment=null;}
 const vector=()=>({x:0,y:0,set(x:number,y:number){this.x=x;this.y=y;return this;}}),o=vector(),s=vector();visibleSkeletonBounds(sk,o,s);return{left:o.x,right:o.x+s.x,bottom:o.y,top:o.y+s.y,width:s.x,height:s.y};
 }finally{for(const [slot,attachment]of held)slot.attachment=attachment;}
}
export function measurePreviewBody(sk:any){
 let body=bounds(sk,previewBodySlot);if(!Number.isFinite(body.height)||body.height<=0)return measureBody(sk);
 // Beagle's Shoes are feet, not a prop. Missing them previously normalized head-to-waist as full height.
 const sole=bounds(sk,name=>!excluded.test(name)&&feet.test(name)),bottom=Number.isFinite(sole.bottom)?sole.bottom:body.bottom;
 return{...body,bottom,height:Math.max(1,body.top-bottom),source:'body-slots'};
}

// A large authored accessory gets more drawable space, not a smaller character. The surrounding preview may scroll.
export const PREVIEW_SIZE={width:420,height:460,bodyHeight:280,footInset:48};
export function previewFrame(bodyHeight:number,targetHeight:number,envelope:{left:number;right:number;top:number;bottom:number}){
 const scale=targetHeight/bodyHeight,padding=14;
 const left=Math.ceil(Math.max(PREVIEW_SIZE.width/2,envelope.left*scale+padding));
 const right=Math.ceil(Math.max(PREVIEW_SIZE.width/2,envelope.right*scale+padding));
 const top=Math.ceil(Math.max(PREVIEW_SIZE.height-PREVIEW_SIZE.footInset,envelope.top*scale+padding));
 const bottom=Math.ceil(Math.max(PREVIEW_SIZE.footInset,envelope.bottom*scale+padding));
 return{width:left+right,height:top+bottom,anchor:{x:left,y:bottom},scale};
}

// Some authors use Idle_A/Idle_B for ordinary forms. Exact ordinary idle still wins over skill/summon prefixes.
export function previewStandbyName(names:string[]){return standbyAnimationName(names)??names.find(name=>/^(?:idle|relax|stand|rest)[_-][a-z]$/i.test(name))??names.find(name=>!/^default$|die|death|start/i.test(name));}
