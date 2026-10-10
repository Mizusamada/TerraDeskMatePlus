import test from 'node:test';
import assert from 'node:assert/strict';
import {shouldRunAutonomousCycle,shouldAdvanceAutonomousMovement,playbackDeadlines} from '../src/desktopRuntimePolicy.js';
import {standbyAnimationName,isStandbyActionName} from '../src/desktopPolicy.js';
import {cameraEnvelope} from '../src/displayGeometry.js';
const live={visible:true,ready:true,idleEnabled:true,pauseMovement:false,dragging:false,hovering:false,manualAction:false,deploymentLocked:false,chasing:false,falling:false};
// Manual looping actions must still move; the idle switch only owns autonomous selections.
test('manual looping Move still advances when idle companionship is disabled',()=>{
 assert.equal(shouldAdvanceAutonomousMovement({...live,moving:true,manualAction:true,idleEnabled:false}),true);
 assert.equal(shouldRunAutonomousCycle({...live,manualAction:true}),false);
 assert.equal(shouldAdvanceAutonomousMovement({...live,moving:true,manualAction:true,pauseMovement:true}),false);
});
// An asset load can exceed one movement cycle; deadlines belong to successful playback, not request time.
test('movement and hold timers use ready-time and per-action speed, not asset fetch time',()=>{
 const times=playbackDeadlines({duration:4},.5,false,false,true,10000,2000);
 assert.equal(times.holdUntil,18000);assert.equal(times.moveUntil,18000);assert.equal(times.nextAction,20000);
 const loop=playbackDeadlines({duration:4},2,true,true,true,10000,2000);assert.equal(loop.moveUntil,Infinity);
});
test('ordinary authored letter standby returns to Idle_A without borrowing Doll_Idle',()=>{
 assert.equal(standbyAnimationName(['Doll_Idle','Attack_A','Idle_A','Idle_B']),'Idle_A');
 assert.equal(isStandbyActionName('Idle_A'),true);assert.equal(isStandbyActionName('Doll_Idle'),false);
});
// Reuse catalog geometry only when every field is finite; corrupt/custom metadata still takes the measured fallback.
test('catalog envelope conversion is in authored units and rejects invalid metadata',()=>{
 assert.deepEqual(cameraEnvelope({bodyHeight:400,envelope:{left:1,right:2,top:3,bottom:.5}},1),{left:400,right:800,top:1200,bottom:200});
 assert.equal(cameraEnvelope({bodyHeight:400,envelope:{left:Infinity,right:2,top:3,bottom:0}},1),null);
});
