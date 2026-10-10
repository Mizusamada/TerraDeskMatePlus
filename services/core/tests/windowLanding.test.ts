import test from 'node:test';
import assert from 'node:assert/strict';
import {windowLanding,floorFor,type Rect} from '../src/physics.js';
const area:Rect={x:0,y:0,width:1707,height:1019};
const platform:Rect={x:400,y:500,width:700,height:260};
const body=(foot:number):Rect=>({x:700,y:foot-280,width:100,height:280});
// Release snapping must be measured at the physical feet, not the transparent native window or pointer.
test('dragging below window top or onto taskbar never pulls the pet back upward',()=>{
 assert.equal(windowLanding(body(590),area,[platform]),undefined);
 assert.equal(windowLanding(body(504),area,[platform]),undefined);
 assert.equal(windowLanding(body(1019),area,[platform]),undefined);
});
test('release near a window top still supports feet with bounded DIP rounding tolerance',()=>{
 assert.equal(windowLanding(body(492),area,[platform]),platform);
 assert.equal(windowLanding(body(503),area,[platform]),platform);
 assert.equal(windowLanding(body(480),area,[platform]),undefined);
});
test('nearest physical top wins, not enumeration order or a far window under cursor',()=>{
 const other={...platform,y:494};
 assert.equal(windowLanding(body(491),area,[platform,other]),other);
 assert.equal(windowLanding(body(491),area,[other,platform]),other);
});
test('support selection respects horizontal foot overlap, monitor coordinates and bottom margin',()=>{
 assert.equal(windowLanding({...body(500),x:1200},area,[platform]),undefined);
 assert.equal(windowLanding(body(500),area,[{...platform,y:-1}]),undefined);
 assert.equal(windowLanding(body(1009),area,[{...platform,y:1009}],10),undefined);
 const monitor={x:-1920,y:-100,width:1920,height:1080},edge={x:-1500,y:400,width:600,height:250};
 assert.equal(windowLanding({x:-1300,y:120,width:100,height:280},monitor,[edge]),edge);
});
// Removal must leave the existing gravity floor at taskbar; no visibility or close-control setting is changed.
test('closing support restores taskbar floor rather than an invisible stale top',()=>{
 assert.equal(floorFor(body(500),area,[platform]),220);
 assert.equal(floorFor(body(500),area,[]),739);
});
