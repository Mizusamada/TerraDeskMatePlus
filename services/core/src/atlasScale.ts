/** Native PNG storage and authored atlas geometry have separate coordinate systems.
 * RISK: Spine 3.8 uses getImage().width for BOTH UVs and trimmed attachment geometry.
 * Scaling only packed size/xy shrinks region attachments and sends mesh UVs into neighbours.
 * Expose the authored page dimensions to Spine while binding the unchanged native GPU texture.
 * No bitmap interpolation, skeleton rewrite, orig/offset rounding or source file mutation occurs.
 */
export function atlasDeclaredSizes(text:string):Record<string,{width:number;height:number}>{
 const pages:Record<string,{width:number;height:number}>={};
 for(const page of text.trim().split(/\r?\n\s*\r?\n/)){
  const lines=page.split(/\r?\n/),name=lines[0].trim();
  const match=page.match(/^size:\s*(\d+)\s*,\s*(\d+)/m);
  if(match)pages[name]={width:Number(match[1]),height:Number(match[2])};
 }
 return pages;
}
export function nativeAtlasTexture(texture:any,size:{width:number;height:number}|undefined):any{
 const image=texture.getImage();
 if(!size||(image.width===size.width&&image.height===size.height))return texture;
 if(size.width<1||size.height<1||size.width>8192||size.height>8192)throw Error('纹理图集尺寸异常');
 // Delegating the GPU methods preserves the exact texture lifetime and binding; only
 // the pixel-coordinate metadata seen by the atlas/mesh readers is virtualized.
 return {
  getImage:()=>({width:size.width,height:size.height}),
  setFilters:(...args:any[])=>texture.setFilters(...args),
  setWraps:(...args:any[])=>texture.setWraps(...args),
  bind:(...args:any[])=>texture.bind(...args),
  unbind:(...args:any[])=>texture.unbind(...args),
  dispose:()=>texture.dispose(),
 };
}
/** A few authored skeleton paths have trailing spaces while TextureAtlasReader trims
 * region names. Exact lookup always wins; trim fallback stays inside this one atlas.
 */
export function compatibleAtlasNames(atlas:any):any{
 const find=atlas.findRegion.bind(atlas);
 atlas.findRegion=(name:string)=>find(name)||(typeof name==='string'&&name.trim()!==name?find(name.trim()):null);
 return atlas;
}
