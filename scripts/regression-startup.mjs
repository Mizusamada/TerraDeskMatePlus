import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { _electron as electron } from 'playwright';
import { electronPath, root } from './launch.mjs';

// 这个闭环故意复用快捷方式的真实参数：Electron + 工作区根目录。
// 这样可以捕获“源码已修复但 dist 仍是旧快照”导致的启动黑屏，而不是只验证开发脚本。
const dataDir = path.join(root, '.test-data', `startup-${randomUUID()}`);
const evidenceDir = path.join(root, 'docs', 'verification', '2026-10-10');
mkdirSync(dataDir, { recursive: true });
mkdirSync(evidenceDir, { recursive: true });
const env = { ...process.env, AMIYA_DATA_DIR: dataDir };
delete env.ELECTRON_RUN_AS_NODE;
const errors = [];
let app;
try {
  app = await electron.launch({
    executablePath: electronPath(),
    // 与 D:\桌宠\快捷方式打开\启动泰拉桌伴.lnk 的目标和参数保持一致。
    args: [root],
    env,
    timeout: 120000,
  });
  app.on('window', (page) => {
    page.on('pageerror', (error) => errors.push(`pageerror: ${error.message}`));
    page.on('console', (message) => {
      if (message.type() === 'error') errors.push(`console: ${message.text()}`);
    });
  });

  let control;
  for (let i = 0; i < 600; i += 1) {
    control = app.windows().find((page) => page.url().includes('index.html'));
    if (control) break;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  assert.ok(control, '快捷方式等价启动必须出现控制中心窗口');
  await control.waitForLoadState('domcontentloaded');
  await control.waitForSelector('.control-shell', { timeout: 60000 });
  await control.waitForTimeout(1000);
  const evidence = await control.evaluate(() => ({
    url: location.href,
    title: document.title,
    readyState: document.readyState,
    bodyTextLength: document.body?.innerText?.trim().length ?? 0,
    hasControlShell: Boolean(document.querySelector('.control-shell')),
  }));
  writeFileSync(path.join(evidenceDir, 'shortcut-startup.json'), JSON.stringify({ evidence, errors }, null, 2));
  await control.screenshot({ path: path.join(evidenceDir, 'shortcut-startup.png') });
  assert.ok(evidence.bodyTextLength > 0, '控制中心正文不能为空，避免黑屏假通过');
  assert.equal(evidence.hasControlShell, true, '控制中心根节点必须存在');
  assert.deepEqual(errors, [], `启动不应产生 renderer 错误: ${errors.join('; ')}`);
  console.log('PASS shortcut-equivalent startup:', JSON.stringify(evidence));
} finally {
  if (app) await app.close().catch(() => {});
}
