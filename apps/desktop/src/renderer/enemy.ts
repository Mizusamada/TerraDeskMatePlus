// @ts-nocheck
import {isMovementActionName} from '../../../../services/core/src/desktopPolicy.js';
import {SpinePet} from '../pet/SpinePet.js';
const api=window.petApi;
export async function initEnemy(){const root=document.querySelector('#app');root.innerHTML='<canvas id="enemy-canvas" aria-label="源石虫，点击后让当前干员追击"></canvas>';const canvas=document.querySelector('#enemy-canvas');try{const source=await api.enemySource();if(!source)throw new Error('缺少敌人单位素材');const pet=new SpinePet({canvas,source:source.source,size:{width:source.width||180,height:source.height||140},// Use the frame contract calculated from every enemy animation so the full unit remains visible instead of shrinking into a fixed 180x140 box.
    targetBodyHeight:Number(source.targetBodyHeight)||110,maxFps:30,onError:e=>console.error(e)});await pet.load();document.body.dataset.modelReady='true';document.body.dataset.canvasSize=JSON.stringify({width:canvas.width,height:canvas.height,cssWidth:canvas.clientWidth,cssHeight:canvas.clientHeight});// Use the same cycle classifier as native movement; begin/end remain playable explicit actions, not automatic loops.
const move=pet.getAnimationNames().find(isMovementActionName);if(move)pet.playAnimation(move,true,1,false);api.on('pet:play-animation',(a)=>{if(a?.name)pet.playAnimation(a.name,!!a.loop,Number(a.speed)||1,a.returnToIdle!==false);});canvas.addEventListener('pointerdown',()=>api.enemyHit());}catch(e){console.error(e);}}


