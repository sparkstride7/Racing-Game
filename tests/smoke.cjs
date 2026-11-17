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
  console.log('\n— Desktop free drive (keyboard) —');
  const { context, page, errors } = await openGame(browser, { viewport: { width: 1280, height: 720 } });
  await page.screenshot({ path: path.join(OUT, 'desktop-1-start-screen.png') });
  check('main menu shows Race and Free drive', (await page.locator('#mode-race').isVisible()) && (await page.locator('#mode-free').isVisible()));

  await page.keyboard.press('KeyF');
  await drive(page, 1.5);
  const s0 = await state(page);
  check('free drive started (alone, no opponents)', s0.started && s0.mode === 'free' && s0.race === null);
  check('car is resting on the ground', s0.position.y > 0.3 && s0.position.y < 1.0, `height ${s0.position.y.toFixed(2)} m`);

  await page.keyboard.down('ArrowUp');
  await drive(page, 3.5);
  const s1 = await state(page);
  await page.screenshot({ path: path.join(OUT, 'desktop-2-accelerating.png') });
  check('accelerates forward', s1.speedKmh > 50, `${s1.speedKmh.toFixed(0)} km/h`);
  const moved = Math.hypot(s1.position.x - s0.position.x, s1.position.z - s0.position.z);
  check('car moved', moved > 20, `${moved.toFixed(0)} m`);

  // A short steer to the right: long enough to prove steering works, short enough to stay off the barriers.
  await page.keyboard.down('ArrowRight');
  await drive(page, 0.6);
  const s2 = await state(page);
  await page.screenshot({ path: path.join(OUT, 'desktop-3-turning.png') });
  await page.keyboard.up('ArrowRight');
  check('steers', angleDiff(s2.heading, s1.heading) > 0.3, `turned ${angleDiff(s2.heading, s1.heading).toFixed(2)} rad`);
  check('stays upright while turning', s2.position.y > 0.3 && s2.position.y < 1.2);

  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('ArrowDown');
  await drive(page, 1.5);
  const s3 = await state(page);
  await page.keyboard.up('ArrowDown');
  check('brakes', s3.speedKmh < s2.speedKmh - 30, `${s2.speedKmh.toFixed(0)} → ${s3.speedKmh.toFixed(0)} km/h`);

  await page.keyboard.press('KeyR');
  await drive(page, 0.5);
  const s5 = await state(page);
  check('reset returns car to the start', Math.hypot(s5.position.x - s0.position.x, s5.position.z - s0.position.z) < 3);

  // Reverse in a straight line from the grid (the track behind it is a long straight).
  await page.keyboard.down('ArrowDown');
  await drive(page, 2.5);
  const s4 = await state(page);
  await page.keyboard.up('ArrowDown');
  const backwards = Math.hypot(s4.position.x - s5.position.x, s4.position.z - s5.position.z);
  check('reverses from a standstill', s4.speedKmh > 5 && backwards > 3, `${s4.speedKmh.toFixed(0)} km/h backwards, ${backwards.toFixed(0)} m`);

  console.log(`      frame rate in this test browser: ~${s1.fps.toFixed(0)} fps (software rendering, no GPU)`);
  check('no errors in the browser console', errors.length === 0, errors.join(' | '));
  await context.close();
}

async function circuitTest(browser) {
  console.log('\n— Circuit —');
  const { context, page, errors } = await openGame(browser, { viewport: { width: 1280, height: 720 } });
  await page.keyboard.press('KeyF');
  await drive(page, 1.5);
  const g = await state(page);
  check('car starts on the grid, on the asphalt', g.distanceFromCenter < 5, `${g.distanceFromCenter.toFixed(1)} m from the centre line`);
  await page.screenshot({ path: path.join(OUT, 'circuit-1-grid.png') });

  // Drive hard into the left-hand barrier and make sure it stops the car leaving the track.
  await page.keyboard.down('ArrowUp');
  await drive(page, 2.5);
  await page.keyboard.down('ArrowLeft');
  let furthest = 0;
  let maxHeight = 0;
  const t0 = (await state(page)).simTime;
  let s;
  do {
    s = await state(page);
    furthest = Math.max(furthest, s.distanceFromCenter);
    maxHeight = Math.max(maxHeight, s.position.y);
  } while (s.simTime - t0 < 3);
  await page.screenshot({ path: path.join(OUT, 'circuit-2-barrier.png') });
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  check(
    'safety barrier keeps the car on the circuit',
    furthest < s.barrierOffset,
    `furthest ${furthest.toFixed(1)} m from centre, barrier at ${s.barrierOffset.toFixed(1)} m`,
  );
  check('car stays on its wheels after hitting the barrier', maxHeight < 1.5);

  // Visit points all round the lap: the car must land on the road surface everywhere.
  let allGood = true;
  const details = [];
  for (const f of [0.1, 0.25, 0.4, 0.55, 0.7, 0.85]) {
    await page.evaluate((f) => window.__game.teleport(f), f);
    await drive(page, 1.5);
    const p = await state(page);
    const ok = p.position.y > 0.3 && p.position.y < 1.0 && p.distanceFromCenter < 1;
    if (!ok) allGood = false;
    details.push(`${Math.round(f * 100)}%: ${ok ? 'ok' : 'PROBLEM'}`);
    await page.screenshot({ path: path.join(OUT, `circuit-3-lap-${Math.round(f * 100)}pct.png`) });
  }
  check('car sits on the road all the way round the lap', allGood, details.join(', '));

  await page.evaluate(() => window.__game.returnToGrid());
  await drive(page, 1);
  const end = await state(page);
  check('car can be put back on the grid', end.distanceFromCenter < 5);
  console.log(`      per frame: ${end.drawCalls} draw calls, ${Math.round(end.triangles / 1000)}k triangles`);
  check('scene stays within the iPhone performance budget', end.drawCalls < 220 && end.triangles < 450000);
  check('no errors in the browser console', errors.length === 0, errors.join(' | '));
  await context.close();
}

