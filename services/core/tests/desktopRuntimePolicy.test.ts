import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { shouldAdvanceAutonomousMovement, shouldRunAutonomousCycle, windowTopmostLevel } from '../src/desktopRuntimePolicy.js';

const readyState = () => ({
  visible: true, ready: true, idleEnabled: true, pauseMovement: false,
  dragging: false, hovering: false, manualAction: false,
  deploymentLocked: false, chasing: false, falling: false,
});

test('autonomous selection gate without manual-mode coupling', () => {
  const state = readyState();
  assert.equal(shouldRunAutonomousCycle(state), true);
  assert.equal(shouldAdvanceAutonomousMovement({ ...state, moving: true }), true);
  assert.equal(shouldRunAutonomousCycle({ ...state, pauseMovement: true }), false);
  assert.equal(shouldRunAutonomousCycle({ ...state, dragging: true }), false);
  assert.equal(shouldRunAutonomousCycle({ ...state, hovering: true }), false);
});

test('topmost policy has a stable floating level and can be re-applied after window-manager changes', () => {
  assert.equal(windowTopmostLevel(true), 'floating');
  assert.equal(windowTopmostLevel(false), 'normal');
});

test('desktop integration contract keeps transactional model swap and scrollable oversized previews', () => {
  const main = readFileSync('apps/desktop/src/main/main.ts', 'utf8');
  const pet = readFileSync('apps/desktop/src/renderer/pet.ts', 'utf8');
  const css = readFileSync('apps/desktop/src/renderer/industrial.css', 'utf8');
  assert.match(main, /enforceWindowPolicy\(p\)/);
  assert.match(main, /shouldRunAutonomousCycle\(autonomousState\)/);
  assert.doesNotMatch(main, /!c\.ui\.manualMode&&c\.ui\.idleEnabled/);
  assert.match(pet, /const nextCanvas=document.createElement/);
  assert.match(pet, /previous\?\.destroy\(false\)/);
  assert.match(css, /\.preview-stage\s*\{[^}]*overflow:auto/);
});
