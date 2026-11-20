const { chromium } = require('playwright'); const { spawn } = require('child_process'); const fs = require('fs');
const sleep = (ms) => new Promise(r => setTimeout(r, ms));
(async () => {
  const srv = spawn('/home/user/Racing-Game/node_modules/.bin/vite', ['--config', __dirname + '/vite.config.mjs', '--port', '4550', '--strictPort'], { cwd: __dirname });
  await sleep(4000);
  const b = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  const p = await b.newPage({ viewport: { width: 1600, height: 900 } });
  const logs = []; p.on('console', m => logs.push(m.type() + ': ' + m.text())); p.on('pageerror', e => logs.push('pageerror: ' + e.message));
  await p.goto('http://localhost:4550/', { waitUntil: 'commit', timeout: 180000 }); await p.waitForFunction(() => window.ready, null, { timeout: 300000 });
  for (const which of ['exotic']) for (const [res, tris, suffix, err] of [[0.015, 32000, '', 0.002]]) {
    const r = await p.evaluate(([w, a, b, c]) => window.make(w, a, b, c), [which, res, tris, err]);
    fs.writeFileSync(`${__dirname}/out/${r.id.replace('_v4', '_v10b')}_source${suffix}.glb`, Buffer.from(r.glb, 'base64'));
    await sleep(200); await p.screenshot({ path: `${__dirname}/out/${r.id.replace('_v4', '_v10b')}${suffix}-studio.png` });
    console.log(JSON.stringify({ id: r.id, buildMs: r.buildMs, stats: r.stats, glbKB: Math.round(r.glbBytes / 1024) }));
  }
  console.log('CONSOLE', logs.filter(l => !/vite\]|PCFSoft/.test(l)).join(' | ') || '(no warnings or errors)');
  await b.close(); srv.kill(); process.exit(0);
})();