async function raceTest(browser) {
  console.log('\n— Race (desktop) —');
  // ?laps=2 keeps the test short; real races are 3 laps.
  const { context, page, errors } = await openGame(browser, { viewport: { width: 1280, height: 720 } }, '?laps=2');
  await page.keyboard.press('Enter');
  await drive(page, 0.3);
  const early = await page.locator('#countdown').textContent();
  check('no "FINAL LAP" banner before the countdown', early !== 'FINAL LAP', `shows "${early}"`);
  await drive(page, 0.9);
  let s = await state(page);
  check('race mode started with 6 cars', s.mode === 'race' && s.race.cars.length === 6, `${s.race.cars.length} cars`);
  check('countdown is showing', ['3', '2', '1'].includes(s.race.countdown), `shows "${s.race.countdown}"`);
  await page.screenshot({ path: path.join(OUT, 'race-1-countdown.png') });
  const gridGaps = [];
  for (let i = 0; i < 6; i++)
    for (let j = i + 1; j < 6; j++) gridGaps.push(Math.hypot(s.race.cars[i].x - s.race.cars[j].x, s.race.cars[i].z - s.race.cars[j].z));
  check('all 6 cars on separate grid slots', Math.min(...gridGaps) > 5, `closest two cars ${Math.min(...gridGaps).toFixed(1)} m apart`);

  // Holding the gas during the countdown must not move the car.
  await page.keyboard.down('ArrowUp');
  while ((await state(page)).race.time < -0.3) await sleep(40);
  s = await state(page);
  check('nobody moves before GO', s.race.cars.every((c) => c.speedKmh < 2), s.race.cars.map((c) => c.speedKmh.toFixed(0)).join(','));
  while ((await state(page)).race.time < 0.05) await sleep(40);
  const goText = await page.locator('#countdown').textContent();
  await page.screenshot({ path: path.join(OUT, 'race-2-go.png') });
  check('GO! is shown at the start', goText === 'GO!', `shows "${goText}"`);

  await drive(page, 4);
  s = await state(page);
  await page.screenshot({ path: path.join(OUT, 'race-3-racing.png') });
  const ai = s.race.cars.filter((c) => c.name !== 'You');
  check('all 5 opponents are racing', ai.every((c) => c.speedKmh > 50), ai.map((c) => `${c.name} ${c.speedKmh.toFixed(0)}`).join(', '));
  check('race position is shown (1st–6th)', s.race.position >= 1 && s.race.position <= 6, `P${s.race.position}`);
  check('lap counter shows lap 1 of 2', s.race.lap === 1 && (await page.locator('#race-lap').textContent()) === '1');
  check('running order lists all 6 drivers', (await page.locator('#standings li').count()) === 6);
  console.log(`      per frame with 6 cars: ${s.drawCalls} draw calls, ${Math.round(s.triangles / 1000)}k triangles`);
  check('6-car race stays within the iPhone performance budget', s.drawCalls < 400 && s.triangles < 600000);

  // Jump to just before the finish line on the last lap and cross it.
  await page.evaluate(() => window.__game.placeBeforeFinish(40));
  await drive(page, 3.5);
  s = await state(page);
  await page.keyboard.up('ArrowUp');
  check('crossing the line on the last lap finishes the race', s.race.phase === 'finished');
  await sleep(400);
  await page.screenshot({ path: path.join(OUT, 'race-4-results.png') });
  check('results screen shows all 6 drivers', (await page.locator('#results').isVisible()) && (await page.locator('#results-body tr').count()) === 6);

  await page.locator('#race-again').click();
  await drive(page, 0.5);
  s = await state(page);
  check('"Race again" restarts with the countdown', s.race && s.race.phase === 'countdown' && s.race.cars.length === 6 && !(await page.locator('#results').isVisible()));

  await page.locator('#menu-button').click();
  await drive(page, 0.3);
  await page.keyboard.press('KeyF');
  await drive(page, 1);
  s = await state(page);
  check('back to free drive: opponents removed', s.mode === 'free' && s.race === null && !(await page.locator('#race-hud').isVisible()));
  check('no errors in the browser console', errors.length === 0, errors.join(' | '));
  await context.close();
}

