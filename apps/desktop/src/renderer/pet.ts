// @ts-nocheck
import {setupLocalPanels} from './localPanels.js';
import {SpinePet} from '../pet/SpinePet.js';

const api=window.petApi;

export async function initPet(){
  const root=document.querySelector('#app');
  root.innerHTML=`<div class="pet-root"><div class="pet-bubble" role="status" aria-live="polite"><div class="zh"></div><div class="ja" lang="ja"></div><span class="bubble-resize-hint" aria-hidden="true">↘</span></div><canvas id="spine-canvas" aria-label="桌宠，单击随机动作，双击选择动作，拖拽移动"></canvas><div class="pet-controls" aria-label="桌宠悬停菜单"><button class="pet-control" data-pet="chat">◌ 开始对话</button><button class="pet-control" data-pet="actions">✧ 播放动作</button><button class="pet-control" data-pet="voices">♫ 播放语音</button><button class="pet-control" data-pet="mic">♬ 语音输入</button><button class="pet-control danger" data-pet="close">× 取消这只桌宠</button></div></div>`;
  let canvas=document.querySelector('#spine-canvas');const bubble=document.querySelector('.pet-bubble'),menu=document.querySelector('.pet-controls');
  const local=setupLocalPanels(api,root,()=>config);let recoveries=0,watchdog=null;
  let loading=false,candidateInFlight=null;let config=null,pet=null,source=null,audio=null,subtitleReply=null,bubbleTimer=null,clickTimer=null,loadToken=0,hoverTimer=null,leaveTimer=null,pointer=null,dragging=false,direction=1,surface='bottom',rotation=0,hovering=false,pendingAction=null,bubbleResizePending=false,contactTimer=null;

  function canvasSizeFor(bundle,scale){
    const profile=bundle?.source?.camera,bodyHeight=Math.max(1,profile?.bodyHeight||profile?.idleHeight||450),b=profile?.fitBounds||profile?.bounds;
    const factor=280*scale/bodyHeight;
    const extentW=Math.max(280*scale,profile?.deploymentLayout?.width?profile.deploymentLayout.width*280*scale:(Number(b?.maxX||1)-Number(b?.minX||-1))*(profile?.idleHeight||450)*factor);
    const extentH=Math.max(320*scale,profile?.deploymentLayout?.height?profile.deploymentLayout.height*280*scale:(Number(b?.maxY||1.2)-Number(b?.minY||0))*(profile?.idleHeight||450)*factor);
    const envelope=profile?.deploymentLayout?.envelope;
    const radius=envelope&&envelope.top?280*scale*Math.max(envelope.left,envelope.right,envelope.top,envelope.bottom)+20*scale:Math.max(extentW/2+20*scale,extentH+20*scale);
    const square=Math.ceil(2*radius);
    document.documentElement.style.setProperty('--pet-canvas-width',square/scale+'px');
    document.documentElement.style.setProperty('--pet-canvas-height',square/scale+'px');
    return {width:square,height:square,anchor:{x:square/2,y:square/2}};
  }

  function bubbleDesign(){return config?.ui?.bubble||{background:'#080c12',color:'#e7f0f4',fontSize:13,minWidth:160,maxWidth:320,width:260,height:0,padding:12};}
  function bubbleSize(){const d=bubbleDesign();return {width:Math.max(d.minWidth||160,Math.min(d.maxWidth||320,d.width||d.maxWidth||260)),height:Number(d.height)||0};}
  function bodyBounds(){try{return JSON.parse(canvas.dataset.bodyBounds||'null');}catch{return null;}}
  function clampBubble(){
    if(!bubble.classList.contains('visible'))return;
    const d=bubbleDesign(),size=bubbleSize(),rootWidth=Math.max(1,root.clientWidth),rootHeight=Math.max(1,root.clientHeight);
    bubble.style.minWidth=Math.min(d.minWidth||160,rootWidth-16)+'px';
    bubble.style.maxWidth=Math.max(120,Math.min(d.maxWidth||320,rootWidth-16))+'px';
    bubble.style.maxHeight=Math.max(120,rootHeight-16)+'px';
    const rect=bubble.getBoundingClientRect(),body=bodyBounds();
    const preferredLeft=body?body.x+body.width+18:Math.max(8,rootWidth-rect.width-8);
    const preferredTop=body?body.y-8:8;
    const left=Math.max(8,Math.min(rootWidth-rect.width-8,preferredLeft));
    const top=Math.max(8,Math.min(rootHeight-rect.height-8,preferredTop));
    bubble.style.left=Math.round(left)+'px';bubble.style.top=Math.round(top)+'px';bubble.style.right='auto';bubble.style.bottom='auto';
  }
  function scheduleClamp(){requestAnimationFrame(()=>{clampBubble();requestAnimationFrame(clampBubble);});}
  function saveBubbleSize(){
    if(!bubbleResizePending)return;
    bubbleResizePending=false;
    const rect=bubble.getBoundingClientRect();
    const d=bubbleDesign();
    const width=Math.round(rect.width),height=Math.round(rect.height);
    if(Math.abs(width-(d.width||0))<2&&Math.abs(height-(d.height||0))<2)return;
    void api.resizeBubble({width,height}).catch(e=>api.reportPetError(e.message));
  }
  function subtitle(r,keep=false){
    subtitleReply=r;clearTimeout(bubbleTimer);
    bubble.querySelector('.ja').textContent='';
    bubble.querySelector('.zh').textContent=config?.speech.showChinese?r.textZh||'':'';
    const d=bubbleDesign(),size=bubbleSize();
    bubble.style.backgroundColor=d.background;bubble.style.color=d.color;bubble.style.fontSize=d.fontSize+'px';bubble.style.padding=d.padding+'px';
    bubble.style.width=size.width+'px';bubble.style.height=size.height>0?size.height+'px':'auto';
    bubble.style.backgroundImage=config?.ui?.bubbleImageUrl?'url("'+config.ui.bubbleImageUrl+'")':'none';bubble.style.backgroundSize='100% 100%';
    bubble.classList.toggle('visible',!!config?.speech.subtitlesEnabled&&!!((config.speech.showJapanese&&r.textJa)||(config.speech.showChinese&&r.textZh)));
    scheduleClamp();
    if(!keep)bubbleTimer=setTimeout(()=>bubble.classList.remove('visible'),Math.min(30000,Math.max(4500,(r.textJa?.length||r.textZh?.length||0)*110)));
  }
  function stopAudio(){if(audio){const a=audio;audio=null;a.onended=null;a.onerror=null;a.pause();a.removeAttribute('src');a.load();}}
  function play(action){if(loading||!pet||!pet.getAnimationNames().length){pendingAction=action;return;}if(!pet.playAnimation(action.name,action.loop,action.speed)){pendingAction=null;return;}pendingAction=null;document.body.dataset.animation=action.name;window.__petAnimationHistory=window.__petAnimationHistory||[];window.__petAnimationHistory.push({name:action.name,loop:!!action.loop,at:Date.now()});if(window.__petAnimationHistory.length>100)window.__petAnimationHistory.shift();}
  async function loadPet(bundle,action){
    const token=++loadToken;candidateInFlight?.destroy();candidateInFlight=null;loading=true;pendingAction=action||null;
    // Each candidate owns a separate canvas/context. An obsolete async completion must never
    // clear, dispose, resume or write the active renderer's GPU resources.
    const b=bundle||source||await api.petSource();
    if(token!==loadToken)return;
    if(!b){loading=false;api.reportPetError('缺少完整模型');return;}
    const nextCanvas=document.createElement('canvas');nextCanvas.setAttribute('aria-label',canvas.getAttribute('aria-label')||'桌宠');
    const size=canvasSizeFor(b,config.ui.scale);let error='';
    const candidate=new SpinePet({canvas:nextCanvas,source:b.source,size,targetBodyHeight:280*config.ui.scale,anchor:size.anchor,maxFps:config.ui.maxFps,onError:e=>{error=e.message;}});
    // Hidden candidate can finish its first frame before the DOM swap; the last valid model remains visible and animated throughout fetch/decode.
    candidateInFlight=candidate;
    const ok=await candidate.load();
    if(token!==loadToken){candidate.destroy();return;}
    if(!ok){candidate.destroy();candidateInFlight=null;loading=false;pendingAction=null;api.reportPetError(error||'模型加载失败');api.reportSourceFailure({bundleId:b.id,previousBundleId:source?.id});return;}
    const previous=pet;const oldCanvas=canvas;
    canvas=nextCanvas;canvas.id='spine-canvas';oldCanvas.replaceWith(canvas);pet=candidate;source=b;candidateInFlight=null;loading=false;
    previous?.destroy(false);
    document.body.dataset.modelReady='true';document.body.dataset.bundleId=b.id;
    if(pendingAction)play(pendingAction);
    canvas.style.transformOrigin=(canvas.clientWidth/2)+'px '+(canvas.clientHeight/2)+'px';canvas.style.transform='rotate('+rotation+'deg) scaleX('+direction+')';
    canvas.style.filter=config.ui.shadow?'drop-shadow(0 8px 8px rgba(0,0,0,.28))':'none';
    // Report ready only after the active canvas and requested action agree; native Move timers begin here.
    api.reportAnimations({bundleId:b.id,names:pet.getAnimationNames()});scheduleClamp();
  }
  async function configure(c){
    const previous=config;config=c;document.documentElement.style.setProperty('--pet-scale',c.ui.scale);document.documentElement.dataset.theme=c.ui.theme;document.documentElement.dataset.motion=c.ui.reducedMotion?'reduced':'full';
    if(!previous||previous.ui.scale!==c.ui.scale)await loadPet(source);else pet?.setMaxFps(c.ui.maxFps);
    canvas.style.filter=c.ui.shadow?'drop-shadow(0 8px 8px rgba(0,0,0,.28))':'none';if(c.ui.muted||!c.speech.replyEnabled)stopAudio();if(subtitleReply)subtitle(subtitleReply,!!audio);else scheduleClamp();
  }
  api.on('config:changed',x=>void configure(x.config));
  api.on('pet:source-change',async x=>{if(!config){const c=await api.loadConfig();config=c.config;}await loadPet(x.bundle,x.action);});
  api.on('pet:play-animation',action=>{pendingAction=null;play(action);});
  api.on('pet:direction',d=>{direction=d;canvas.style.transform=`rotate(${rotation}deg) scaleX(${d})`;});
  api.on('pet:surface',s=>{surface=s.surface;rotation=s.degrees;document.body.dataset.surface=surface;canvas.style.transform=`rotate(${rotation}deg) scaleX(${direction})`;scheduleClamp();});
  // Renderer reports the actual sitting/standing contact point so native physics can use the seat, not a stale foot box.
  let lastContactReport='';
  function reportContact(){const type=canvas.dataset.contactType||'foot',gap=Number(canvas.dataset.contactGap||0),y=Number(canvas.dataset.contactY||0);const key=type+'|'+y.toFixed(2)+'|'+gap.toFixed(2);if(key!==lastContactReport){lastContactReport=key;api.reportPetContact({type,contactY:y,gap});}}
  contactTimer=setInterval(reportContact,120);
  api.on('audio:stop',stopAudio);
  api.on('chat:reply',r=>subtitle(r));
  api.on('system:notice',m=>{if(m?.textZh)subtitle({textJa:'',textZh:m.textZh});});
  api.on('speech:play',async r=>{if(!config)config=(await api.loadConfig()).config;stopAudio();subtitle(r,!!r.audioUrl);if(!r.audioUrl||config.ui.muted||!config.speech.replyEnabled&&!r.manual){api.audioEnded({requestId:r.requestId});subtitle(r);return;}const playing=new Audio(r.audioUrl);audio=playing;document.body.dataset.audioState='loading';playing.volume=.9;playing.onplaying=()=>{document.body.dataset.audioState='playing';};playing.onended=()=>{if(audio!==playing)return;audio=null;document.body.dataset.audioState='ended';api.audioEnded({requestId:r.requestId});subtitle(r);};playing.onerror=()=>{if(audio!==playing)return;audio=null;document.body.dataset.audioState='error';api.audioEnded({requestId:r.requestId,error:'音频播放失败'});subtitle({textJa:r.textJa,textZh:(r.textZh||'')+'（音频播放失败）'});};try{await playing.play();}catch(e){playing.onerror();api.reportPetError(e.message);}});
  api.on('pet:hover-reset',()=>{hovering=false;clearTimeout(hoverTimer);menu.classList.remove('visible');});
  function hover(hit){clearTimeout(leaveTimer);if(hit){if(!hovering){hovering=true;api.hoverPet(true);hoverTimer=setTimeout(()=>menu.classList.add('visible'),config.ui.hoverDelayMs||1000);}}else{leaveTimer=setTimeout(()=>{hovering=false;clearTimeout(hoverTimer);menu.classList.remove('visible');api.hoverPet(false);},300);}}
  function modelHit(x,y){const size=canvasSizeFor(source,config.ui.scale),dx=x-size.width/2,dy=y-size.height/2,r=-rotation*Math.PI/180,rx=Math.cos(r)*dx-Math.sin(r)*dy,ry=Math.sin(r)*dx+Math.cos(r)*dy;return !!pet?.hitTest((direction<0?-rx:rx)+size.width/2,ry+size.height/2);}
  function hit(e){return modelHit(e.clientX,e.clientY);}
  api.on('pet:hit-probe',point=>{if(dragging)return;const pos=point.viewport;if(pos){const bounds=bodyBounds();if(bounds){const right=Math.min(pos.right-250,Math.max(pos.left+4,bounds.x+bounds.width+12)),top=Math.max(pos.top+4,Math.min(pos.bottom-270,bounds.y+20));root.style.setProperty('--local-panel-x',right+'px');root.style.setProperty('--local-panel-y',top+'px');menu.style.left=right+'px';menu.style.top=top+'px';menu.style.bottom='auto';scheduleClamp();}}const el=document.elementFromPoint(point.x,point.y);api.reportHit({hit:!!el?.closest?.('.pet-controls.visible,.pet-local-panel,.pet-bubble.visible')||modelHit(point.x,point.y)});});
  document.addEventListener('mousemove',e=>{if(dragging)return;const overOverlay=!!e.target?.closest?.('.pet-controls,.pet-local-panel,.pet-bubble');hover(overOverlay||hit(e));});document.addEventListener('mouseleave',()=>{if(!dragging)hover(false);});
  bubble.addEventListener('pointerdown',e=>{bubbleResizePending=true;e.stopPropagation();});
  document.addEventListener('pointerup',()=>saveBubbleSize());
  root.addEventListener('click',e=>{const b=e.target.closest('[data-pet]');if(!b)return;if(b.dataset.pet==='close'){void api.hoverPet(false);api.closePet();}else void local.open(b.dataset.pet);});
  root.addEventListener('pointerdown',e=>{if(e.target!==canvas||e.button!==0||!hit(e))return;pointer={x:e.screenX,y:e.screenY,localY:e.offsetY};dragging=false;canvas.setPointerCapture(e.pointerId);api.hoverPet(true);});
  root.addEventListener('pointermove',e=>{if(pointer&&!dragging&&Math.hypot(e.screenX-pointer.x,e.screenY-pointer.y)>5){dragging=true;clearTimeout(clickTimer);menu.classList.remove('visible');api.dragPet('start');}});
  root.addEventListener('pointerup',e=>{if(!pointer)return;if(dragging)api.dragPet('end');else{clearTimeout(clickTimer);const kind=pet?.interactionKind(pointer.localY)||'face_poke';clickTimer=setTimeout(()=>void api.playInteraction(kind).catch(x=>subtitle({textJa:'',textZh:x.message.replace(/^.*Error invoking remote method[^:]*:/,'')})),260);}pointer=null;dragging=false;if(canvas.hasPointerCapture(e.pointerId))canvas.releasePointerCapture(e.pointerId);});
  // Native-window movement can lose capture; end the gesture once so the instance never stays attached to the cursor.
  root.addEventListener('lostpointercapture',()=>{if(dragging)api.dragPet('end');pointer=null;dragging=false;});
  window.addEventListener('blur',()=>{if(dragging)api.dragPet('end');pointer=null;dragging=false;});
  root.addEventListener('pointercancel',()=>{if(dragging)api.dragPet('end');pointer=null;dragging=false;});root.addEventListener('dblclick',e=>{if(hit(e)){clearTimeout(clickTimer);void local.open('actions');}});
  root.addEventListener('contextmenu',e=>{e.preventDefault();api.petMenu();});
  document.addEventListener('keydown',e=>{if(!config.ui.manualMode)return;if(e.key==='ArrowLeft'||e.key==='ArrowRight'){e.preventDefault();api.manualPet(e.key==='ArrowLeft'?-12:12);}});
  const resizeObserver=new ResizeObserver(()=>{if(!bubbleResizePending)scheduleClamp();});resizeObserver.observe(bubble);
  root.addEventListener('webglcontextlost',e=>{e.preventDefault();api.reportPetError('WebGL上下文丢失，等待恢复');},true);root.addEventListener('webglcontextrestored',()=>{if(source&&recoveries++<2)void loadPet(source);},true);
  watchdog=setInterval(()=>{if(dragging||loading||!pet||document.hidden)return;const last=Number(canvas.dataset.lastDraw||0);if(document.body.dataset.modelReady==='true'&&last&&Date.now()-last>4000&&recoveries++<2){api.reportPetError('检测到渲染帧中断，重新加载当前模型');void loadPet(source);}},1500);
  try{const x=await api.loadConfig();await configure(x.config);document.body.dataset.surface='bottom';}catch(e){api.reportPetError(e.message);bubble.querySelector('.zh').textContent=e.message;bubble.classList.add('visible');scheduleClamp();}
  window.addEventListener('resize',scheduleClamp);
  window.addEventListener('beforeunload',()=>{++loadToken;clearInterval(watchdog);clearTimeout(hoverTimer);clearTimeout(leaveTimer);clearTimeout(bubbleTimer);clearTimeout(clickTimer);if(contactTimer)clearInterval(contactTimer);stopAudio();resizeObserver.disconnect();candidateInFlight?.destroy();pet?.destroy();});
}







