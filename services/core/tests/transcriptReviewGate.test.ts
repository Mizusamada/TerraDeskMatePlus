// Automatic audio recognition cannot bypass the user's exact-transcript training gate.
import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';import {tmpdir}from'node:os';import {defaults}from'../src/config.js';import {exportTrainingDataset}from'../src/speech.js';
test('provisional local transcript requires explicit reviewed confirmation before training export',()=>{
 const dir=fs.mkdtempSync(path.join(tmpdir(),'terra-transcript-gate-'));
 try{const file=path.join(dir,'sample.wav');fs.writeFileSync(file,'contract fixture');const c=defaults();c.speech.gptSovits.trainingReferences=[{audioPath:file,text:'候选',language:'ja',needsReview:true,reviewed:false,transcriptSource:'local_whisper_small_unreviewed'}];assert.throws(()=>exportTrainingDataset(c,dir),/先核对录音/);c.speech.gptSovits.trainingReferences[0].reviewed=true;assert.equal(exportTrainingDataset(c,dir).count,1);}finally{assert.equal(path.dirname(path.resolve(dir)),path.resolve(tmpdir()),'cleanup must stay inside temporary root');fs.rmSync(dir,{recursive:true,force:true});}
});
