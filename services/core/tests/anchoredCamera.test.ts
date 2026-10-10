// Fixed camera safety must be checked per side of its contact anchor, not only total width/height.
import test from 'node:test';import assert from 'node:assert/strict';
import {targetScale} from '../src/displayGeometry.js';
test('an asymmetric effect fits below a centered seat/foot anchor without clipping',()=>{
 const e={left:100,right:60,top:95,bottom:140};
 const scale=targetScale(26,28,204,204,e,6,{x:102,y:102});
 assert.ok(scale*e.bottom<=96);assert.ok(scale*e.top<=96);
});
test('default bottom enemy anchor reserves room for the complete upper body',()=>{
 const e={left:120,right:136,top:174,bottom:0};
 const scale=targetScale(120,110,306,215,e,6,{x:153,y:6});
 assert.ok(Math.abs(scale-110/120)<.00001);
});
