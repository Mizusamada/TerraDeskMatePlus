import { DatabaseSync } from 'node:sqlite';
import { mkdirSync, existsSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import path from 'node:path';
import { createHash,randomUUID } from 'node:crypto';
import { defaults,normalizeConfig,type Config } from './config.js';
export class Store {
  db:DatabaseSync; dir:string;
  constructor(dir:string){this.dir=dir;mkdirSync(dir,{recursive:true});this.db=new DatabaseSync(path.join(dir,'app.sqlite'));this.db.exec(`PRAGMA journal_mode=WAL; PRAGMA foreign_keys=ON;
    CREATE TABLE IF NOT EXISTS settings(id INTEGER PRIMARY KEY,value TEXT NOT NULL);
    CREATE TABLE IF NOT EXISTS memories(id TEXT PRIMARY KEY,type TEXT,content TEXT,source TEXT,confirmedAt TEXT,updatedAt TEXT,paused INTEGER DEFAULT 0,deleted INTEGER DEFAULT 0,profileId TEXT NOT NULL DEFAULT 'amiya_caster');
    CREATE TABLE IF NOT EXISTS turns(id TEXT PRIMARY KEY,role TEXT,text TEXT,createdAt TEXT,reply TEXT,deleted INTEGER DEFAULT 0,retracted INTEGER DEFAULT 0,starred INTEGER DEFAULT 0);
    CREATE TABLE IF NOT EXISTS audit(id TEXT PRIMARY KEY,createdAt TEXT,action TEXT,status TEXT,detail TEXT);
    CREATE TABLE IF NOT EXISTS usage(id TEXT PRIMARY KEY,kind TEXT,amount INTEGER,createdAt TEXT,state TEXT);
  `);
    for(const [name,definition] of [['deleted','INTEGER DEFAULT 0'],['retracted','INTEGER DEFAULT 0'],['starred','INTEGER DEFAULT 0'],['profileId',"TEXT NOT NULL DEFAULT 'amiya_caster'"]] as const){
      const exists=this.db.prepare("SELECT 1 FROM pragma_table_info('turns') WHERE name=?").get(name);
      if(!exists)this.db.exec('ALTER TABLE turns ADD COLUMN '+name+' '+definition);
    }
    if(!this.db.prepare("SELECT 1 FROM pragma_table_info('memories') WHERE name='profileId'").get())this.db.exec("ALTER TABLE memories ADD COLUMN profileId TEXT NOT NULL DEFAULT 'amiya_caster'");
    if(!this.db.prepare("SELECT 1 FROM pragma_table_info('memories') WHERE name='turnId'").get())this.db.exec("ALTER TABLE memories ADD COLUMN turnId TEXT");
    this.db.exec('CREATE INDEX IF NOT EXISTS turns_profile ON turns(profileId); CREATE INDEX IF NOT EXISTS memories_profile ON memories(profileId)');
  }
  instances(){const r=this.db.prepare('SELECT value FROM settings WHERE id=2').get() as any;return r?JSON.parse(r.value):[];}
  saveInstances(items:any[]){this.db.prepare('INSERT INTO settings(id,value)VALUES(2,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify(items));}
  hasSettings(){return !!this.db.prepare('SELECT id FROM settings WHERE id=1').get();}
  config():Config{const row=this.db.prepare('SELECT value FROM settings WHERE id=1').get() as any;return row?normalizeConfig(JSON.parse(row.value)):defaults();}
  saveConfig(c:Config){this.db.prepare('INSERT INTO settings(id,value)VALUES(1,?) ON CONFLICT(id) DO UPDATE SET value=excluded.value').run(JSON.stringify({...c,memories:[]}));}
  rememberTurn(id:string,profileId='amiya_caster'){const row=this.db.prepare("SELECT * FROM turns WHERE id=? AND profileId=? AND role='user' AND deleted=0 AND retracted=0").get(id,profileId) as any;if(!row)throw Error('对话不存在或不属于当前角色');const answer=this.db.prepare("SELECT reply FROM turns WHERE profileId=? AND role='assistant' AND json_extract(reply,'$.userTurnId')=? ORDER BY rowid DESC LIMIT 1").get(profileId,id) as any;let response='';try{response=answer?.reply?JSON.parse(answer.reply).textZh||'':'';}catch{}const content='对话事件（未经事实验证）：用户说：'+row.text.slice(0,1000)+(response?'；AI当时回复（模型生成，不是用户事实）：'+response.slice(0,800):'');const t=new Date().toISOString();this.db.prepare('INSERT OR IGNORE INTO memories(id,type,content,source,confirmedAt,updatedAt,profileId,turnId)VALUES(?,?,?,?,?,?,?,?)').run('auto:'+id,'shared_experience',content,'dialogue_auto',t,t,profileId,id);}
  forgetTurns(ids:string[]){for(const id of ids)this.db.prepare("DELETE FROM memories WHERE source='dialogue_auto' AND turnId=?").run(id);}
  memories(profileId='amiya_caster'){return this.db.prepare('SELECT * FROM memories WHERE deleted=0 AND profileId=? ORDER BY updatedAt DESC').all(profileId).map((r:any)=>({...r,paused:!!r.paused}));}
  addMemory(content:string,type='preference',profileId='amiya_caster'){if(!content?.trim()||content.length>2000)throw new Error('记忆内容应为1–2000字');if(!['preference','profile','shared_experience','task_context','relationship'].includes(type))throw new Error('未知记忆类别');const t=new Date().toISOString(),id=randomUUID();this.db.prepare('INSERT INTO memories(id,type,content,source,confirmedAt,updatedAt,profileId)VALUES(?,?,?,?,?,?,?)').run(id,type,content.trim(),'user_confirmed',t,t,profileId);return this.memories(profileId).find(m=>m.id===id);}
  updateMemory(id:string,content:string,profileId='amiya_caster'){if(!content?.trim()||content.length>2000)throw new Error('无效记忆');const result=this.db.prepare('UPDATE memories SET content=?,source=?,updatedAt=? WHERE id=? AND deleted=0 AND profileId=?').run(content.trim(),'manual_edit',new Date().toISOString(),id,profileId);if(!result.changes)throw new Error('这条记忆不存在或不属于当前角色');return this.memories(profileId).find(m=>m.id===id);}
  deleteMemory(id:string,profileId='amiya_caster'){const result=this.db.prepare('UPDATE memories SET deleted=1,content=?,updatedAt=? WHERE id=? AND profileId=?').run('',new Date().toISOString(),id,profileId);if(!result.changes)throw new Error('这条记忆不存在或不属于当前角色');}
  pauseMemory(id:string,paused:boolean,profileId='amiya_caster'){const result=this.db.prepare('UPDATE memories SET paused=? WHERE id=? AND deleted=0 AND profileId=?').run(paused?1:0,id,profileId);if(!result.changes)throw new Error('这条记忆不存在或不属于当前角色');}
  recall(q:string,limit=6,profileId='amiya_caster'){const m=this.memories(profileId).filter((r:any)=>!r.paused);const tokens=[...new Set((q.toLowerCase().match(/[\p{L}\p{N}]{2,}/gu)||[]).flatMap(s=>[s,...Array.from({length:Math.max(0,s.length-1)},(_,i)=>s.slice(i,i+2))]))];return m.map(r=>({r,score:tokens.reduce((n,t)=>n+(r.content.toLowerCase().includes(t)?1:0),0)})).sort((a,b)=>b.score-a.score).filter(x=>x.score>0).slice(0,limit).map(x=>x.r);}
  turn(role:string,text:string,reply?:any,profileId='amiya_caster'){const id=randomUUID();this.db.prepare('INSERT INTO turns(id,role,text,createdAt,reply,deleted,retracted,starred,profileId) VALUES(?,?,?,?,?,?,?,?,?)').run(id,role,text,new Date().toISOString(),reply?JSON.stringify(reply):null,0,0,0,profileId);return id;}
  completeTool(toolId:string,result:any){const rows=this.db.prepare("SELECT id,reply FROM turns WHERE reply IS NOT NULL AND role='assistant'").all() as any[];for(const row of rows){const reply=JSON.parse(row.reply);let changed=false;reply.tools=(reply.tools||[]).map((t:any)=>{if(t.id!==toolId)return t;changed=true;return {...t,status:result.status,result:JSON.stringify(result,null,2)};});if(changed)this.db.prepare('UPDATE turns SET reply=? WHERE id=?').run(JSON.stringify(reply),row.id);}}
  attachAudio(requestId:string,audioPath:string){this.db.prepare("UPDATE turns SET reply=json_set(reply,'$.audioPath',?) WHERE role='assistant' AND json_extract(reply,'$.requestId')=?").run(audioPath,requestId);}
  audioFor(requestId:string,profileId='amiya_caster'){const row=this.db.prepare("SELECT json_extract(reply,'$.audioPath') AS path FROM turns WHERE role='assistant' AND deleted=0 AND retracted=0 AND json_extract(reply,'$.requestId')=? AND profileId=?").get(requestId,profileId) as any;return row?.path as string|undefined;}
  history(limit=300,profileId='amiya_caster'){return this.db.prepare('SELECT * FROM (SELECT rowid AS ordinal,* FROM turns WHERE deleted=0 AND profileId=? ORDER BY rowid DESC LIMIT ?) ORDER BY ordinal').all(profileId,limit).map((r:any)=>({...r,deleted:!!r.deleted,retracted:!!r.retracted,starred:!!r.starred,reply:r.reply?JSON.parse(r.reply):null}));}
  // Collection query is independent of the last 300 chat turns; old starred records must remain visible. It never enters another role's LLM context.
  favoriteHistory(profileId='amiya_caster'){return this.db.prepare('SELECT rowid AS ordinal,* FROM turns WHERE deleted=0 AND retracted=0 AND starred=1 AND profileId=? ORDER BY rowid DESC').all(profileId).map((r:any)=>({...r,deleted:false,retracted:false,starred:true,reply:r.reply?JSON.parse(r.reply):null}));}
  contextHistory(limit=12,profileId='amiya_caster'){return this.history(2000,profileId).filter(t=>!t.retracted).slice(-limit);}
  private conversationIds(id:string,userOnly=false,profileId='amiya_caster'){
    const row=this.db.prepare('SELECT id,role,createdAt,rowid AS ordinal FROM turns WHERE id=? AND deleted=0 AND profileId=?').get(id,profileId) as any;
    if(!row)throw new Error('这条消息不存在或已删除');
    if(userOnly&&row.role!=='user')throw new Error('只能撤回自己发送的消息');
    if(row.role!=='user')return [id];
    const next=this.db.prepare("SELECT rowid AS ordinal FROM turns WHERE role='user' AND rowid>? AND profileId=? ORDER BY rowid LIMIT 1").get(row.ordinal,profileId) as any;
    return (this.db.prepare('SELECT id FROM turns WHERE rowid>=? AND rowid<? AND deleted=0 AND profileId=? ORDER BY rowid').all(row.ordinal,next?.ordinal??Number.MAX_SAFE_INTEGER,profileId) as any[]).map(r=>r.id);
  }
  deleteTurn(id:string,profileId='amiya_caster'){const ids=this.conversationIds(id,false,profileId);this.forgetTurns(ids);for(const key of ids)this.db.prepare('DELETE FROM turns WHERE id=?').run(key);return ids;}
  clearHistory(profileId='amiya_caster'){this.db.prepare("DELETE FROM memories WHERE source='dialogue_auto' AND profileId=?").run(profileId);this.db.prepare('DELETE FROM turns WHERE profileId=?').run(profileId);}
  retractTurn(id:string,profileId='amiya_caster'){const ids=this.conversationIds(id,true,profileId);this.forgetTurns(ids);for(const key of ids)this.db.prepare("UPDATE turns SET retracted=1,starred=0,text='',reply=NULL WHERE id=?").run(key);return ids;}
  starTurn(id:string,starred:boolean,profileId='amiya_caster'){const row=this.db.prepare('SELECT id FROM turns WHERE id=? AND deleted=0 AND retracted=0 AND profileId=?').get(id,profileId);if(!row)throw new Error('消息已删除或撤回，不能收藏');this.db.prepare('UPDATE turns SET starred=? WHERE id=?').run(starred?1:0,id);}
  audit(action:string,status:string,detail:any){this.db.prepare('INSERT INTO audit VALUES(?,?,?,?,?)').run(randomUUID(),new Date().toISOString(),action,status,JSON.stringify(detail));}
  auditList(){return this.db.prepare('SELECT * FROM audit ORDER BY createdAt DESC LIMIT 100').all();}
  usage(kind:string,amount:number,id=randomUUID(),state='submitted'){this.db.prepare('INSERT INTO usage VALUES(?,?,?,?,?)').run(id,kind,amount,new Date().toISOString(),state);return id;}
  total(kind:string,prefix:string){const r=this.db.prepare('SELECT SUM(amount) AS n FROM usage WHERE kind=? AND createdAt LIKE ?').get(kind,prefix+'%') as any;return Number(r.n)||0;}
  close(){this.db.close();}
}
export class SecretStore {
  file:string; encrypted:Record<string,string>={}; private recoveredKeys:string[]=[];
  constructor(dir:string,private encrypt:(s:string)=>Buffer,private decrypt:(b:Buffer)=>string){this.file=path.join(dir,'secrets.enc.json');if(existsSync(this.file)){try{this.encrypted=JSON.parse(readFileSync(this.file,'utf8'));}catch{throw new Error('密钥存储损坏：请在设置中重新配置，不会明文回退');}}}
  scopedId(baseUrl:string){const u=new URL(baseUrl);return 'llm:'+createHash('sha256').update(u.origin+u.pathname.replace(/\/+$/,'')).digest('hex');}
  private persist(){const tmp=this.file+'.tmp';writeFileSync(tmp,JSON.stringify(this.encrypted));renameSync(tmp,this.file);}
  private recover(key:string){if(!this.recoveredKeys.includes(key))this.recoveredKeys.push(key);if(this.encrypted[key]){delete this.encrypted[key];this.persist();}}
  getLlm(baseUrl:string){return this.get(this.scopedId(baseUrl));}
  setLlm(baseUrl:string,value:string){this.set(this.scopedId(baseUrl),value);}
  migrateLlm(baseUrl:string){if(this.encrypted.llmApiKey){const legacy=this.get('llmApiKey');if(legacy&&!this.encrypted[this.scopedId(baseUrl)])this.setLlm(baseUrl,legacy);this.set('llmApiKey','__clear__');}}
  set(key:string,value:string){if(!['llmApiKey','tencentSecretKey','bailianApiKey'].includes(key)&&!/^llm:[a-f0-9]{64}$/.test(key))throw new Error('未知密钥字段');if(value==='__clear__')delete this.encrypted[key];else if(value.trim())this.encrypted[key]=this.encrypt(value.trim()).toString('base64');this.persist();}
  get(key:string){const encoded=this.encrypted[key];if(!encoded)return '';try{return this.decrypt(Buffer.from(encoded,'base64'));}catch{this.recover(key);return '';}}
  flags(){return Object.fromEntries(['llmApiKey','tencentSecretKey','bailianApiKey'].map(k=>[k,!!this.get(k)]));}
  consumeRecoveryNotice(){const keys=[...this.recoveredKeys];this.recoveredKeys=[];return keys;}
}
