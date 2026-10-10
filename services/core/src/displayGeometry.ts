/** Shared display contract for Spine characters and enemy units.
 * Geometry is measured from visible attachments at runtime; transparent canvas margins,
 * weapons and effects never define the normalized body height.
 */
export interface DisplayEnvelope { left:number; right:number; top:number; bottom:number; }
export interface DisplayTarget { bodyHeight:number; centerX:number; contactY:number; }
export function finitePositive(value:number,fallback:number){return Number.isFinite(value)&&value>0?value:fallback;}
export function targetScale(bodyHeight:number,targetBodyHeight:number,canvasWidth:number,canvasHeight:number,envelope:DisplayEnvelope,padding=6,anchor?:{x:number;y:number}){
  const desired=targetBodyHeight>0?targetBodyHeight/bodyHeight:Math.min(canvasHeight*.72,canvasWidth*.9)/bodyHeight;
  // Envelope fields are measured in the skeleton's authored units across every frame.
  // Keep the scale comparison in that same unit system so large effects cannot clip.
  const safeWidth=(canvasWidth-padding*2)/Math.max(1,envelope.left+envelope.right);
  const safeHeight=(canvasHeight-padding*2)/Math.max(1,envelope.top+envelope.bottom);
  // Centered windows have independent room above/below/left/right of their anchor.
  // A bottom-heavy effect can fit the total height yet extend off the bottom edge.
  const sideLimits=anchor?[
    envelope.left>0?(anchor.x-padding)/envelope.left:Infinity,
    envelope.right>0?(canvasWidth-anchor.x-padding)/envelope.right:Infinity,
    envelope.top>0?(canvasHeight-anchor.y-padding)/envelope.top:Infinity,
    envelope.bottom>0?(anchor.y-padding)/envelope.bottom:Infinity,
  ]:[];
  return Math.max(.01,Math.min(desired,safeWidth,safeHeight,...sideLimits));
}
export function anchoredOffset(body:any,target:DisplayTarget,scale:number,anchor?:{x:number;y:number}){
  const cx=(body.left+body.right)/2, contact=body.bottom;
  return {x:(anchor?.x??target.centerX)-cx, y:(anchor?.y??target.contactY)-contact};
}
// A zero/invalid authored transition must not poison the one fixed camera shared
// by every later action. Reject invalid measurements without manufacturing a pose.
export function extendFrameEnvelope(envelope:DisplayEnvelope,body:{left:number;right:number},visible:{x:number;y:number;width:number;height:number},contact:number):boolean{
 if(![body.left,body.right,visible.x,visible.y,visible.width,visible.height,contact].every(Number.isFinite)||visible.width<=0||visible.height<=0||body.right<body.left)return false;
 const cx=(body.left+body.right)/2;
 envelope.left=Math.max(envelope.left,cx-visible.x);
 envelope.right=Math.max(envelope.right,visible.x+visible.width-cx);
 envelope.top=Math.max(envelope.top,visible.y+visible.height-contact);
 envelope.bottom=Math.max(envelope.bottom,contact-visible.y);
 return true;
}

/** Verified catalogs already sampled every action. Convert their body-relative envelope once,
 * rather than blocking the renderer by replaying thousands of geometry probes on each action-group swap.
 * Imported/incomplete profiles still use the runtime measured fallback. */
export function cameraEnvelope(profile:any,sourceScale=1):DisplayEnvelope|null {
 const height=Number(profile?.bodyHeight),e=profile?.envelope;
 if(!Number.isFinite(height)||height<=0||!Number.isFinite(sourceScale)||sourceScale<=0||!e)return null;
 if(!['left','right','top','bottom'].every(k=>Number.isFinite(e[k])&&e[k]>=0)||e.top<=0)return null;
 return {left:e.left*height*sourceScale,right:e.right*height*sourceScale,top:e.top*height*sourceScale,bottom:e.bottom*height*sourceScale};
}
