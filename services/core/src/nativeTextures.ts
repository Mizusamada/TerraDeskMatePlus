/** Immutable same-skeleton/same-atlas native texture overlay. Source pixels and bones stay read-only.
 * Invalid, stale or foreign entries are ignored, so installing optional resources cannot break the base renderer.
 */
import {existsSync,readFileSync} from 'node:fs';import path from 'node:path';import {createHash} from 'node:crypto';
const sha=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
export interface NativeTextureEntry{sourceSkeletonSha256:string;sourceAtlasSha256:string;textures:Record<string,{path:string;sha256:string;premultipliedAlpha:boolean;width:number;height:number}>}
export function nativeTextureFiles(root:string,key:string,entry:NativeTextureEntry|undefined):Record<string,{file:string;premultipliedAlpha:boolean;sha256:string}> {
 if(!entry)return {};
 const within=(rel:string)=>{if(path.isAbsolute(rel))throw Error('absolute native texture path');const file=path.resolve(root,rel),relative=path.relative(root,file);if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('native texture path escapes root');return file;};
 try{
  const skeleton=within(key),atlas=within(key.replace(/\.skel$/i,'.atlas'));
  if(!existsSync(skeleton)||!existsSync(atlas)||sha(skeleton)!==entry.sourceSkeletonSha256||sha(atlas)!==entry.sourceAtlasSha256)return {};
  const result:Record<string,{file:string;premultipliedAlpha:boolean;sha256:string}>={};
  for(const [name,texture]of Object.entries(entry.textures)){
   if(path.basename(name)!==name||!name.endsWith('.png'))return {};
   const file=within(texture.path);if(!existsSync(file)||sha(file)!==texture.sha256)return {};
   const bytes=readFileSync(file);if(bytes.length<26||bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a'||bytes.readUInt32BE(16)!==texture.width||bytes.readUInt32BE(20)!==texture.height)return {};
   result[name]={file,premultipliedAlpha:texture.premultipliedAlpha===true,sha256:texture.sha256};
  }
  return result;
 }catch{return {};}
}
/** Battle repacking is allowed only after all animations have equal original geometry.
 * Both source/replacement bytes are verified so stale or foreign candidates cannot enter any action route.
 */
export function battleTextureFiles(root:string,key:string,entry:any):{atlas:string;texture:string;premultipliedAlpha:boolean;sha256:string}|undefined{
 if(!entry||entry.geometryMaxDelta!==0)return;
 const within=(rel:string)=>{if(typeof rel!=='string'||path.isAbsolute(rel))throw Error('invalid battle texture path');const file=path.resolve(root,rel),r=path.relative(root,file);if(r.startsWith('..')||path.isAbsolute(r))throw Error('battle texture path escapes root');return file;};
 try{
  const skeleton=within(key),atlas=within(key.replace(/\.skel$/i,'.atlas')),png=within(key.replace(/\.skel$/i,'.png'));
  if(![skeleton,atlas,png].every(existsSync))return;
  if(sha(skeleton)!==entry.source.skeletonSha256||sha(atlas)!==entry.source.atlasSha256||sha(png)!==entry.source.textureSha256)return;
  const textureName=path.basename(png),replacementAtlas=within(entry.atlas),replacementPng=within(entry.textures?.[textureName]);
  if(!existsSync(replacementAtlas)||!existsSync(replacementPng)||sha(replacementAtlas)!==entry.replacement.atlasSha256||sha(replacementPng)!==entry.replacement.textureSha256)return;
  return {atlas:replacementAtlas,texture:replacementPng,premultipliedAlpha:entry.replacement.premultipliedAlpha===true,sha256:entry.replacement.textureSha256};
 }catch{return;}
}
