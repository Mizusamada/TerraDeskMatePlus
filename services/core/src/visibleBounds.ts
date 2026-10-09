/** Geometry used for hit regions and camera fitting must match visible draw slots.
 * Spine 3.8 getBounds includes fully transparent, off-stage effect attachments. */
export function visibleSkeletonBounds(skeleton:any,offset:any,size:any){
 const hidden:Array<{slot:any;attachment:any}>=[];
 try{
  for(const slot of skeleton.slots){if(slot.attachment&&slot.color.a*(slot.attachment.color?.a??1)<=0.001){hidden.push({slot,attachment:slot.attachment});slot.attachment=null;}}
  skeleton.getBounds(offset,size);
 }finally{for(const {slot,attachment} of hidden)slot.attachment=attachment;}
 // Fully invisible transition frames still need a finite camera, not Infinity/NaN.
 if(!Number.isFinite(offset.x)||!Number.isFinite(offset.y)||!Number.isFinite(size.x)||!Number.isFinite(size.y))skeleton.getBounds(offset,size);
}
