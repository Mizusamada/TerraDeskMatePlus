import test from 'node:test';import assert from 'node:assert/strict';import {mkdtempSync,rmSync,readFileSync} from 'node:fs';import {tmpdir} from 'node:os';import path from 'node:path';import {DatabaseSync} from 'node:sqlite';
import {Store,SecretStore} from '../src/store.js';import {buildMessages,parseReply} from '../src/llm.js';import {defaults} from '../src/config.js';

test('chat favorites persist, user retraction removes its response and LLM context',()=>{const dir=mkdtempSync(path.join(tmpdir(),'terra-chat-'));let store:Store|undefined;try{store=new Store(dir);const u=store.turn('user','机密测试内容');const a=store.turn('assistant','reply',{requestId:'audio1',textZh:'机密测试回复',textJa:'はい'});store.attachAudio('audio1','x.wav');store.starTurn(a,true);store.close();store=new Store(dir);assert.equal(store.history().find(t=>t.id===a)?.starred,true);assert.throws(()=>store!.retractTurn(a));store.retractTurn(u);assert.ok(store.history().every(t=>t.retracted&&!t.text&&!t.reply));assert.equal(store.contextHistory().length,0);assert.equal(store.audioFor('audio1'),undefined);store.close();store=new Store(dir);assert.ok(store.history().every(t=>t.retracted));assert.throws(()=>store!.starTurn(a,true));}finally{store?.close();rmSync(dir,{recursive:true,force:true});}});
test('legacy five-column chats migrate without losing saved configuration or messages',()=>{const dir=mkdtempSync(path.join(tmpdir(),'terra-migration-'));let store:Store|undefined;try{const db=new DatabaseSync(path.join(dir,'app.sqlite'));db.exec("CREATE TABLE turns(id TEXT PRIMARY KEY,role TEXT,text TEXT,createdAt TEXT,reply TEXT); INSERT INTO turns VALUES('legacy','user','历史内容','2026-10-03',NULL)");db.close();store=new Store(dir);assert.equal(store.history()[0].text,'历史内容');store.starTurn('legacy',true);assert.equal(store.history()[0].starred,true);store.turn('assistant','新消息');assert.equal(store.history().length,2);}finally{store?.close();rmSync(dir,{recursive:true,force:true});}});
test('deletion removes paired reply, all-history clearing leaves memories untouched',()=>{const dir=mkdtempSync(path.join(tmpdir(),'terra-delete-'));let s:Store|undefined;try{s=new Store(dir);s.addMemory('我喜欢茶');const u=s.turn('user','删除我');s.turn('assistant','对应回复');const keep=s.turn('user','保留我');s.turn('assistant','保留的回复');s.deleteTurn(u);assert.equal(s.history().length,2);assert.equal(s.history()[0].id,keep);s.clearHistory();assert.equal(s.history().length,0);assert.equal(s.memories().length,1);}finally{s?.close();rmSync(dir,{recursive:true,force:true});}});
test('JSON parsing strips only leading thinking block and never tolerates invalid tools',()=>{assert.equal(parseReply('<think>思考</think>\n```json\n{"text_ja":"はい","text_zh":"好的"}\n```').textZh,'好的');assert.throws(()=>parseReply('日语和中文普通文字'));assert.throws(()=>parseReply('{"text_ja":"はい","text_zh":"好的","tool_requests":[{"action":"shell","args":{}}]}'));});
test('retrieved history filters withdrawn content even when caller supplies old UI history',()=>{const messages=buildMessages(defaults(),'你好',[{role:'user',text:'不应出现',retracted:true},{role:'assistant',reply:{textJa:'hidden',textZh:'隐藏'},retracted:true}],[]);assert.ok(!JSON.stringify(messages).includes('不应出现'));});
test('saved API key survives store recreation and blank updates without plaintext',()=>{const dir=mkdtempSync(path.join(tmpdir(),'terra-keys-'));try{const enc=(s:string)=>Buffer.from(s).reverse(),dec=(b:Buffer)=>Buffer.from(b).reverse().toString();let s=new SecretStore(dir,enc,dec);s.setLlm('https://api.deepseek.com/v1','test-key-no-billing');s=new SecretStore(dir,enc,dec);s.setLlm('https://api.deepseek.com/v1','');assert.equal(s.getLlm('https://api.deepseek.com/v1'),'test-key-no-billing');assert.ok(!readFileSync(s.file,'utf8').includes('test-key-no-billing'));assert.equal(s.getLlm('https://api.moonshot.cn/v1'),'');}finally{rmSync(dir,{recursive:true,force:true});}});

