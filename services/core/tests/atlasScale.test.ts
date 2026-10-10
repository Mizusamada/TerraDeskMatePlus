// Verify with the actual bundled Spine runtime: string-only tests missed mesh UV and trim regressions.
// @ts-nocheck
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
import spine from '../../../apps/desktop/src/pet/vendor/spine-webgl.js';
import {atlasDeclaredSizes,nativeAtlasTexture} from '../src/atlasScale.js';
const text=['tex.png','size: 600,400','format: RGBA8888','filter: Linear,Linear','repeat: none','part','  rotate: false','  xy: 60,40','  size: 120,80','  orig: 160,120','  offset: 20,15','  index: -1',''].join('\n');
function texture(w,h){return {getImage:()=>({width:w,height:h}),setFilters(){},setWraps(){},bind(){return 'bound';},unbind(){},dispose(){}};}
function attachments(region){const r=new spine.RegionAttachment('part');r.width=160;r.height=120;r.setRegion(region);r.updateOffset();const m=new spine.MeshAttachment('part');m.region=region;m.regionUVs=new Float32Array([0,0,1,0,1,1,0,1]);m.updateUVs();return {offset:[...r.offset],uvs:[...m.uvs]};}
test('native downscaled storage preserves exact region geometry and trimmed mesh UVs',()=>{
 const baseline=new spine.TextureAtlas(text,()=>texture(600,400));const gpu=texture(400,200);
 const adapted=nativeAtlasTexture(gpu,atlasDeclaredSizes(text)['tex.png']);
 const atlas=new spine.TextureAtlas(text,()=>adapted);
 assert.deepEqual(attachments(atlas.regions[0]),attachments(baseline.regions[0]));
 assert.equal(adapted.bind(),'bound');assert.equal(gpu.getImage().width,400,'native storage was not resized');
});
test('rotated regions retain UV orientation and trim placement at native resolution',()=>{
 const rotated=text.replace('rotate: false','rotate: true');
 const baseline=new spine.TextureAtlas(rotated,()=>texture(600,400));
 const actual=new spine.TextureAtlas(rotated,()=>nativeAtlasTexture(texture(368,268),{width:600,height:400}));
 assert.deepEqual(attachments(actual.regions[0]),attachments(baseline.regions[0]));
});
test('matching native texture remains the same GPU object',()=>{const t=texture(512,512);assert.equal(nativeAtlasTexture(t,{width:512,height:512}),t);});
test('12F bundled preview has the exact authored geometry and UVs with native PNG storage',()=>{
 const base='assets/builtin/干员模型/12F/12F-原皮/基建/build_char_009_12fce';
 const atlasText=fs.readFileSync(base+'.atlas','utf8'),png=fs.readFileSync(base+'.png'),size=atlasDeclaredSizes(atlasText);
 const make=(native)=>{const atlas=new spine.TextureAtlas(atlasText,name=>native?nativeAtlasTexture(texture(png.readUInt32BE(16),png.readUInt32BE(20)),size[name]):texture(size[name].width,size[name].height));const data=new spine.SkeletonBinary(new spine.AtlasAttachmentLoader(atlas)).readSkeletonData(new Uint8Array(fs.readFileSync(base+'.skel')));return data.defaultSkin.getAttachments().map(x=>({name:x.name,vertices:x.attachment.vertices?[...x.attachment.vertices]:null,offset:x.attachment.offset?[...x.attachment.offset]:null,uvs:x.attachment.uvs?[...x.attachment.uvs]:null}));};
 assert.deepEqual(make(true),make(false));
});
