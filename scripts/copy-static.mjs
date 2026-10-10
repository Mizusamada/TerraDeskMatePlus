import { cp, mkdir } from 'node:fs/promises';
await mkdir('dist/apps/desktop/renderer', { recursive: true });
await cp('apps/desktop/src/renderer/index.html', 'dist/apps/desktop/renderer/index.html');
await cp('apps/desktop/src/renderer/pet.html', 'dist/apps/desktop/renderer/pet.html');
await cp('apps/desktop/src/renderer/enemy.html', 'dist/apps/desktop/renderer/enemy.html');
await cp('apps/desktop/src/renderer/styles.css', 'dist/apps/desktop/renderer/styles.css');
// The control-only stylesheet must ship alongside its HTML; pet/enemy pages intentionally never load it.
await cp('apps/desktop/src/renderer/industrial.css', 'dist/apps/desktop/renderer/industrial.css');

await cp('apps/desktop/src/renderer/pcm-worklet.js', 'dist/apps/desktop/renderer/pcm-worklet.js');

await cp('apps/desktop/src/renderer/icon.png', 'dist/apps/desktop/renderer/icon.png');

await cp('assets/builtin','dist/assets/builtin',{recursive:true});

// Training uses audited fixed scripts shipped with the application, never renderer-provided shell code.
await mkdir('dist/training',{recursive:true});
for(const name of ['train-role.py','train-role-batch.py','train-gpt-single-gpu.py','train-sovits-single-gpu.py'])await cp('scripts/'+name,'dist/training/'+name);