test('chat history and context are isolated by character profile', () => {
  const dir = mkdtempSync(path.join(tmpdir(), 'terra-profile-chat-'));
  let store: Store | undefined;
  try {
    store = new Store(dir);
    const amiyaUser = store.turn('user', '阿米娅的私密话题', undefined, 'amiya_caster');
    store.turn('assistant', '阿米娅回复', { requestId: 'amiya-audio' }, 'amiya_caster');
    const kaltsitUser = store.turn('user', '凯尔希的私密话题', undefined, 'operator:Kaltsit');
    store.turn('assistant', '凯尔希回复', { requestId: 'kaltsit-audio' }, 'operator:Kaltsit');

    assert.deepEqual(store.history(300, 'amiya_caster').map(t => t.text), ['阿米娅的私密话题', '阿米娅回复']);
    assert.deepEqual(store.history(300, 'operator:Kaltsit').map(t => t.text), ['凯尔希的私密话题', '凯尔希回复']);
    assert.equal(store.contextHistory(12, 'amiya_caster').some(t => t.text.includes('凯尔希')), false);
    assert.equal(store.contextHistory(12, 'operator:Kaltsit').some(t => t.text.includes('阿米娅')), false);

    store.starTurn(amiyaUser, true, 'amiya_caster');
    assert.equal(store.history(300, 'operator:Kaltsit').some(t => t.starred), false);
    store.retractTurn(kaltsitUser, 'operator:Kaltsit');
    assert.equal(store.history(300, 'amiya_caster').every(t => !t.retracted), true);
    assert.equal(store.history(300, 'operator:Kaltsit').every(t => t.retracted), true);
  } finally {
    store?.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test('scoped mutations, audio replay and persistence cannot cross characters',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'terra-scope-'));let s:Store|undefined;
 try{s=new Store(dir);const a=s.turn('user','A private',undefined,'amiya_caster');s.turn('assistant','A reply',{requestId:'audio-a'},'amiya_caster');s.attachAudio('audio-a','saved.wav');const k=s.turn('user','K private',undefined,'operator:Kaltsit');s.turn('assistant','K reply',undefined,'operator:Kaltsit');
 assert.throws(()=>s!.deleteTurn(a,'operator:Kaltsit'));assert.throws(()=>s!.starTurn(a,true,'operator:Kaltsit'));assert.throws(()=>s!.retractTurn(a,'operator:Kaltsit'));assert.equal(s.audioFor('audio-a','operator:Kaltsit'),undefined);assert.equal(s.audioFor('audio-a','amiya_caster'),'saved.wav');
 s.deleteTurn(k,'operator:Kaltsit');assert.equal(s.history(300,'operator:Kaltsit').length,0);assert.equal(s.history(300,'amiya_caster').length,2);s.close();s=new Store(dir);assert.equal(s.history(300,'amiya_caster').length,2);s.clearHistory('operator:Kaltsit');assert.equal(s.history(300,'amiya_caster').length,2);
 }finally{s?.close();rmSync(dir,{recursive:true,force:true});}
});

test('role memories and recall are isolated and persist without deleting other roles',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'terra-role-memory-'));let s:Store|undefined;
 try{s=new Store(dir);const a=s.addMemory('阿米娅记住我喜欢茶','preference','amiya_caster');const k=s.addMemory('凯尔希记住我喜欢书','preference',"operator:Kal'tsit");
 assert.equal(s.memories('amiya_caster').length,1);assert.equal(s.memories("operator:Kal'tsit").length,1);assert.equal(s.recall('喜欢',6,'amiya_caster')[0].content,'阿米娅记住我喜欢茶');assert.throws(()=>s!.updateMemory(a!.id,'越界修改',"operator:Kal'tsit"));assert.throws(()=>s!.deleteMemory(a!.id,"operator:Kal'tsit"));s.pauseMemory(k!.id,true,"operator:Kal'tsit");s.close();s=new Store(dir);assert.equal(s.memories("operator:Kal'tsit")[0].paused,true);assert.equal(s.memories('amiya_caster')[0].paused,false);
 }finally{s?.close();rmSync(dir,{recursive:true,force:true});}
});

test('legacy memory rows migrate to the original Amiya scope without loss',()=>{
 const dir=mkdtempSync(path.join(tmpdir(),'terra-old-memory-'));let s:Store|undefined;
 try{const db=new DatabaseSync(path.join(dir,'app.sqlite'));db.exec("CREATE TABLE memories(id TEXT PRIMARY KEY,type TEXT,content TEXT,source TEXT,confirmedAt TEXT,updatedAt TEXT,paused INTEGER DEFAULT 0,deleted INTEGER DEFAULT 0); INSERT INTO memories VALUES('old-memory','preference','旧记忆','user_confirmed','2026-10-04','2026-10-04',0,0)");db.close();s=new Store(dir);assert.equal(s.memories()[0].content,'旧记忆');assert.equal(s.memories("operator:Kal'tsit").length,0);}finally{s?.close();rmSync(dir,{recursive:true,force:true});}
});

test('automatic chat memories are role-scoped events and removed with their source turn',()=>{const dir=mkdtempSync(path.join(tmpdir(),'terra-auto-memory-'));let s:Store|undefined;try{s=new Store(dir);const id=s.turn('user','今天我喝了茶',undefined,'operator:Suzuran');s.rememberTurn(id,'operator:Suzuran');const m=s.memories('operator:Suzuran')[0];assert.equal(m.source,'dialogue_auto');assert.equal(s.memories().length,0);s.retractTurn(id,'operator:Suzuran');assert.equal(s.memories('operator:Suzuran').length,0);s.addMemory('手动事实','preference','operator:Suzuran');s.clearHistory('operator:Suzuran');assert.equal(s.memories('operator:Suzuran').length,1);}finally{s?.close();rmSync(dir,{recursive:true,force:true});}});


test('vision input is encoded only for the current request and is rejected when disabled', async () => {
  const { defaults } = await import('../src/config.js');
  const { buildMessages, requestReply } = await import('../src/llm.js');
  const c:any = defaults(); c.llm.model='vision-model';
  const image={mimeType:'image/png',dataUrl:'data:image/png;base64,AAAA'};
  c.llm.visionEnabled=true;
  const messages:any[]=buildMessages(c,'看图',[],[],[image]);
  const user=messages.at(-1);
  assert.equal(Array.isArray(user.content),true);
  assert.equal(user.content[1].type,'image_url');
  await assert.rejects(() => requestReply({...c,llm:{...c.llm,visionEnabled:false}},'', '看图',[],[],new AbortController().signal,[image]), /视觉|vision/i);
});
