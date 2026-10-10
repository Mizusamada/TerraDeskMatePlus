import test from 'node:test';import assert from 'node:assert/strict';
import {editionPolicy,allowedReleaseFile}from'../release-resource-policy.mjs';
// The four variants differ in resources only; these tests protect the release
// boundary without changing a production settings/credential/renderer module.
test('edition resources keep speech and pretrained extensions explicitly separate',()=>{
 assert.deepEqual(Object.values(editionPolicy).map(p=>[p.speech,p.trained]),[[true,true],[false,false],[true,false],[false,false]]);
 for(const edition of Object.keys(editionPolicy)){assert.equal(allowedReleaseFile('assets/builtin/trained-voices/public/model.pth',edition),editionPolicy[edition].trained);assert.equal(allowedReleaseFile('speech-runtime/env/python.exe',edition),editionPolicy[edition].speech);assert.ok(allowedReleaseFile('assets/builtin/干员模型/旅骨/旅骨-原皮/基建/a.skel',edition));}
});
test('private profiles, secrets, logs and traversal never enter any release',()=>{
 for(const edition of Object.keys(editionPolicy))for(const p of ['../user-data/config.json','user-data/chat.json','.env.local','secrets.json','logs/private.log','speech-runtime/GPT-SoVITS/__pycache__/a.pyc','memories/a.json','.test-data/config.json'])assert.equal(allowedReleaseFile(p,edition),false,p);
});
