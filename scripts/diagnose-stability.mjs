import fs from 'node:fs';
import path from 'node:path';
import {build} from 'esbuild';
import {launchNative} from './native-test-driver.mjs';
import {defaults} from '../services/core/src/config.ts';
import {Store} from '../services/core/src/store.ts';
const root=process.cwd(), runtime=path.join(root,'.test-data','stability-runtime');
fs.mkdirSync(runtime,{recursive:true});
fs.writeFileSync(path.join(runtime,'package.json'),JSON.stringify({name:'terra-stability-local',version:'0.3.0',type:'module',main:'dist/apps/desktop/main/main.js'}));
// Compile only in the dedicated test runtime; source assets are read through a junction, never copied into delivery directories.
for(const [input,output,platform,format,external] of [
 ['apps/desktop/src/main/main.ts','main/main.js','node','esm',['electron','ws']],
 ['apps/desktop/src/preload/bridge.ts','preload/bridge.cjs','node','cjs',['electron']],
 ['apps/desktop/src/renderer/renderer.ts','renderer/renderer.js','browser','iife',[]]])
 await build({entryPoints:[path.join(root,input)],outfile:path.join(runtime,'dist/apps/desktop',output),bundle:true,platform,format,external,logLevel:'silent'});
for(const name of ['index.html','pet.html','enemy.html','styles.css','industrial.css','icon.png','pcm-worklet.js']) fs.copyFileSync(path.join(root,'apps/desktop/src/renderer',name),path.join(runtime,'dist/apps/desktop/renderer',name));
fs.mkdirSync(path.join(runtime,'dist/assets'),{recursive:true});
const linked=path.join(runtime,'dist/assets/builtin');if(!fs.existsSync(linked))fs.symlinkSync(path.join(root,'assets/builtin'),linked,'junction');
const data=fs.mkdtempSync(path.join(root,'.test-data','stability-user-'));
const store=new Store(data),config=defaults();config.ui.idleSpeechEnabled=false;config.ui.muted=true;config.speech.replyEnabled=false;config.speech.outputMode='text-only';config.speech.gptSovits.enabled=false;config.alerts.quietInFullscreen=false;config.behaviour.clickBindings.deployment={action:'',voiceId:'',actionIds:[],voiceIds:[]};store.saveConfig(config);store.close();
const env={...process.env,AMIYA_DATA_DIR:data};delete env.ELECTRON_RUN_AS_NODE;
let app;const findings={data,errors:[],stages:[]};
try{
 console.log('LAUNCH current isolated runtime');
 app=await launchNative(runtime,path.join(root,'node_modules/electron/dist/electron.exe'),env); 
 
 const control=await app.firstWindow();await control.waitForSelector('.control-shell',{timeout:60000});
 console.log('CONTROL ready');
 let state=await control.evaluate(()=>window.petApi.loadConfig());
 findings.stages.push({stage:'config',ui:state.config.ui,actionNames:state.actions.map(a=>a.name)});
 await control.waitForFunction(()=>document.querySelector('#preview-canvas')?.dataset.modelReady==='true',null,{timeout:60000}).catch(()=>{});
 const previewEvidence=await control.evaluate(()=>{const c=document.querySelector('#preview-canvas'),stage=c?.closest('.preview-stage');return c?{css:c.getBoundingClientRect().toJSON(),bodyHeight:Number(c.dataset.bodyHeight),stage:{clientWidth:stage?.clientWidth,scrollWidth:stage?.scrollWidth,clientHeight:stage?.clientHeight,scrollHeight:stage?.scrollHeight}}:null;});findings.stages.push({stage:'preview',previewEvidence});console.log('PREVIEW',JSON.stringify(previewEvidence));
 await control.evaluate(()=>window.petApi.showPets());
 let pet;for(let i=0;i<100;i++){pet=app.windows().find(w=>w.url().includes('pet.html'));if(pet)break;await new Promise(r=>setTimeout(r,100));}
 await pet.waitForFunction(()=>document.body.dataset.modelReady==='true',null,{timeout:60000});
 await pet.evaluate(()=>{window.__events=[];for(const k of ['pet:source-change','pet:play-animation','pet:surface'])window.petApi.on(k,p=>window.__events.push({k,p,at:Date.now()}));});
 state=await control.evaluate(async()=>{const x=await window.petApi.loadConfig();return window.petApi.saveConfig({config:{...x.config,ui:{...x.config.ui,manualMode:true,pauseMovement:false,idleEnabled:true,randomMinMs:2000,randomMaxMs:2000,clickThrough:false},behaviour:{...x.config.behaviour,actionVoiceEnabled:false}}});});
 console.log('CONFIG autonomous enabled');
 await pet.evaluate(()=>{window.petApi.resumePet();window.petApi.hoverPet(false);});
 const actionList=(await control.evaluate(()=>window.petApi.loadConfig())).actions.filter(a=>a.name&&a.name!=='Default').slice(0,12);
 const actionEvidence=[];for(const action of actionList){await control.evaluate(a=>window.petApi.playPetAnimation({id:a.id,loop:false}),action);await new Promise(r=>setTimeout(r,250));actionEvidence.push(await pet.evaluate(()=>({ready:document.body.dataset.modelReady,track:document.querySelector('#spine-canvas')?.dataset.currentTrack||'',draw:Number(document.querySelector('#spine-canvas')?.dataset.drawCount||0),canvas:!!document.querySelector('#spine-canvas')})));}
 findings.stages.push({stage:'rapid-action-swap',actions:actionList.map(a=>a.name),evidence:actionEvidence});console.log('RAPID_ACTION',JSON.stringify(actionEvidence)); const move=(await control.evaluate(()=>window.petApi.loadConfig())).actions.find(a=>/^move$/i.test(a.name)||/^walk$/i.test(a.name));
 await control.evaluate(a=>window.petApi.playPetAnimation({id:a.id,loop:true}),move);
 const manualPoints=[];for(let i=0;i<8;i++){await new Promise(r=>setTimeout(r,500));manualPoints.push(await app.evaluate(({BrowserWindow})=>BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('pet.html')).getBounds()));}
 findings.stages.push({stage:'manual-move',action:move?.name,points:manualPoints});console.log('MANUAL_MOVE',move?.name,manualPoints.map(p=>p.x)); for(let i=0;i<15;i++){
   await new Promise(r=>setTimeout(r,1000));
   const b=await app.evaluate(({BrowserWindow})=>{const w=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('pet.html'));return {bounds:w.getBounds(),topmost:w.isAlwaysOnTop()};});
   const renderer=await pet.evaluate(()=>({ready:document.body.dataset.modelReady,track:document.querySelector('#spine-canvas').dataset.currentTrack,draw:Number(document.querySelector('#spine-canvas').dataset.drawCount),body:document.querySelector('#spine-canvas').dataset.bodyBounds,events:window.__events}));
   findings.stages.push({stage:'autonomous',second:i+1,...b,...renderer});console.log('SAMPLE',i+1,b.bounds.x,b.bounds.y,renderer.track,renderer.draw,renderer.events.length);
 }
}catch(e){findings.failure=e.stack;console.error(e);process.exitCode=1;}finally{
 fs.mkdirSync(path.join(root,'docs/verification/2026-10-10/stability'),{recursive:true});fs.writeFileSync(path.join(root,'docs/verification/2026-10-10/stability/diagnostic.json'),JSON.stringify(findings,null,2));
 if(app)await app.close();
}




