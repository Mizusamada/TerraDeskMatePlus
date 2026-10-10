import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
// Real exported package fixture: successful import must retain every HD file its role-owned index references.
test('exported Logos base includes Windows-style atlas and PNG overlay paths',()=>{const root=path.join(process.env.TERRA_LIGHT_PACKAGE_ROOT||'D:/TerraDeskMateLight/角色基础包','Logos/content'),r=JSON.parse(fs.readFileSync(path.join(root,'all-role-battle-textures/index.json'),'utf8'));for(const e of Object.values(r.entries) as any[])for(const relative of [e.atlas,...Object.values(e.textures)])assert.ok(fs.existsSync(path.join(root,String(relative))),'missing exported HD asset '+relative);});

