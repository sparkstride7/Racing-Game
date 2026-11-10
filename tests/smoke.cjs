/**
 * Automated "smoke test": opens the built game in a real (headless) browser,
 * drives the car with the keyboard (desktop) and with touch (iPhone-sized screen),
 * checks it really moves and steers, and saves screenshots to test-results/.
 *
 * Run with:  npm run build && npm run test:e2e
 * Needs Playwright with Chromium installed (it is pre-installed in the cloud environment).
 */
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const { chromium, devices } = require('playwright');

const PORT = 4173;
const URL = `http://localhost:${PORT}/`;
const OUT = path.join(__dirname, '..', 'test-results');

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let failures = 0;
function check(name, ok, detail) {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

async function startServer() {
  const server = spawn('npx', ['vite', 'preview', '--port', String(PORT), '--strictPort'], {
    cwd: path.join(__dirname, '..'),
    stdio: 'pipe',
  });
  for (let i = 0; i < 50; i++) {
    try {
      const res = await fetch(URL);
      if (res.ok) return server;
    } catch {}
    await sleep(200);
  }
  server.kill();
  throw new Error('Preview server did not start. Did you run "npm run build"?');
}

async function openGame(browser, contextOptions, query = '') {
  const context = await browser.newContext(contextOptions);
  const page = await context.newPage();
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
  await page.goto(URL + query);
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  await drive(page, 1.5); // let the car settle on its suspension
  return { context, page, errors };
}

const state = (page) => page.evaluate(() => window.__game.state());

/**
 * Waits until `seconds` of *game* time have passed. The test browser has no graphics card,
 * so it runs slower than a real phone; waiting on game time keeps the checks fair.
 */
async function drive(page, seconds) {
  const start = (await state(page)).simTime;
  const deadline = Date.now() + 60000;
  while ((await state(page)).simTime - start < seconds) {
    if (Date.now() > deadline) throw new Error('Game stopped advancing');
    await sleep(50);
  }
}
const angleDiff = (a, b) => Math.abs(Math.atan2(Math.sin(a - b), Math.cos(a - b)));

async function desktopTest(browser) {
  console.log('\n— Desktop (keyboard) —');
  const { context, page, errors } = await openGame(browser, { viewport: { width: 1280, height: 720 } });
  await page.screenshot({ path: path.join(OUT, 'desktop-1-start-screen.png') });

  await page.keyboard.press('Enter');
  await drive(page, 1.5);
  const s0 = await state(page);
  check('game started', s0.started);
  check('car is resting on the ground', s0.position.y > 0.3 && s0.position.y < 1.0, `height ${s0.position.y.toFixed(2)} m`);

  await page.keyboard.down('ArrowUp');
  await drive(page, 3.5);
  const s1 = await state(page);
  await page.screenshot({ path: path.join(OUT, 'desktop-2-accelerating.png') });
  check('accelerates forward', s1.speedKmh > 50, `${s1.speedKmh.toFixed(0)} km/h`);
  const moved = Math.hypot(s1.position.x - s0.position.x, s1.position.z - s0.position.z);
  check('car moved', moved > 20, `${moved.toFixed(0)} m`);

  // Steer left: towards the inside of the circuit (right would hit the grandstand).
  await page.keyboard.down('ArrowLeft');
  await drive(page, 1.2);
  const s2 = await state(page);
  await page.screenshot({ path: path.join(OUT, 'desktop-3-turning.png') });
  await page.keyboard.up('ArrowLeft');
  check('steers', angleDiff(s2.heading, s1.heading) > 0.3, `turned ${angleDiff(s2.heading, s1.heading).toFixed(2)} rad`);
  check('stays upright while turning', s2.position.y > 0.3 && s2.position.y < 1.2);

  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('ArrowDown');
  await drive(page, 1.5);
  const s3 = await state(page);
  await page.keyboard.up('ArrowDown');
  check('brakes', s3.speedKmh < s2.speedKmh - 30, `${s2.speedKmh.toFixed(0)} → ${s3.speedKmh.toFixed(0)} km/h`);

  await page.keyboard.down('ArrowDown');
  await drive(page, 2.5);
  const s4 = await state(page);
  await page.keyboard.up('ArrowDown');
  check('reverses after stopping', s4.speedKmh > 5, `${s4.speedKmh.toFixed(0)} km/h backwards`);

  await page.keyboard.press('KeyR');
  await drive(page, 0.5);
  const s5 = await state(page);
  check('reset returns car to the start', Math.hypot(s5.position.x - s0.position.x, s5.position.z - s0.position.z) < 3);

  console.log(`      frame rate in this test browser: ~${s1.fps.toFixed(0)} fps (software rendering, no GPU)`);
  check('no errors in the browser console', errors.length === 0, errors.join(' | '));
  await context.close();
}

/** Holds a finger on a button for `ms` milliseconds using real touch events. */
async function holdTouch(page, cdp, selector, ms) {
  const box = await page.locator(selector).boundingBox();
  const x = box.x + box.width / 2;
  const y = box.y + box.height / 2;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id: 1 }] });
  await drive(page, ms / 1000);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
}

async function iphoneTest(browser) {
  console.log('\n— iPhone (touch, landscape) —');
  const { context, page, errors } = await openGame(browser, devices['iPhone 13 landscape']);
  const cdp = await context.newCDPSession(page);
  await page.screenshot({ path: path.join(OUT, 'iphone-1-start-screen.png') });

  await page.locator('#start-screen').tap();
  await drive(page, 1.5);
  const s0 = await state(page);
  check('game started by tapping', s0.started);
  check('touch controls are visible', await page.locator('#touch-controls').isVisible());

  await holdTouch(page, cdp, '[data-action="gas"]', 3000);
  const s1 = await state(page);
  check('GAS button accelerates', s1.speedKmh > 40, `${s1.speedKmh.toFixed(0)} km/h`);
  await page.screenshot({ path: path.join(OUT, 'iphone-2-driving.png') });

  // Gas and steer with two fingers at once.
  const gas = await page.locator('[data-action="gas"]').boundingBox();
  const left = await page.locator('[data-action="left"]').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: gas.x + gas.width / 2, y: gas.y + gas.height / 2, id: 1 },
      { x: left.x + left.width / 2, y: left.y + left.height / 2, id: 2 },
    ],
  });
  await drive(page, 1.2);
  const s2 = await state(page);
  await page.screenshot({ path: path.join(OUT, 'iphone-3-turning.png') });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check('two-finger gas + steer works', angleDiff(s2.heading, s1.heading) > 0.3, `turned ${angleDiff(s2.heading, s1.heading).toFixed(2)} rad`);

  await holdTouch(page, cdp, '[data-action="brake"]', 1500);
  const s3 = await state(page);
  check('BRAKE button slows the car', s3.speedKmh < s2.speedKmh - 20, `${s2.speedKmh.toFixed(0)} → ${s3.speedKmh.toFixed(0)} km/h`);
  check('no errors in the browser console', errors.length === 0, errors.join(' | '));
  await context.close();

  console.log('\n— iPhone (portrait start screen) —');
  const portrait = await openGame(browser, devices['iPhone 13']);
  await portrait.page.screenshot({ path: path.join(OUT, 'iphone-4-portrait.png') });
  await portrait.context.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const server = await startServer();
  const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
  try {
    await desktopTest(browser);
    await iphoneTest(browser);
  } finally {
    await browser.close();
    server.kill();
  }
  console.log(failures === 0 ? '\nAll checks passed.' : `\n${failures} check(s) failed.`);
  console.log(`Screenshots saved in ${OUT}`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
