import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {defaults} from '../src/config.js';
import {modelCapability,selectModelSettings,modelPreferenceKey} from '../src/modelCatalog.js';
import {fetchModelCatalog} from '../src/modelDiscovery.js';
import {childPages,primaryFor} from '../src/controlNavigation.js';
// Unit layer: declared metadata and endpoint-specific settings prevent stale vision/cost claims.
test('model metadata is parsed only from explicit fields and exact endpoint/alias',()=>{
 const cap=modelCapability({id:'demo',context_window:8192,max_output_tokens:4096,input_modalities:['text','image']},'https://example.org/v1');assert.equal(cap.vision,true);assert.equal(cap.contextWindow,8192);
 assert.equal(modelCapability('vision-super-model','https://example.org/v1').vision,null);
 assert.equal(modelCapability('deepseek-v4-pro','https://api.deepseek.com/v1').vision,false);
 assert.equal(modelCapability('deepseek-flash','https://api.deepseek.com/v1').vision,true);
 assert.equal(modelCapability('deepseek-flash','https://example.org/v1').vision,null);
});
test('model switch restores per-model manual budgets and disables unsupported vision',()=>{
 const c=defaults().llm,base='https://example.org/v1',prefs={[modelPreferenceKey(base,'m')]:{maxContextTokens:6000,maxOutputTokens:500,visionEnabled:true}};
 const cap=modelCapability({id:'m',context_window:4096,max_output_tokens:256,input_modalities:['text']},base),n=selectModelSettings(c,base,'m',cap,prefs);
 assert.equal(n.maxContextTokens,4096);assert.equal(n.maxOutputTokens,256);assert.equal(n.visionEnabled,false);assert.equal(c.maxContextTokens,4096);
 assert.notEqual(modelPreferenceKey('https://other.org/v1','m'),modelPreferenceKey(base,'m'));
});
test('default model budgets remain conservative and output fits total window',()=>{
 const c=defaults().llm,base='https://example.org/v1';const n=selectModelSettings(c,base,'m',modelCapability({id:'m',context_window:512,max_output_tokens:4000},base));assert.ok(n.maxOutputTokens<n.maxContextTokens);assert.equal(n.visionEnabled,false);
 assert.equal(selectModelSettings(c,'https://api.deepseek.com/v1','deepseek-flash',modelCapability('deepseek-flash','https://api.deepseek.com/v1')).maxContextTokens,16384);
});
// Integration layer: only GET /models goes to the selected endpoint; no body or key leaks in returned data.
test('model discovery reads capabilities with GET and rejects without retry',async()=>{
 let calls=0;const server=createServer((req,res)=>{calls++;assert.equal(req.method,'GET');assert.equal(req.url,'/v1/models');assert.equal(req.headers.authorization,'Bearer test-only-key');res.setHeader('content-type','application/json');res.end(JSON.stringify({data:[{id:'m',input_modalities:['text'],context_window:12345,max_output_tokens:222}]}));});await new Promise<void>(r=>server.listen(0,'127.0.0.1',r));try{const address=server.address() as any;const result=await fetchModelCatalog('http://127.0.0.1:'+address.port+'/v1','test-only-key');assert.deepEqual(result.models,['m']);assert.equal(result.capabilities[0].vision,false);assert.ok(!JSON.stringify(result).includes('test-only-key'));assert.equal(calls,1);}finally{server.close();server.closeAllConnections();}
});
