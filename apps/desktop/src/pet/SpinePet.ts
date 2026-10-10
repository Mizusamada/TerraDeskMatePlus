// @ts-nocheck
import spine from './vendor/spine-webgl.js';
import {measureBody,seatContact,deploymentHull,pointInPolygon} from '../../../../services/core/src/bodyGeometry.js';
import {measurePreviewBody,previewFrame,previewStandbyName} from '../../../../services/core/src/previewGeometry.js';
import {visibleSkeletonBounds} from '../../../../services/core/src/visibleBounds.js';
import {targetScale,extendFrameEnvelope,cameraEnvelope} from '../../../../services/core/src/displayGeometry.js';
import {standbyAnimationName} from '../../../../services/core/src/desktopPolicy.js';
import {atlasDeclaredSizes,nativeAtlasTexture,compatibleAtlasNames} from '../../../../services/core/src/atlasScale.js';

const webgl = spine.webgl;

export interface SpineAssetSource {
  baseUrl: string;
  skeleton: string;
  atlas: string;
  texture: string;
  textures?: string[];
  textureMetadata?: Record<string,{premultipliedAlpha?:boolean}>;
  json?: boolean;
  scale?: number;
  camera?: any;
}

export interface SpinePetOptions {
  canvas: HTMLCanvasElement;
  source: SpineAssetSource;
  size?: {width:number;height:number};
  targetBodyHeight?: number;
  anchor?: {x:number;y:number};
  // Opt-in for passive control previews only; native pets/enemies retain their complete-action camera.
  previewOnly?: boolean;
  // Keep the last valid framebuffer visible while a replacement bundle loads; prevents flicker/disappearance on action switches.
  preserveFrame?: boolean;
  maxFps?: number;
  onAnimationsReady?: (names: string[]) => void;
  onError?: (error: Error) => void;
}

function toDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error ?? new Error('读取素材失败'));
    reader.readAsDataURL(blob);
  });
}

async function fetchDataUrl(url: string,signal?:AbortSignal): Promise<string> {
  try {
    const response = await fetch(url,{signal});
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    return toDataUrl(await response.blob());
  } catch (error) {
    throw new Error(`素材请求失败：${url}；${error instanceof Error ? error.message : String(error)}`);
  }
}

export class SpinePet {
  private canvas: HTMLCanvasElement;
  private gl: WebGLRenderingContext;
  private shader: any;
  private batcher: any;
  private mvp: any;
  private assetManager: any;
  private skeletonRenderer: any;
  private skeleton: any = null;
  private animationState: any = null;
  private source: SpineAssetSource;
  private onAnimationsReady?: (names: string[]) => void;
  private onError?: (error: Error) => void;
  private frameId: number | null = null;
  private lastFrameTime = 0;
  private loadAbort=new AbortController();
  private previewReferenceTime=0;
  private destroyed = false;
  private paused = false;
  private pixelRatio = Math.max(1, Math.min(window.devicePixelRatio || 1, 2));
  private currentAnimation = '';
  private animationBounds=new Map<string,any>();
  private fixedCamera:any=null;
  private visibleBounds:any=null;
  private previewOnly=false;
  private bodyMeasure=measureBody;
  private maxFps = 30;
  private lastDraw = 0;
  private lastError='';
  private authoredAtlasText='';
  private drawCount=0;private targetBodyHeight=0;private anchor:any=null;private deploymentBody:any=null;private animationBodyHeights:Record<string,number>={};private animationScale=1;private displayEnvelope:any={left:1,right:1,top:1,bottom:0};

