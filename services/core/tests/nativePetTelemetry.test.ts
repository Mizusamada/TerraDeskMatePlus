// Native IPC registration must survive refactors: a literal backslash-n after // silently comments out both handlers.
import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
test('contact and animations-ready handlers are executable registrations, not comment text',()=>{
 const source=readFileSync('apps/desktop/src/main/main.ts','utf8');
 for(const channel of ['pet:contact','pet:animations-ready']){
  const lines=source.split(/\r?\n/).filter(line=>line.includes("on('"+channel+"'"));
  assert.equal(lines.length,1,channel+' registered once');
  assert.ok(!lines[0].trimStart().startsWith('//'),channel+' must not be inside a line comment');
 }
});
