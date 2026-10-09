// @ts-nocheck
import {existsSync,readFileSync,readdirSync,mkdirSync,copyFileSync,lstatSync,writeFileSync} from 'node:fs';
import path from 'node:path';import {randomUUID,createHash} from 'node:crypto';
import {readOriginalVoiceCatalog,originalVoiceMetadata,originalVoicePaths} from './originalVoiceLanguage.js';
import {measureBody,seatContact,deploymentHull} from './bodyGeometry.js';
import {visibleSkeletonBounds} from './visibleBounds.js';
import spine from '../../../apps/desktop/src/pet/vendor/spine-webgl.js';
import {compatibleAtlasNames,atlasDeclaredSizes} from './atlasScale.js';
import {nativeTextureFiles,battleTextureFiles} from './nativeTextures.js';
import {normalizeCharacterTemplate,validateCharacterTemplate} from './characterTemplate.js';

// Cache parsed Spine metadata across library rescans. The fingerprint includes skeleton and atlas bytes, so a changed asset can never reuse stale geometry.
const inspectCache=new Map<string,any>();

function cameraMetrics(data,full=true){
 const probe=new spine.Skeleton(data),idle=data.animations.find(a=>/^relax$|^idle$/i.test(a.name))||data.animations[0];
 function bounds(){probe.updateWorldTransform();const o=new spine.Vector2(),z=new spine.Vector2();visibleSkeletonBounds(probe,o,z);return {minX:o.x,minY:o.y,maxX:o.x+z.x,maxY:o.y+z.y};}
 probe.setToSetupPose();if(idle){const state=new spine.AnimationState(new spine.AnimationStateData(data));state.setAnimation(0,idle.name,false);state.apply(probe);}const rest=bounds();const body=measureBody(probe);body.hull=deploymentHull(probe);
 const idleHeight=Math.max(1,rest.maxY-rest.minY),originX=(rest.minX+rest.maxX)/2,originY=rest.minY;
 if(!full)return {body,bodyHeight:body.height,envelope:{left:Math.max(0,(rest.maxX-rest.minX)/Math.max(1,body.height)/2),right:Math.max(0,(rest.maxX-rest.minX)/Math.max(1,body.height)/2),top:Math.max(0,(rest.maxY-body.bottom)/Math.max(1,body.height)),bottom:Math.max(0,(body.bottom-rest.minY)/Math.max(1,body.height))},idleHeight,originX,originY,fitBounds:{minX:(rest.minX-originX)/idleHeight,minY:(rest.minY-originY)/idleHeight,maxX:(rest.maxX-originX)/idleHeight,maxY:(rest.maxY-originY)/idleHeight},bounds:{minX:(rest.minX-originX)/idleHeight,minY:(rest.minY-originY)/idleHeight,maxX:(rest.maxX-originX)/idleHeight,maxY:(rest.maxY-originY)/idleHeight}};
 let raw={minX:Infinity,minY:Infinity,maxX:-Infinity,maxY:-Infinity},maxWidth=rest.maxX-rest.minX,maxHeight=rest.maxY-rest.minY,envelope={left:0,right:0,top:0,bottom:0};
 for(const a of data.animations){probe.setToSetupPose();const state=new spine.AnimationState(new spine.AnimationStateData(data));state.setAnimation(0,a.name,false);const steps=Math.min(1200,Math.max(24,Math.ceil(a.duration*60)));
 for(let i=0;i<=steps;i++){state.update(i?a.duration/steps:0);state.apply(probe);const b=bounds();if(!Number.isFinite(b.minX)||b.maxX<=b.minX)continue;const frameBody=measureBody(probe),cx=(frameBody.left+frameBody.right)/2,contact=/^sit/i.test(a.name)?seatContact(probe):frameBody.bottom;envelope.left=Math.max(envelope.left,(cx-b.minX)/body.height);envelope.right=Math.max(envelope.right,(b.maxX-cx)/body.height);envelope.top=Math.max(envelope.top,(b.maxY-contact)/body.height);envelope.bottom=Math.max(envelope.bottom,(contact-b.minY)/body.height);if(/^start$|appear|spawn|entrance/i.test(a.name))continue;raw.minX=Math.min(raw.minX,b.minX);raw.minY=Math.min(raw.minY,b.minY);raw.maxX=Math.max(raw.maxX,b.maxX);raw.maxY=Math.max(raw.maxY,b.maxY);maxWidth=Math.max(maxWidth,b.maxX-b.minX);maxHeight=Math.max(maxHeight,b.maxY-b.minY);}}
 if(!Number.isFinite(raw.minX))raw=rest;
 return {body,bodyHeight:body.height,envelope,idleHeight,originX,originY,fitBounds:{minX:-maxWidth/idleHeight/2,minY:0,maxX:maxWidth/idleHeight/2,maxY:maxHeight/idleHeight},bounds:{minX:(raw.minX-originX)/idleHeight,minY:(raw.minY-originY)/idleHeight,maxX:(raw.maxX-originX)/idleHeight,maxY:(raw.maxY-originY)/idleHeight}};
}