  constructor(options: SpinePetOptions) {
    this.previewOnly=options.previewOnly===true;
    this.bodyMeasure=this.previewOnly?measurePreviewBody:measureBody;
    this.targetBodyHeight=options.targetBodyHeight||0;this.anchor=options.anchor;
    this.canvas = options.canvas;
    delete this.canvas.dataset.drawCount;delete this.canvas.dataset.lastDraw;delete this.canvas.dataset.textureAlphaNormalized;
    this.source = options.source;
    this.maxFps=options.maxFps??30;
    this.onAnimationsReady = options.onAnimationsReady;
    this.onError = options.onError;
    this.gl = this.canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, preserveDrawingBuffer: true }) as WebGLRenderingContext;
    if (!this.gl) throw new Error('当前环境没有可用的 WebGL。');
    this.gl.enable(this.gl.BLEND);
    this.gl.blendFunc(this.gl.ONE, this.gl.ONE_MINUS_SRC_ALPHA);
    this.shader = webgl.Shader.newTwoColoredTextured(this.gl);
    this.batcher = new webgl.PolygonBatcher(this.gl);
    this.skeletonRenderer = new webgl.SkeletonRenderer(new webgl.ManagedWebGLRenderingContext(this.gl));
    this.assetManager = new webgl.AssetManager(this.gl);
    this.mvp = new webgl.Matrix4();
    const size=options.size??{width:330,height:400};const limit=Math.min(8192,this.gl.getParameter(this.gl.MAX_RENDERBUFFER_SIZE)||8192);this.pixelRatio=Math.max(.25,Math.min(this.pixelRatio,limit/size.width,limit/size.height));this.canvas.dataset.pixelRatio=String(this.pixelRatio);this.canvas.dataset.alphaMode='PMA';
    this.canvas.style.width = size.width+'px';
    this.canvas.style.height = size.height+'px';
    this.canvas.width = Math.floor(size.width * this.pixelRatio);
    this.canvas.height = Math.floor(size.height * this.pixelRatio);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.mvp.ortho2d(0, 0, this.canvas.width, this.canvas.height);
    // A model switch reuses the same preview canvas. Clear the old framebuffer
    // immediately so the previous character cannot remain visible while the
    // replacement's Spine assets are loading.
    this.clearFrame();
  }

  private clearFrame(): void {
    if (!this.gl || this.gl.isContextLost()) return;
    this.gl.bindFramebuffer(this.gl.FRAMEBUFFER, null);
    this.gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    this.gl.clearColor(0, 0, 0, 0);
    this.gl.clear(this.gl.COLOR_BUFFER_BIT);
  }

  async load(): Promise<boolean> {
    try {
      const names = [this.source.skeleton, this.source.atlas, ...(this.source.textures||[this.source.texture])];
      const dataUrls = await Promise.all(names.map((name) => fetchDataUrl(this.source.baseUrl + encodeURIComponent(name),this.loadAbort.signal)));
      // PRTS preview PNGs may be downscaled while atlas coordinates are original-sized.
      // Normalize in memory, never modify the original user asset.
      const atlasText=await (await fetch(dataUrls[1])).text();
      const actualSizes:Record<string,{width:number;height:number}>={};
      let decodedAlpha=0;
      for(let i=2;i<names.length;i++){
        const image=new Image();image.src=dataUrls[i];await image.decode();
        actualSizes[names[i]]={width:image.naturalWidth,height:image.naturalHeight};
        const page=atlasText.split(/\r?\n\s*\r?\n/).find((p)=>p.split(/\r?\n/)[0].trim()===names[i]);
        if(!page)continue;
        const declared=page.match(/^size:\s*(\d+)\s*,\s*(\d+)/m);
        if(!declared)continue;
        const width=Number(declared[1]),height=Number(declared[2]);
        if(width>8192||height>8192||width<1||height<1)throw new Error('纹理图集尺寸异常');
        const pma=this.source.textureMetadata?.[names[i]]?.premultipliedAlpha||/pma:\s*true/i.test(page);
        if(!pma){const decoded=document.createElement('canvas');decoded.width=image.naturalWidth;decoded.height=image.naturalHeight;const ctx=decoded.getContext('2d',{willReadFrequently:true});ctx.drawImage(image,0,0);const pixels=ctx.getImageData(0,0,decoded.width,decoded.height);for(let p=0;p<pixels.data.length;p+=4){const alpha=pixels.data[p+3];if(alpha>0&&alpha<255)for(let k=0;k<3;k++)pixels.data[p+k]=Math.min(255,Math.round(pixels.data[p+k]*alpha/255));}ctx.putImageData(pixels,0,0);dataUrls[i]=decoded.toDataURL('image/png');}else decodedAlpha++;
      }
      // Preserve authored trim and mesh coordinates. createSkeleton supplies a logical
      // texture adapter without resizing the PNG or rounding individual atlas regions.
      this.authoredAtlasText=atlasText;
      this.canvas.dataset.textureAlphaNormalized=String(decodedAlpha);this.canvas.dataset.atlasDeclaredSize=JSON.stringify(atlasDeclaredSizes(atlasText));this.canvas.dataset.atlasNativeSize=JSON.stringify(actualSizes);
      const declaredSizes=atlasDeclaredSizes(atlasText);
      this.canvas.dataset.textureSampling=Object.entries(actualSizes).some(([name,size])=>declaredSizes[name]&&(size.width!==declaredSizes[name].width||size.height!==declaredSizes[name].height))?'native-logical-atlas':'authored';
      names.forEach((name, index) => this.assetManager.setRawDataURI(name, dataUrls[index]));      if(this.source.json)this.assetManager.loadText(this.source.skeleton);else this.assetManager.loadBinary(this.source.skeleton);
      this.assetManager.loadTextureAtlas(this.source.atlas);
      await this.waitForAssets();
      if(this.destroyed)return false;
      await this.createSkeleton();
      this.renderFrame();
      return true;
    } catch (error) {
      const normalized = error instanceof Error ? error : new Error(String(error));
      this.onError?.(normalized);
      return false;
    }
  }

  private waitForAssets(): Promise<void> {
    return new Promise((resolve, reject) => {
      const start=performance.now();
      const check = () => {
        if(this.destroyed||performance.now()-start>15000){reject(new Error('素材加载取消或超时'));return;}
        if (this.assetManager.hasErrors()) {
          reject(new Error(JSON.stringify(this.assetManager.getErrors())));
          return;
        }
        if (this.assetManager.isLoadingComplete()) {
          resolve();
          return;
        }
        window.setTimeout(check, 16);
      };
      check();
    });
  }

  private async createSkeleton(): Promise<void> {
    const loadedAtlas = this.assetManager.get(this.source.atlas);
    if (!loadedAtlas) throw new Error('Spine atlas 未加载。');
    const sizes=atlasDeclaredSizes(this.authoredAtlasText);
    const atlas=new spine.TextureAtlas(this.authoredAtlasText,(name:string)=>{
      const texture=loadedAtlas.pages.find((page:any)=>page.name===name)?.texture;
      if(!texture)throw new Error('Spine atlas 缺少纹理页：'+name);
      return nativeAtlasTexture(texture,sizes[name]);
    });
    const loader = new spine.AtlasAttachmentLoader(compatibleAtlasNames(atlas));
    const binary = this.source.json?new spine.SkeletonJson(loader):new spine.SkeletonBinary(loader);
    binary.scale = this.source.scale ?? 1;
    const raw=this.assetManager.get(this.source.skeleton);
    const data=binary.readSkeletonData(this.source.json?JSON.parse(raw):raw);
    this.skeleton = new spine.Skeleton(data);
    // Some bundled Spine 3.8 skins mark bones/slots as skin-required. The runtime
    // does not automatically activate the default skin after parsing binary data;
    // updateWorldTransform() then disables those bones and the model appears empty
    // or only partially visible. Explicitly selecting the authored default skin
    // preserves the source attachment set and fixes every affected role/skin without
    // changing atlas pixels or animation timelines.
    if (data.defaultSkin) this.skeleton.setSkin(data.defaultSkin);
    const stateData = new spine.AnimationStateData(data);

    const names = data.animations.map((animation: any) => animation.name);
    for (const from of names) for (const to of names) if (from !== to) stateData.setMix(from, to, 0);
    this.animationState = new spine.AnimationState(stateData);
    this.animationBodyHeights={};this.displayEnvelope={left:1,right:1,top:1,bottom:0};
    const probe=new spine.Skeleton(data);if(data.defaultSkin)probe.setSkin(data.defaultSkin);const probeState=new spine.AnimationState(new spine.AnimationStateData(data));
    // A passive preview never plays attacks/Sit. Their huge envelopes previously shrank the idle body to 30-90 CSS pixels.
    // Keep the native path untouched; the preview samples only its real standby animation and keeps extra parts in an expanded canvas.
    const previewIdle=previewStandbyName(names);
    const catalogEnvelope=!this.previewOnly?cameraEnvelope(this.source.camera,this.source.scale??1):null;
    if(catalogEnvelope){this.displayEnvelope=catalogEnvelope;}
    else{
      // Custom/incomplete catalogs still need real geometry. Yield at bounded intervals so
      // loading another model never blocks the currently visible pet's frame/input loop.
      const cameraAnimations=this.previewOnly?data.animations.filter(a=>a.name===previewIdle):data.animations;
      let probes=0;
      for(const animation of cameraAnimations){
        let maxBody=0;const steps=Math.min(1200,Math.max(24,Math.ceil(animation.duration*60)));
        for(let i=0;i<=steps;i++){
          if(this.destroyed)return;
          probe.setToSetupPose();probeState.clearTracks();probeState.setAnimation(0,animation.name,false);
          const time=animation.duration*(i/Math.max(1,steps));probeState.update(time);probeState.apply(probe);probe.updateWorldTransform();
          const measured=this.bodyMeasure(probe),o=new spine.Vector2(),z=new spine.Vector2();visibleSkeletonBounds(probe,o,z);
          if(Number.isFinite(measured.height)&&measured.height>0&&[measured.left,measured.right,measured.bottom].every(Number.isFinite)){
            if(measured.height>maxBody){maxBody=measured.height;if(this.previewOnly)this.previewReferenceTime=time;}
            extendFrameEnvelope(this.displayEnvelope,measured,{x:o.x,y:o.y,width:z.x,height:z.y},/^sit/i.test(animation.name)?seatContact(probe):measured.bottom);
          }
          if(++probes%64===0)await new Promise(resolve=>setTimeout(resolve,0));
        }
        if(maxBody>0)this.animationBodyHeights[animation.name]=maxBody;
      }
    }
    if(this.destroyed)return;
    this.animationState.addListener({complete:(entry)=>{if(!entry.loop&&entry.returnToIdle!==false){const idle=data.animations.find(a=>a.name===standbyAnimationName(names));if(idle&&entry.animation.name!==idle.name&&!entry.next)this.animationState.addAnimation(0,idle.name,true,0);}}});
    const preferred = this.previewOnly?previewIdle:(standbyAnimationName(names) ?? names.find((name:string)=>!/^default$|die|death|start/i.test(name)));
    if (preferred) this.playAnimation(preferred, true);
    this.fitSkeleton();
    this.onAnimationsReady?.(names);
  }

  private fitSkeleton(): void {
    // One canonical contract for every role and enemy: measure the real visible body,
    // normalize its height, then anchor its body (not its transparent source canvas).
    this.skeleton.setToSetupPose();
    const idle=this.previewOnly?previewStandbyName(this.getAnimationNames()):standbyAnimationName(this.getAnimationNames());
    if(idle){this.animationState.clearTracks();const entry=this.animationState.setAnimation(0,idle,true);if(this.previewOnly)entry.trackTime=this.previewReferenceTime;this.animationState.apply(this.skeleton);}
    this.skeleton.scaleX=1;this.skeleton.scaleY=1;this.skeleton.x=0;this.skeleton.y=0;this.skeleton.updateWorldTransform();
    const body=this.bodyMeasure(this.skeleton);
    if(!Number.isFinite(body.height)||body.height<=0)throw new Error('模型没有可见本体，无法建立显示几何');
    if(this.previewOnly){
      const frame=previewFrame(body.height,this.targetBodyHeight,this.displayEnvelope);
      // Resize only this opt-in canvas, never BrowserWindow/setBounds, native contact geometry, or enemy dimensions.
      const limit=Math.min(8192,this.gl.getParameter(this.gl.MAX_RENDERBUFFER_SIZE)||8192);
      this.pixelRatio=Math.min(this.pixelRatio,limit/frame.width,limit/frame.height);
      this.canvas.style.width=frame.width+'px';this.canvas.style.height=frame.height+'px';
      this.canvas.width=Math.floor(frame.width*this.pixelRatio);this.canvas.height=Math.floor(frame.height*this.pixelRatio);
      this.gl.viewport(0,0,this.canvas.width,this.canvas.height);this.mvp.ortho2d(0,0,this.canvas.width,this.canvas.height);
      this.anchor=frame.anchor;this.canvas.dataset.pixelRatio=String(this.pixelRatio);this.canvas.dataset.previewAnchorX=String(frame.anchor.x);
    }
    const scale=(this.previewOnly?this.targetBodyHeight/body.height:targetScale(body.height,this.targetBodyHeight,this.canvas.width/this.pixelRatio,this.canvas.height/this.pixelRatio,this.displayEnvelope,6,this.anchor||{x:this.canvas.width/this.pixelRatio/2,y:6}))*this.pixelRatio;
    this.fixedCamera={scale,bodyHeight:body.height,profile:this.source.camera||null};
    this.canvas.dataset.renderScale=String(scale);
    // Public metric is the contract target, not the internal pixel scale (which may include safety fitting).
    this.canvas.dataset.normalizedScale=String(this.targetBodyHeight||body.height);
    this.canvas.dataset.displayContract=this.previewOnly?'preview-body-height-v2':'body-height-v1';
    this.applyCamera();
    if(this.previewOnly){
      // World-space IK/transform offsets are not always linear under skeleton scaling (Angelina/Bena).
      // Calibrate once at standby, then freeze the result; never zoom on each animation frame or alter native geometry.
      for(let pass=0;pass<8;pass++){
        const actual=this.bodyMeasure(this.skeleton).height/this.pixelRatio;
        if(!Number.isFinite(actual)||actual<=0||Math.abs(actual-this.targetBodyHeight)<.01)break;
        this.fixedCamera.scale*=this.targetBodyHeight/actual;this.applyCamera();
      }
      this.canvas.dataset.renderScale=String(this.fixedCamera.scale);
    }
    this.deploymentBody=this.bodyMeasure(this.skeleton);
    if(this.previewOnly){const entry=this.animationState.getCurrent(0);if(entry)entry.trackTime=0;this.lastFrameTime=performance.now()/1000;}
  }
  private applyCamera():void {
    if(!this.fixedCamera)return;
    const scale=this.fixedCamera.scale*(this.animationScale||1);
    this.skeleton.scaleX=scale;this.skeleton.scaleY=scale;this.skeleton.x=0;this.skeleton.y=0;this.skeleton.updateWorldTransform();
    const body=this.bodyMeasure(this.skeleton), sitting=/^sit/i.test(this.animationState?.getCurrent(0)?.animation?.name||'');
    // RISK: the shared camera uses Y-up coordinates, unlike DOM Y-down. The old height-6 put the enemy feet at the TOP and clipped almost its entire body.
    // Only the default anchor changes; deployed roles keep their explicit anchor and fixed native window dimensions.
    const target={x:this.canvas.width/2,y:6*this.pixelRatio};
    const contact=sitting?seatContact(this.skeleton):body.bottom;
    const bodyCenter=(body.left+body.right)/2;
    // Fully transparent authored transition frames have no anchor. Never write NaN/Infinity
    // into the skeleton; the next real pose must render normally without reloading the model.
    if(!Number.isFinite(bodyCenter)||!Number.isFinite(contact))return;
    const anchorX=this.anchor?.x!==undefined?this.anchor.x*this.pixelRatio:target.x;
    const anchorY=this.anchor?.y!==undefined?this.anchor.y*this.pixelRatio:target.y;
    this.skeleton.x=anchorX-bodyCenter;
    this.skeleton.y=anchorY-contact;
    this.skeleton.updateWorldTransform();
    const placed=this.bodyMeasure(this.skeleton),placedContact=sitting?seatContact(this.skeleton):placed.bottom;
    this.canvas.dataset.bodyHeight=String(placed.height/this.pixelRatio);
    this.canvas.dataset.bodyCenterX=String(((placed.left+placed.right)/2)/this.pixelRatio);
    this.canvas.dataset.contactType=sitting?'seat':'foot';
    this.canvas.dataset.contactGap=String((placedContact-anchorY)/this.pixelRatio);
    if(this.anchor)this.canvas.dataset.contactY=String(this.anchor.y);
    this.canvas.dataset.bodyBounds=JSON.stringify({x:placed.left/this.pixelRatio,y:this.canvas.clientHeight-placed.top/this.pixelRatio,width:placed.width/this.pixelRatio,height:placed.height/this.pixelRatio});
    this.canvas.dataset.normalizedBodyHeight=String(this.targetBodyHeight||placed.height/this.pixelRatio);
  }

  /** FPS-only settings must not reload/erase an active model or consume its Move deadline. */
  setMaxFps(value:number):void {this.maxFps=Math.max(15,Math.min(60,Number(value)||30));}

  getAnimationNames(): string[] {
    return this.skeleton?.data?.animations?.map((animation: any) => animation.name) ?? [];
  }

  private shouldNormalizeAnimation(name:string){return !/sit|sleep|die|death/i.test(name);}

  playAnimation(name: string, loop = true,speed=1,returnToIdle=true): boolean {
    if (!this.animationState || !this.getAnimationNames().includes(name)) return false;
    if(/^default$/i.test(name)){name=standbyAnimationName(this.getAnimationNames())||name;loop=true;}
    this.animationScale=1;
    this.skeleton.setToSetupPose();
    this.animationState.timeScale=Math.max(.25,Math.min(2,speed||1));
    this.currentAnimation = name;
    const entry=this.animationState.setAnimation(0, name, loop);entry.returnToIdle=returnToIdle;
    if(!loop&&returnToIdle){const idle=standbyAnimationName(this.getAnimationNames());if(idle&&idle!==name)this.animationState.addAnimation(0,idle,true,0);}
    return true;
  }

  playFirstMatching(pattern: RegExp, loop = false): string | null {
    const match = this.getAnimationNames().find((name) => pattern.test(name));
    if (!match) return null;
    this.playAnimation(match, loop);
    return match;
  }

  playInteraction(): string | null {
    return this.playFirstMatching(/interact|touch|click|poke|greet|hello|talk/i, false)
      ?? this.playFirstMatching(/relax|idle|stand/i, true);
  }

  private renderFrame = (): void => {
    if(this.destroyed)return;
    this.frameId=requestAnimationFrame(this.renderFrame);
    if(!this.skeleton||!this.animationState||this.gl.isContextLost())return;
    try{
    const now = performance.now() / 1000;
    if(now-this.lastDraw<1/this.maxFps)return;
    this.lastDraw=now;
    const delta = Math.min(Math.max(now - this.lastFrameTime, 0), 0.1);
    this.lastFrameTime = now;
    this.animationState.update(delta);
    this.animationState.apply(this.skeleton);
    this.applyCamera();
    this.skeleton.updateWorldTransform();
    const vOffset=new spine.Vector2(),vSize=new spine.Vector2();visibleSkeletonBounds(this.skeleton,vOffset,vSize);this.visibleBounds={top:this.canvas.clientHeight-(vOffset.y+vSize.y)/this.pixelRatio,height:vSize.y/this.pixelRatio};const parent=this.canvas.parentElement;if(parent){parent.style.setProperty('--pet-model-right',((vOffset.x+vSize.x)/this.pixelRatio)+'px');parent.style.setProperty('--pet-model-top',(this.canvas.clientHeight-(vOffset.y+vSize.y)/this.pixelRatio)+'px');}
    if(window.__verifyFrameBounds){const o=new spine.Vector2(),size=new spine.Vector2();visibleSkeletonBounds(this.skeleton,o,size);this.canvas.dataset.frameBounds=JSON.stringify({x:o.x,y:o.y,width:size.x,height:size.y,canvasWidth:this.canvas.width,canvasHeight:this.canvas.height});}
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    this.shader.bind();
    this.shader.setUniformi(webgl.Shader.SAMPLER, 0);
    this.shader.setUniform4x4f(webgl.Shader.MVP_MATRIX, this.mvp.values);
    this.batcher.begin(this.shader);
    this.skeletonRenderer.premultipliedAlpha = true;
    this.skeletonRenderer.draw(this.batcher, this.skeleton);
    this.batcher.end();
    this.shader.unbind();
    if(!this.anchor)this.canvas.dataset.contactGap=String(vOffset.y/this.pixelRatio);this.canvas.dataset.drawCount=String(++this.drawCount);this.canvas.dataset.currentTrack=this.animationState.getCurrent(0)?.animation.name||'';this.canvas.dataset.lastDraw=String(Date.now());
    }catch(e){if(this.lastError!==String(e)){this.lastError=String(e);this.onError?.(new Error('动画渲染异常：'+this.lastError));}}
  };

  interactionKind(y:number):'head_touch'|'face_poke'|'foot_poke' {
    const body=this.skeleton?this.bodyMeasure(this.skeleton):null,b=body?{top:this.canvas.clientHeight-body.top/this.pixelRatio,height:body.height/this.pixelRatio}:this.visibleBounds;if(b&&y>=b.top+b.height*.86)return 'foot_poke';return b&&y<b.top+b.height*.53?'head_touch':'face_poke';
  }
  hitTest(x:number,y:number):boolean {
    if(!this.skeleton||x<0||y<0||x>=this.canvas.clientWidth||y>=this.canvas.clientHeight)return false;
    const body=this.bodyMeasure(this.skeleton);if(x<body.left/this.pixelRatio||x>body.right/this.pixelRatio||y<this.canvas.clientHeight-body.top/this.pixelRatio||y>this.canvas.clientHeight-body.bottom/this.pixelRatio)return false;const contour=deploymentHull(this.skeleton).map(v=>({x:v.x/this.pixelRatio,y:this.canvas.clientHeight-v.y/this.pixelRatio}));if(contour.length>=3&&!pointInPolygon({x,y},contour))return false;
    const pixel=new Uint8Array(4);
    this.gl.readPixels(Math.floor(x*this.pixelRatio),this.canvas.height-1-Math.floor(y*this.pixelRatio),1,1,this.gl.RGBA,this.gl.UNSIGNED_BYTE,pixel);
    return pixel[3]>16;
  }

  destroy(clearFrame=true): void {
    if(this.destroyed)return;
    this.loadAbort.abort();
    // Clear the old bundle before disposing it. During a build->battle switch, leaving the previous framebuffer visible briefly composites two models and looks like blur/atlas seams.
    if(clearFrame)this.clearFrame();
    this.destroyed = true;
    if (this.frameId !== null) cancelAnimationFrame(this.frameId);
    this.animationState?.clearTracks();
    this.assetManager?.dispose();
    this.batcher?.dispose();this.shader?.dispose();
    this.skeleton = null;
    this.animationState = null;
  }
}











