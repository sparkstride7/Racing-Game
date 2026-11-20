const { chromium } = require('playwright'); const { spawn } = require('child_process'); const fs = require('fs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('npx', ['vite', '--config', __dirname + '/vite.config.mjs', '--port', '4195', '--strictPort'], { cwd: '/home/user/Racing-Game' });
  await sleep(4000);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const logs = []; p.on('console', m => logs.push(m.type() + ': ' + m.text())); p.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await p.goto('http://localhost:4195/'); await p.waitForFunction(() => window.ready, null, { timeout: 120000 });
  for (const which of ['exotic', 'gt']) {
    const r = await p.evaluate((w) => window.make(w), which);
    fs.writeFileSync(`${__dirname}/out/${r.id}.glb`, Buffer.from(r.glb, 'base64'));
    await sleep(200); await p.screenshot({ path: `${__dirname}/out/${r.id}-studio.png` });
    console.log(JSON.stringify({ id: r.id, buildMs: r.buildMs, stats: r.stats, glbKB: Math.round(r.glbBytes / 1024) }));
  }
  console.log('CONSOLE', logs.filter(l => !/vite\]|PCFSoft/.test(l)).join(' | ') || '(no warnings or errors)');
  await b.close(); srv.kill(); process.exit(0);
})();