export function inspectModel(file,fast=false){
 const stem=path.basename(file,path.extname(file)),dir=path.dirname(file),atlasPath=path.join(dir,stem+'.atlas');
 if(!existsSync(atlasPath))throw new Error('缺少同名atlas：'+stem);
 const atlasText=readFileSync(atlasPath,'utf8');const pageNames=atlasText.trim().split(/\r?\n\s*\r?\n/).map(b=>b.split(/\r?\n/)[0].trim());
 const images=pageNames.map(n=>{if(path.basename(n)!==n||!n.endsWith('.png'))throw new Error('图集页面只允许当前目录的PNG');const p=path.join(dir,n);if(!existsSync(p))throw new Error('缺少PNG：'+n);return p;});
 // Each page has its own coordinate system. Reusing the first page's size corrupts multipage mesh UV and trim geometry.
 const pageSizes=atlasDeclaredSizes(atlasText);
 const atlas=compatibleAtlasNames(new spine.TextureAtlas(atlasText,(name:string)=>({setFilters(){},setWraps(){},getImage(){return pageSizes[name]||{width:512,height:512};}}))),loader=new spine.AtlasAttachmentLoader(atlas);
 // Some official .skel files contain JSON, so inspect the bytes rather than routing by the suffix.
 const rawSkeleton=readFileSync(file),json=file.endsWith('.json')||rawSkeleton.toString('utf8',0,Math.min(rawSkeleton.length,32)).replace(/^\uFEFF/,'').trimStart().startsWith('{');
 let data;if(json){const input=JSON.parse(rawSkeleton.toString('utf8').replace(/^\uFEFF/,''));if(!input.skeleton?.spine?.startsWith('3.8'))throw new Error('首版自定义导入仅支持Spine3.8');data=new spine.SkeletonJson(loader).readSkeletonData(input);}else data=new spine.SkeletonBinary(loader).readSkeletonData(new Uint8Array(rawSkeleton));
 if(!data.version?.startsWith('3.8'))throw new Error('仅支持Spine3.8，不是Live2D或Spine4');
 return {name:stem,json,version:data.version,files:[file,atlasPath,...images],images:pageNames,camera:cameraMetrics(data,!fast),animations:data.animations.map(a=>({name:a.name,duration:a.duration})),skeletonSignature:{bones:data.bones.map((b:any)=>b.name),slots:data.slots.map((slot:any)=>slot.name)}};
}
export class AssetLibrary {
 files=new Map<string,string>();bundles:any[]=[];voices:any[]=[];profiles:any={};root='';renderIndex:any={};renderOverrides:any={};nativeTextures:any={};battleTextures:any={};modelCatalog:any={};
 // Keep each imported role tied to its own resource root; references/overlays must never resolve against Amiya's bundle.
 roleRoots=new Map<string,string>();
 resourceRootForRole(role:string){return this.roleRoots.get(role)||this.root||this.packagedRoot;}
 constructor(private packagedRoot:string,private dataDir:string){}
 scan(){
  this.files.clear();this.bundles=[];this.voices=[];this.profiles={};this.roleRoots.clear();
  this.root=this.packagedRoot;
  try{this.renderIndex=JSON.parse(readFileSync(path.join(this.root,'model-render-index.json'),'utf8')).models||{};}catch{this.renderIndex={};}
  // Startup uses a pre-audited metadata catalog for all bundled roles; a changed fingerprint falls back to live inspection.
  try{this.modelCatalog=JSON.parse(readFileSync(path.join(this.root,'model-catalog.json'),'utf8')).models||{};}catch{this.modelCatalog={};}
  // Pursuit-only texture overlays are loaded as a catalog; normal actions keep original files.
  try{this.renderOverrides=JSON.parse(readFileSync(path.join(this.root,'battle-texture-overrides','index.json'),'utf8')).entries||{};}catch{this.renderOverrides={};}
  // Native same-geometry overlays apply to ordinary actions as well as clicks; validation occurs per bundle in add().
  try{this.nativeTextures=JSON.parse(readFileSync(path.join(this.root,'native-textures','index.json'),'utf8')).entries||{};}catch{this.nativeTextures={};}
  // The ordinary battle route uses the same own-role native parts as pursuit, never an Interact substitute.
  try{this.battleTextures=JSON.parse(readFileSync(path.join(this.root,'all-role-battle-textures','index.json'),'utf8')).entries||{};}catch{this.battleTextures={};}
  const modelsRoot=path.join(this.root,'干员模型'),voicesRoot=path.join(this.root,'干员语音'),archiveRoot=path.join(this.root,'干员档案');
  if(existsSync(modelsRoot))for(const op of readdirSync(modelsRoot,{withFileTypes:true}).filter(d=>d.isDirectory())){const operatorId=op.name;this.roleRoots.set(operatorId,this.root);let meta:any={};try{const mf=path.join(modelsRoot,operatorId,'_meta.json');if(existsSync(mf))meta=JSON.parse(readFileSync(mf,'utf8'));}catch{}const operatorName=meta.name||operatorId;const voiceDir=path.join(voicesRoot,operatorId);let sample='';let archive='';try{const af=path.join(archiveRoot,operatorId);const f=existsSync(af)?readdirSync(af).find(x=>/\.txt$/i.test(x)):null;if(f)archive=readFileSync(path.join(af,f),'utf8').replace(/^\uFEFF/,'').slice(0,1800);}catch{}try{const lf=path.join(voiceDir,'语音列表.txt');if(existsSync(lf))sample=readFileSync(lf,'utf8').split(/\r?\n/).filter(x=>x&&!x.startsWith('#')).slice(0,3).map(x=>x.split('\t').slice(2).join('\t')).join(' ');}catch{}this.profiles[operatorId]={id:operatorId,name:operatorName,role:'明日方舟干员 · '+operatorName,legacyPersonality:'根据本地角色档案、语音记录和模型资源自动建立的独立角色卡。\n\n档案摘要：'+archive+'\n\n语音摘要：'+sample,personality:'根据本地角色档案、语音记录和模型资源自动建立的独立角色卡。\n\n档案摘要：'+archive.slice(0,850)+'\n\n语音摘要：'+sample.slice(0,350),speechHabits:'保持该角色原有语音的称呼、语气与节奏；用户可以在“人设与称呼”中继续编辑。'};const dir=path.join(modelsRoot,operatorId);for(const skin of readdirSync(dir,{withFileTypes:true}).filter(d=>d.isDirectory()))for(const view of ['基建','正面','背面','战斗']){const vd=path.join(dir,skin.name,view);if(!existsSync(vd))continue;for(const f of readdirSync(vd).filter(x=>x.endsWith('.skel')))this.add(path.join(vd,f),operatorName==='阿米娅'?skin.name:operatorName+' · '+skin.name,view==='基建'?'基建':'战斗',view,'',operatorId);}}
  const custom=path.join(this.dataDir,'models');if(existsSync(custom))for(const id of readdirSync(custom)){const d=path.join(custom,id);if(!lstatSync(d).isDirectory())continue;const templateFile=path.join(d,'character.json');if(existsSync(templateFile)){try{const template=JSON.parse(readFileSync(templateFile,'utf8'));if(validateCharacterTemplate(template).length===0)this.profiles[id]={id,name:template.displayName,role:template.role||'用户自定义角色',personality:template.description||'由统一角色模板生成的独立角色卡。',speechHabits:'保持当前角色自己的称呼、语气与节奏；用户可以继续编辑。'};}catch{}}for(const f of readdirSync(d).filter(x=>/\.(skel|json)$/.test(x)&&x!=='manifest.json'&&x!=='character.json'))this.add(path.join(d,f),this.profiles[id]?.name||'自定义 · '+path.basename(f,path.extname(f)),'自定义','正面',id,'custom');}const actionRoot=path.join(this.dataDir,'actions');
  // Imported actions stay in user data and are exposed as role-bound overlay bundles; the original model is never rewritten.
  if(existsSync(actionRoot))for(const id of readdirSync(actionRoot)){const d=path.join(actionRoot,id);if(!lstatSync(d).isDirectory())continue;try{const manifest=JSON.parse(readFileSync(path.join(d,'manifest.json'),'utf8'));const file=path.join(d,manifest.skeleton);if(manifest.kind==='action-overlay'&&existsSync(file)){const before=this.bundles.length;this.add(file,manifest.skin,manifest.group,'正面','',manifest.operatorId);const b=this.bundles.at(-1);if(this.bundles.length>before&&b){b.actionOverlay=true;b.importedActionNames=manifest.animationNames;b.actionImportId=id;b.actionTargetBundleId=manifest.targetBundleId;}}}catch{}}
  const originalCatalog=readOriginalVoiceCatalog(this.root);
  if(existsSync(voicesRoot))for(const op of readdirSync(voicesRoot,{withFileTypes:true}).filter(d=>d.isDirectory())){
   const operatorId=op.name,folder=path.join(voicesRoot,operatorId);let lines='';try{const lf=path.join(folder,'语音列表.txt');if(existsSync(lf))lines=readFileSync(lf,'utf8');}catch{}
   for(const f of readdirSync(folder).filter(x=>/\.mp3$/.test(x))){const line=lines.split(/\r?\n/).find(x=>x.startsWith(f+'\t'))?.split('\t');const id=operatorId==='Amiya'?path.basename(f,'.mp3'):operatorId+'_'+path.basename(f,'.mp3');const hasZh=existsSync(path.join(folder,'zh',f));this.files.set('voice/'+id+'/'+f,path.join(folder,f));this.voices.push({id,title:(this.profiles[operatorId]?.name||operatorId)+' · '+(line?.[1]||path.basename(f,'.mp3')),textZh:line?.slice(2).join('\t')||'',operatorId,audioPath:path.join(folder,f),...originalVoicePaths(originalVoiceMetadata(originalCatalog,operatorId,f),path.join(folder,f),hasZh?path.join(folder,'zh',f):''),language:originalVoiceMetadata(originalCatalog,operatorId,f).language,languageEvidence:originalVoiceMetadata(originalCatalog,operatorId,f).evidence});}
   const generated=path.join(folder,'generated','manifest.json');if(existsSync(generated)){try{for(const v of JSON.parse(readFileSync(generated,'utf8'))){const file=path.join(folder,'generated',v.file);if(!v.id||!existsSync(file))continue;const zh=v.chineseFile&&existsSync(path.join(folder,'generated',v.chineseFile))?path.join(folder,'generated',v.chineseFile):'';this.files.set('voice/'+operatorId+'/'+v.file,file);// Respect a generated manifest's explicit language; absence keeps the legacy default, never re-label a declared English/Chinese file.
this.voices.push({...v,operatorId,audioPath:file,...originalVoicePaths({language:['ja','zh','en'].includes(v.language)?v.language:'ja'},file,zh)});}}catch{}}
  }
  this.scanManagedBasePackages();
  for(const b of this.bundles){const related=this.bundles.filter(x=>x.customId?x.id===b.id:x.operatorId===b.operatorId&&x.skin===b.skin&&x.view!=='背面');const all=related.map(x=>x.camera.bounds);if(all.length){const common={minX:Math.min(...all.map(x=>x.minX)),minY:Math.min(...all.map(x=>x.minY)),maxX:Math.max(...all.map(x=>x.maxX)),maxY:Math.max(...all.map(x=>x.maxY))};const fit=related.map(x=>x.camera.fitBounds||x.camera.bounds);const fitBounds={minX:Math.min(...fit.map(x=>x.minX)),minY:Math.min(...fit.map(x=>x.minY)),maxX:Math.max(...fit.map(x=>x.maxX)),maxY:Math.max(...fit.map(x=>x.maxY))};const envelope={left:Math.max(...related.map(x=>x.camera.envelope?.left||0)),right:Math.max(...related.map(x=>x.camera.envelope?.right||0)),top:Math.max(...related.map(x=>x.camera.envelope?.top||0)),bottom:Math.max(...related.map(x=>x.camera.envelope?.bottom||0))};const layout={envelope,width:Math.max(...related.map(x=>{const f=x.camera.fitBounds||x.camera.bounds;return (f.maxX-f.minX)*x.camera.idleHeight/(x.camera.bodyHeight||x.camera.idleHeight);})),height:Math.max(...related.map(x=>{const f=x.camera.fitBounds||x.camera.bounds;return (f.maxY-f.minY)*x.camera.idleHeight/(x.camera.bodyHeight||x.camera.idleHeight);})),bodyWidth:Math.max(...related.map(x=>(x.camera.body?.width||200)/(x.camera.bodyHeight||x.camera.idleHeight)))};b.source.camera={...b.camera,bounds:common,fitBounds,deploymentLayout:layout};}}
  return this;
 }
 private scanManagedBasePackages(){
  const root=path.join(this.dataDir,'resource-packages','base');
  if(!existsSync(root))return;
  for(const entry of readdirSync(root,{withFileTypes:true}).filter(x=>x.isDirectory())){
   const packageDir=path.join(root,entry.name),manifestPath=path.join(packageDir,'manifest.json');
   try{
    if(!existsSync(manifestPath))continue;
    const manifest=JSON.parse(readFileSync(manifestPath,'utf8'));
    if(manifest.kind!=='base'||!manifest.roleId||this.bundles.some(b=>b.operatorId===manifest.roleId))continue;
    const content=[packageDir,path.join(packageDir,'assets'),path.join(packageDir,'content')].find(x=>existsSync(path.join(x,'干员模型')));
    if(!content)continue;
    const modelsRoot=path.join(content,'干员模型'),voicesRoot=path.join(content,'干员语音'),archiveRoot=path.join(content,'干员档案');
    const operatorDirs=readdirSync(modelsRoot,{withFileTypes:true}).filter(x=>x.isDirectory());
    const operator=operatorDirs.find(x=>x.name===manifest.roleId); if(!operator)continue;
    const operatorId=String(manifest.roleId),operatorDir=path.join(modelsRoot,operator.name),displayName=String(manifest.displayName||operator.name);
    this.roleRoots.set(operatorId,content);
    // Installed packages carry their own cached model/texture fingerprints; do not borrow builtin catalogs.
    const ownCatalog=(name:string,field:string)=>{try{return JSON.parse(readFileSync(path.join(content,name),'utf8'))[field]||{};}catch{return {};}};
    const resourceContext={root:content,modelCatalog:ownCatalog('model-catalog.json','models'),renderIndex:ownCatalog('model-render-index.json','models'),nativeTextures:ownCatalog('native-textures/index.json','entries'),battleTextures:ownCatalog('all-role-battle-textures/index.json','entries'),renderOverrides:ownCatalog('battle-texture-overrides/index.json','entries')};
    const characterFile=path.join(content,'character.json');let character:any={};try{character=JSON.parse(readFileSync(characterFile,'utf8'));}catch{}
    let archive='';try{const ad=path.join(archiveRoot,operator.name),f=existsSync(ad)?readdirSync(ad).find(x=>/\.txt$/i.test(x)):null;if(f)archive=readFileSync(path.join(ad,f),'utf8').slice(0,1800);}catch{}
    this.profiles[operatorId]={id:operatorId,name:displayName,role:'明日方舟干员 · '+displayName,personality:character.persona?.personality||'根据该角色资源包中的独立档案建立的角色卡。\n\n档案摘要：'+archive,speechHabits:character.persona?.speechHabits||'保持该角色自己的称呼、语气与节奏；用户可以继续编辑。'};
    for(const skin of readdirSync(operatorDir,{withFileTypes:true}).filter(x=>x.isDirectory()))for(const view of ['基建','正面','背面','战斗']){const viewDir=path.join(operatorDir,skin.name,view);if(!existsSync(viewDir))continue;for(const file of readdirSync(viewDir).filter(x=>/\.skel$/i.test(x)))this.add(path.join(viewDir,file),displayName+' · '+skin.name,view==='基建'?'基建':'战斗',view,'',operatorId,resourceContext);}
    const managedOriginalCatalog=readOriginalVoiceCatalog(content);
    const voiceDir=path.join(voicesRoot,operator.name);let lines='';try{lines=readFileSync(path.join(voiceDir,'语音列表.txt'),'utf8');}catch{}
    if(existsSync(voiceDir))for(const file of readdirSync(voiceDir).filter(x=>/\.mp3$/i.test(x))){const line=lines.split(/\r?\n/).find(x=>x.startsWith(file+'\t'))?.split('\t'),id=operatorId==='Amiya'?path.basename(file,'.mp3'):operatorId+'_'+path.basename(file,'.mp3'),audioPath=path.join(voiceDir,file),meta=originalVoiceMetadata(managedOriginalCatalog,operator.name,file),zh=path.join(voiceDir,'zh',file);this.files.set('voice/'+id+'/'+file,audioPath);this.voices.push({id,title:displayName+' · '+(line?.[1]||path.basename(file,'.mp3')),textZh:line?.slice(2).join('\t')||'',textJa:meta.language==='ja'?meta.text:'',operatorId,audioPath,...originalVoicePaths(meta,audioPath,existsSync(zh)?zh:''),language:meta.language,languageEvidence:meta.evidence});}
    // Generated role-owned recordings are part of a base pack, not a previous role's voice list.
    const generated=path.join(voiceDir,'generated','manifest.json');if(existsSync(generated))try{for(const v of JSON.parse(readFileSync(generated,'utf8'))){if(typeof v.file!=='string'||path.basename(v.file)!==v.file)continue;const file=path.join(voiceDir,'generated',v.file);if(!existsSync(file))continue;const zh=v.chineseFile&&path.basename(v.chineseFile)===v.chineseFile?path.join(voiceDir,'generated',v.chineseFile):'';this.files.set('voice/'+operatorId+'/'+v.file,file);this.voices.push({...v,operatorId,audioPath:file,...originalVoicePaths({language:['ja','zh','en'].includes(v.language)?v.language:'ja'},file,zh&&existsSync(zh)?zh:'')});}}catch{}

   }catch{}
  }
 }
 add(file,skin,group,view,customId,operatorId,context?:any){try{const resourceRoot=context?.root||this.root;const key=path.relative(resourceRoot,file).split(path.sep).join('/'),cached=(context?.renderIndex||this.renderIndex)[key],atlasFile=path.join(path.dirname(file),path.basename(file,path.extname(file))+'.atlas');const fingerprint=existsSync(atlasFile)?createHash('sha256').update(readFileSync(file)).update(readFileSync(atlasFile,'utf8')).digest('hex'):'';const textureMatches=cached&&Object.entries(cached.textures||{}).every(([name,t]:any)=>existsSync(path.join(path.dirname(file),name))&&createHash('sha256').update(readFileSync(path.join(path.dirname(file),name))).digest('hex')===t.sha256);const verified=cached?.fingerprint===fingerprint&&textureMatches?cached:null;const cacheKey=resourceRoot+'|'+key+'|'+fingerprint;let model=inspectCache.get(cacheKey);if(!model) {
    const catalog=(context?.modelCatalog||this.modelCatalog)[key];
    if(catalog?.fingerprint===fingerprint){model={...catalog,files:[file,atlasFile,...(catalog.images||[]).map((name:string)=>path.join(path.dirname(file),name))]};}
    else {
      // A changed or newly imported role uses the cheap idle-bound pass at startup; full animation envelopes belong to explicit audit scripts.
      model=inspectModel(file,!verified);
    }
    inspectCache.set(cacheKey,model);
   }if(verified?.camera?.body?.hull?.length)model.camera=verified.camera;else if(verified)model.camera=inspectModel(file).camera;const id=(customId?'custom-'+customId:'builtin-'+this.bundles.length);const native=customId?{}:nativeTextureFiles(resourceRoot,key,(context?.nativeTextures||this.nativeTextures)[key]);const textureMetadata={...verified?.textures};for(const f of model.files){const name=path.basename(f);this.files.set(id+'/'+name,native[name]?.file||f);if(native[name])textureMetadata[name]={...textureMetadata[name],premultipliedAlpha:native[name].premultipliedAlpha,sha256:native[name].sha256,nativeOverlay:true};}const battle=customId?undefined:battleTextureFiles(resourceRoot,key,(context?.battleTextures||this.battleTextures)[key]);if(battle){this.files.set(id+'/'+model.name+'.atlas',battle.atlas);this.files.set(id+'/'+model.images[0],battle.texture);textureMetadata[model.images[0]]={...textureMetadata[model.images[0]],premultipliedAlpha:battle.premultipliedAlpha,sha256:battle.sha256,battleOverlay:true};}this.bundles.push({...model,id,assetKey:key,resourceRoot,pursuitTextureEntry:context?.renderOverrides?.[key],skin,group,view,customId,operatorId,battleTextureOverlay:!!battle,nativeTextureOverlay:Object.keys(native).length>0,source:{baseUrl:'amiya-asset://local/'+id+'/',skeleton:path.basename(file),atlas:model.name+'.atlas',texture:model.images[0],textures:model.images,textureMetadata,json:!!model.json||file.endsWith('.json')}});}catch(e){if(customId)throw e;}}
  pursuitBundle(bundle:any){
   // Already improved ordinary battle models keep the exact same pixels during chase; the distinct ID still isolates route transitions.
   if(bundle?.battleTextureOverlay){const id='pursuit-'+bundle.id;for(const name of [bundle.source.skeleton,bundle.source.atlas,...(bundle.source.textures||[bundle.source.texture])])this.files.set(id+'/'+name,this.files.get(bundle.id+'/'+name));return {...bundle,id,source:{...bundle.source,baseUrl:'amiya-asset://local/'+id+'/'}};}
   // The chase path receives a distinct asset id, so the same role/skin can switch back to its original atlas for every other action.
   const resourceRoot=bundle?.resourceRoot||this.root;const entry=bundle?.pursuitTextureEntry||this.renderOverrides?.[bundle?.assetKey];if(!entry||bundle?.customId)return bundle;
   // Imported overlay paths must remain inside that role's installed root, even when their JSON is externally supplied.
   const references=[entry.atlas,...Object.values(entry.textures||{})];if(references.some((rel:any)=>typeof rel!=='string'||path.isAbsolute(rel)||path.relative(resourceRoot,path.resolve(resourceRoot,rel)).startsWith('..')))return bundle;
   const source=entry.source||{},skeleton=path.join(resourceRoot,bundle.assetKey),atlas=path.join(path.dirname(skeleton),path.basename(skeleton,path.extname(skeleton))+'.atlas');
   if(!existsSync(skeleton)||!existsSync(atlas))return bundle;
   const sourceHash=(file:string)=>createHash('sha256').update(readFileSync(file)).digest('hex');
   if(source.skeletonSha256!==sourceHash(skeleton)||source.atlasSha256!==sourceHash(atlas)||!existsSync(path.join(resourceRoot,entry.atlas)))return bundle;
   const id='pursuit-'+bundle.id;for(const name of [bundle.source.skeleton,bundle.source.atlas,...(bundle.source.textures||[bundle.source.texture])]){const relative=name===bundle.source.atlas?entry.atlas:entry.textures?.[name];this.files.set(id+'/'+name,relative?path.join(resourceRoot,relative):this.files.get(bundle.id+'/'+name)||'');}
   return {...bundle,id,source:{...bundle.source,baseUrl:'amiya-asset://local/'+id+'/',textureMetadata:{...bundle.source.textureMetadata,[bundle.source.texture]:{premultipliedAlpha:!!entry.replacement?.premultipliedAlpha}}}};
  }
 selected(c){
  const id=c.assets.customId;
  if(id&&!id.startsWith('operator:'))return this.bundles.find(b=>b.customId===id)||this.bundles[0];
  const operatorId=id?.startsWith('operator:')?id.slice(9):'Amiya';
  const available=this.bundles.filter(b=>b.operatorId===operatorId&&!b.customId&&b.view!=='背面');
  return available.find(b=>b.skin===c.ui.selectedSkin&&b.group===c.assets.group)
   ||available.find(b=>b.skin===c.ui.selectedSkin)
   ||available.find(b=>b.group===c.assets.group)
   ||available[0]||this.bundles[0];
 }
 actions(c){const selected=this.selected(c);if(!selected)return [];return this.bundles.filter(b=>selected.customId?b.id===selected.id||b.actionTargetBundleId===selected.id:b.operatorId===selected.operatorId&&b.skin===selected.skin&&b.view!=='背面').flatMap(b=>{const source=b.actionOverlay?b.animations.filter((a:any)=>b.importedActionNames?.includes(a.name)):b.animations;return source.map(a=>({...a,id:b.id+':'+a.name,bundleId:b.id,group:b.group,label:b.group+' · '+a.name,imported:!!b.actionOverlay,importId:b.actionImportId||''}));});}
 importActionFolder(folder,target){
  // Only a complete Spine3.8 overlay with the same bone/slot signature is accepted. This avoids corrupting the shared renderer.
  if(!path.isAbsolute(folder)||!existsSync(folder))throw new Error('请选择动作资源文件夹');
  if(!target?.bundleId||!target?.operatorId||!target?.skin)throw new Error('当前角色模型信息不完整，无法绑定动作');
  const candidates=readdirSync(folder).filter((n:string)=>/\.(skel|json)$/i.test(n)&&n!=='manifest.json'&&n!=='character.json');
  if(candidates.length!==1)throw new Error('动作包必须只包含一个 Spine 骨骼文件');
  const file=path.join(folder,candidates[0]), imported=inspectModel(file,true), targetBundle=this.bundles.find((b:any)=>b.id===target.bundleId);
  if(!targetBundle)throw new Error('目标角色模型不存在或已切换，请重新打开动作设置');
  const same=(x:any[],y:any[])=>JSON.stringify([...(x||[])].sort())===JSON.stringify([...(y||[])].sort());
  if(!same(imported.skeletonSignature?.bones,targetBundle.skeletonSignature?.bones)||!same(imported.skeletonSignature?.slots,targetBundle.skeletonSignature?.slots))throw new Error('动作包骨骼与当前角色不兼容：骨骼或插槽名称不一致');
  const animationNames=imported.animations.map((a:any)=>a.name).filter((n:string)=>n.length<=120&&!/^default$/i.test(n));
  if(!animationNames.length)throw new Error('动作包没有可导入的有效动画');if(!imported.animations.some((a:any)=>/^(relax|idle|stand)$/i.test(a.name)))throw new Error('动作包必须包含 Relax、Idle 或 Stand 待机动作，确保播放后能安全回待机');
  for(const f of imported.files){const stat=lstatSync(f);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>64*1024*1024)throw new Error('拒绝符号链接、目录或超过64MiB的动作资源');}
  const id=randomUUID(),dest=path.join(this.dataDir,'actions',id);mkdirSync(dest,{recursive:true});for(const f of imported.files)copyFileSync(f,path.join(dest,path.basename(f)));
  writeFileSync(path.join(dest,'manifest.json'),JSON.stringify({schemaVersion:1,kind:'action-overlay',importedAt:new Date().toISOString(),sourceFolder:folder,skeleton:path.basename(file),animationNames,operatorId:target.operatorId,skin:target.skin,group:'自定义',targetBundleId:target.bundleId},null,2),'utf8');
  this.scan();return {id,animationNames,operatorId:target.operatorId,skin:target.skin,group:'自定义'};
 }
 importFolder(folder){
  if(!path.isAbsolute(folder)||!existsSync(folder))throw new Error('请选择完整模型文件夹');
  const candidates=readdirSync(folder).filter(n=>/\.(skel|json)$/i.test(n)&&n!=='manifest.json');if(!candidates.length)throw new Error('文件夹应包含同名 .skel或.json、.atlas、PNG');
  const file=path.join(folder,candidates[0]),m=inspectModel(file),id=randomUUID(),target=path.join(this.dataDir,'models',id);
  for(const f of m.files){const stat=lstatSync(f);if(stat.isSymbolicLink()||!stat.isFile()||stat.size>64*1024*1024)throw new Error('拒绝链接或过大资源');}
  mkdirSync(target,{recursive:true});for(const f of m.files)copyFileSync(f,path.join(target,path.basename(f)));
  writeFileSync(path.join(target,'manifest.json'),JSON.stringify({importedAt:new Date().toISOString(),name:m.name,version:m.version,source:folder},null,2));const template=normalizeCharacterTemplate({id,displayName:'自定义 · '+m.name,kind:'custom',bundleIds:['custom-'+id],skin:'自定义 · '+m.name,actionNames:m.animations.map((a:any)=>a.name),actionGroups:Object.fromEntries(m.animations.map((a:any)=>[a.name,'自定义'])),modelVersion:m.version,importedAt:new Date().toISOString()});const templateErrors=validateCharacterTemplate(template);template.audit.missing=[...templateErrors];writeFileSync(path.join(target,'character.json'),JSON.stringify(template,null,2));this.scan();return this.bundles.find(b=>b.customId===id);
 }
}