async function iphoneRaceTest(browser) {
  console.log('\n— iPhone race (touch) —');
  const { context, page, errors } = await openGame(browser, devices['iPhone 13 landscape']);
  const cdp = await context.newCDPSession(page);
  await page.locator('#mode-race').tap();
  await drive(page, 1.2);
  await page.screenshot({ path: path.join(OUT, 'iphone-5-race-countdown.png') });
  check('race starts from the RACE button', (await state(page)).mode === 'race');
  check('race panel and touch controls are visible', (await page.locator('#race-hud').isVisible()) && (await page.locator('#touch-controls').isVisible()));
  while ((await state(page)).race.time < 0) await sleep(40);
  await holdTouch(page, cdp, '[data-action="gas"]', 3000);
  const s = await state(page);
  await page.screenshot({ path: path.join(OUT, 'iphone-6-racing.png') });
  const me = s.race.cars.find((c) => c.name === 'You');
  check('GAS button drives in the race', me.speedKmh > 40, `${me.speedKmh.toFixed(0)} km/h`);
  check('no errors in the browser console', errors.length === 0, errors.join(' | '));
  await context.close();
}

/** On-screen panels and buttons that must never overlap each other or leave the screen. */
const HUD_PARTS = {
  'position panel': '#race-hud .race-card',
  'running order': '#standings',
  speedometer: '#hud .speedo',
  'menu button': '#menu-button',
  'reset button': '#touch-controls .reset',
  'steering buttons': '#touch-controls .cluster.left',
  'pedal buttons': '#touch-controls .cluster.right',
};

async function hudLayoutTest(browser) {
  console.log('\n— HUD layout on iPhone screen sizes —');
  const screens = [
    'iPhone SE',
    'iPhone SE landscape',
    'iPhone 13',
    'iPhone 13 landscape',
    'iPhone 14 Pro Max',
    'iPhone 14 Pro Max landscape',
  ];
  for (const name of screens) {
    const { context, page } = await openGame(browser, devices[name]);
    for (const mode of ['race', 'free']) {
      if (mode === 'free') {
        await page.locator('#menu-button').tap();
        await sleep(300);
      }
      await page.locator(mode === 'race' ? '#mode-race' : '#mode-free').tap();
      await sleep(600);
      const boxes = {};
      for (const [label, selector] of Object.entries(HUD_PARTS)) {
        const el = page.locator(selector);
        if (await el.isVisible()) boxes[label] = await el.boundingBox();
      }
      const vp = page.viewportSize();
      const problems = [];
      const labels = Object.keys(boxes);
      for (const a of labels) {
        const b = boxes[a];
        if (b.x < 0 || b.y < 0 || b.x + b.width > vp.width + 0.5 || b.y + b.height > vp.height + 0.5) problems.push(`${a} goes off screen`);
      }
      for (let i = 0; i < labels.length; i++)
        for (let j = i + 1; j < labels.length; j++) {
          const a = boxes[labels[i]];
          const b = boxes[labels[j]];
          const gapX = Math.max(b.x - (a.x + a.width), a.x - (b.x + b.width));
          const gapY = Math.max(b.y - (a.y + a.height), a.y - (b.y + b.height));
          if (gapX < 4 && gapY < 4) problems.push(`${labels[i]} overlaps ${labels[j]}`);
        }
      if ((await page.locator('#countdown').textContent()) === 'FINAL LAP') problems.push('"FINAL LAP" shown at the start');
      const file = `layout-${name.replace(/\s+/g, '-')}-${mode}.png`;
      await page.screenshot({ path: path.join(OUT, file) });
      check(`${name} (${vp.width}×${vp.height}) ${mode}: panels don't overlap and fit on screen`, problems.length === 0, problems.join('; '));
    }
    await context.close();
  }
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

  await page.locator('#mode-free').tap();
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
  const right = await page.locator('[data-action="right"]').boundingBox();
  await cdp.send('Input.dispatchTouchEvent', {
    type: 'touchStart',
    touchPoints: [
      { x: gas.x + gas.width / 2, y: gas.y + gas.height / 2, id: 1 },
      { x: right.x + right.width / 2, y: right.y + right.height / 2, id: 2 },
    ],
  });
  await drive(page, 0.6);
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
    const sections = { desktopTest, circuitTest, raceTest, iphoneTest, iphoneRaceTest, hudLayoutTest };
    // Run one section with e.g. ONLY=hudLayoutTest npm run test:e2e
    for (const [name, run] of Object.entries(sections)) {
      if (!process.env.ONLY || process.env.ONLY === name) await run(browser);
    }
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
