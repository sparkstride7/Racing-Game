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

  await leaveToMenu(page, false);
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
  'pause button': '#pause-button',
  'mini-map': '#minimap',
  'sound button': '#sound-button',
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
    await page.locator('#sound-settings-button').tap();
    await sleep(200);
    const card = await page.locator('.sound-card').boundingBox();
    const vp0 = page.viewportSize();
    const fits = card.x >= 0 && card.y >= 0 && card.x + card.width <= vp0.width && card.y + card.height <= vp0.height;
    await page.screenshot({ path: path.join(OUT, `layout-${name.replace(/\s+/g, '-')}-sound-panel.png`) });
    check(`${name}: sound settings panel fits on screen`, fits, fits ? '' : `panel ${Math.round(card.width)} px wide on a ${vp0.width} px screen`);
    await page.locator('#sound-done').tap();
    for (const mode of ['race', 'free']) {
      if (mode === 'free') {
        await leaveToMenu(page, true);
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
      if (mode === 'race') {
        await page.evaluate(() => window.__game.placeBeforeFinish(5));
        await page.locator('#results').waitFor({ state: 'visible', timeout: 60000 }).catch(() => undefined);
        const results = await page.locator('.results-card').boundingBox();
        const ok = results && results.x >= 0 && results.x + results.width <= vp.width + 0.5;
        await page.screenshot({ path: path.join(OUT, `layout-${name.replace(/\s+/g, '-')}-results.png`) });
        check(`${name}: results screen fits the screen width`, ok, results ? `${Math.round(results.width)} px wide on a ${vp.width} px screen` : 'results not shown');
        await page.locator('#results-menu').tap();
        await sleep(300);
        await page.locator('#mode-race').tap(); // back into the race so the next screenshot matches
        await sleep(300);
      }
      const file = `layout-${name.replace(/\s+/g, '-')}-${mode}.png`;
      await page.screenshot({ path: path.join(OUT, file) });
      check(`${name} (${vp.width}×${vp.height}) ${mode}: panels don't overlap and fit on screen`, problems.length === 0, problems.join('; '));
    }
    await context.close();
  }
}

/** Pause → Main Menu → "Leave": back to the main menu (by touch with `tap`, otherwise by mouse). */
async function leaveToMenu(page, tap) {
  const press = (selector) => (tap ? page.locator(selector).tap() : page.locator(selector).click());
  await press('#pause-button');
  await press('#pause-main-menu');
  await press('#confirm-ok');
  await page.locator('#mode-race').waitFor({ state: 'visible' });
  await sleep(300);
}

/** Everything that must stand completely still while the game is paused. */
function frozenSnapshot(s) {
  return JSON.stringify({
    simTime: s.simTime,
    race: s.race && { phase: s.race.phase, time: s.race.time, countdown: s.race.countdown, lap: s.race.lap, position: s.race.position, cars: s.race.cars },
    position: s.position,
    speedKmh: s.speedKmh,
  });
}

async function pauseTest(browser) {
  console.log('\n— Pause menu (desktop) —');
  const { context, page, errors } = await openGame(browser, { viewport: { width: 1280, height: 720 } }, '?laps=2');
  const visible = (selector) => page.locator(selector).isVisible();
  await page.keyboard.press('Enter');
  await drive(page, 1.2);
  check('pause button is shown while racing', await visible('#pause-button'));

  // 1. Pause during the countdown: the countdown stops too.
  await page.locator('#pause-button').click();
  await sleep(150);
  let a = await state(page);
  await sleep(1500);
  let b = await state(page);
  check('pausing during the countdown freezes it', a.paused && b.paused && a.race.phase === 'countdown' && frozenSnapshot(a) === frozenSnapshot(b), `race clock ${a.race.time.toFixed(2)} → ${b.race.time.toFixed(2)} s`);
  const labels = await page.locator('#pause-main .btn').allTextContents();
  check('pause menu shows Resume, Restart Race, Settings, Main Menu', (await visible('#pause-menu')) && labels.join('|') === 'Resume|Restart Race|Settings|Main Menu', labels.join(', '));
  check('pause button hidden while the menu is open', !(await visible('#pause-button')));
  await page.screenshot({ path: path.join(OUT, 'pause-1-countdown.png') });
  await page.locator('#pause-resume').click();
  await drive(page, 0.2);
  b = await state(page);
  check('Resume continues the countdown', !b.paused && b.race.time > a.race.time && b.race.time < a.race.time + 0.6 && !(await visible('#pause-menu')), `race clock ${a.race.time.toFixed(2)} → ${b.race.time.toFixed(2)} s`);

  // 2. Pause mid-race (Esc key) with everything moving.
  await page.keyboard.down('ArrowUp');
  while ((await state(page)).race.time < 0.05) await sleep(40);
  await drive(page, 4);
  await page.keyboard.press('Escape');
  await sleep(150);
  a = await state(page);
  const timeText = await page.locator('#race-time').textContent();
  await sleep(2000);
  b = await state(page);
  const moving = a.race.cars.filter((c) => c.speedKmh > 30).length;
  check('Esc pauses the race', a.paused && (await visible('#pause-menu')));
  check('paused: player, opponents, race clock, laps and positions all frozen', frozenSnapshot(a) === frozenSnapshot(b), `${moving} cars were moving; clock ${a.race.time.toFixed(2)} → ${b.race.time.toFixed(2)} s`);
  check('paused: on-screen race time stops', (await page.locator('#race-time').textContent()) === timeText, timeText);
  if (b.audio.ready) {
    check('paused: engine silent and music held', b.audio.engineLevel === 0 && b.audio.musicPaused === true, `engine ${b.audio.engineLevel}, music paused ${b.audio.musicPaused}`);
  }
  await page.keyboard.press('KeyR'); // reset key must do nothing while paused
  await sleep(200);
  check('reset key does nothing while paused', frozenSnapshot(await state(page)) === frozenSnapshot(a));
  await page.screenshot({ path: path.join(OUT, 'pause-2-racing.png') });

  // 3. Resume (Esc again): carries on from exactly the same moment.
  await page.keyboard.press('Escape');
  const c = await state(page);
  await drive(page, 0.5);
  const d = await state(page);
  const me = (s) => s.race.cars.find((x) => x.name === 'You');
  check('Resume starts from exactly where it paused', !c.paused && c.race.time - a.race.time < 0.2 && Math.abs(me(c).distance - me(a).distance) < 4, `clock ${a.race.time.toFixed(2)} → ${c.race.time.toFixed(2)} s, distance ${me(a).distance.toFixed(1)} → ${me(c).distance.toFixed(1)} m`);
  check('after Resume: speeds kept and the race moves on', d.race.time > c.race.time && Math.abs(me(c).speedKmh - me(a).speedKmh) < 15 && me(d).distance > me(c).distance, `${me(a).speedKmh.toFixed(0)} → ${me(c).speedKmh.toFixed(0)} km/h`);
  if (d.audio.ready) check('after Resume: music playing again', d.audio.musicPlaying && !d.audio.musicPaused);
  await page.keyboard.up('ArrowUp');

  // 4. Restart asks first; Cancel keeps the race.
  await page.keyboard.press('KeyP');
  await sleep(150);
  a = await state(page);
  await page.locator('#pause-restart').click();
  check('Restart Race asks for confirmation', (await visible('#pause-confirm')) && (await page.locator('#confirm-title').textContent()) === 'Restart the race?');
  await page.screenshot({ path: path.join(OUT, 'pause-3-confirm-restart.png') });
  await page.locator('#confirm-cancel').click();
  b = await state(page);
  check('Cancel keeps the race paused and unchanged', b.paused && (await visible('#pause-main')) && frozenSnapshot(a) === frozenSnapshot(b));
  await page.locator('#pause-restart').click();
  await page.locator('#confirm-ok').click();
  await drive(page, 0.3);
  b = await state(page);
  check('confirmed Restart starts the race again from the grid', !b.paused && b.race.phase === 'countdown' && b.race.time < -3 && b.race.cars.every((x) => x.distance < 5) && !(await visible('#pause-menu')) && (await visible('#pause-button')));

  // 5. Settings opens the sound settings on top; Done returns to the pause menu.
  await page.locator('#pause-button').click();
  await page.locator('#pause-settings').click();
  await sleep(200);
  const card = await page.locator('.sound-card').boundingBox();
  const onTop = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('#sound-panel'), [card.x + card.width / 2, card.y + 20]);
  check('Settings opens the sound settings on top of the pause menu', (await visible('#sound-panel')) && onTop && (await state(page)).paused);
  await page.screenshot({ path: path.join(OUT, 'pause-4-settings.png') });
  await page.locator('#sound-done').click();
  check('Done returns to the pause menu, still paused', !(await visible('#sound-panel')) && (await visible('#pause-menu')) && (await state(page)).paused);

  // 6. Main Menu asks first.
  await page.locator('#pause-main-menu').click();
  check('Main Menu asks for confirmation', (await page.locator('#confirm-title').textContent()) === 'Leave the race?' && (await page.locator('#confirm-ok').textContent()) === 'Leave');
  await page.locator('#confirm-cancel').click();
  check('Cancel stays paused in the race', (await state(page)).paused && (await state(page)).mode === 'race');
  await page.locator('#pause-main-menu').click();
  await page.locator('#confirm-ok').click();
  await sleep(300);
  b = await state(page);
  check('confirmed Main Menu leaves the race', !b.paused && b.mode === null && b.race === null && (await visible('#mode-race')) && !(await visible('#pause-menu')) && !(await visible('#pause-button')));

  // 7. Free drive can be paused too.
  await page.keyboard.press('KeyF');
  await page.keyboard.down('ArrowUp');
  await drive(page, 2);
  await page.locator('#pause-button').click();
  await sleep(150);
  a = await state(page);
  await sleep(1000);
  b = await state(page);
  check('free drive: pause freezes the car', a.paused && frozenSnapshot(a) === frozenSnapshot(b) && a.speedKmh > 20, `${a.speedKmh.toFixed(0)} km/h`);
  check('free drive: restart button says "Restart Drive"', (await page.locator('#pause-restart').textContent()) === 'Restart Drive');
  await page.locator('#pause-resume').click();
  await drive(page, 0.5);
  await page.keyboard.up('ArrowUp');
  check('free drive: Resume carries on', !(await state(page)).paused && (await state(page)).speedKmh > 20);
  check('no errors in the browser console', errors.length === 0, errors.join(' | '));
  await context.close();
}

/** Pause menu by touch on iPhone sizes, upright and sideways, including turning the phone while paused. */
async function iphonePauseTest(browser) {
  console.log('\n— Pause menu on iPhone (touch) —');
  const fits = (box, vp) => box && box.x >= 0 && box.y >= 0 && box.x + box.width <= vp.width + 0.5 && box.y + box.height <= vp.height + 0.5;
  for (const name of ['iPhone SE', 'iPhone SE landscape', 'iPhone 13', 'iPhone 13 landscape', 'iPhone 14 Pro Max', 'iPhone 14 Pro Max landscape']) {
    const { context, page, errors } = await openGame(browser, devices[name]);
    const cdp = await context.newCDPSession(page);
    const file = name.replace(/\s+/g, '-');
    await page.locator('#mode-race').tap();
    while ((await state(page)).race.time < 0.2) await sleep(40);
    await holdTouch(page, cdp, '[data-action="gas"]', 1500);
    await page.locator('#pause-button').tap();
    await sleep(200);
    let vp = page.viewportSize();
    const a = await state(page);
    await sleep(1000);
    const b = await state(page);
    const buttons = await page.locator('#pause-main .btn').evaluateAll((els) => els.map((e) => e.getBoundingClientRect()).map((r) => ({ x: r.x, y: r.y, width: r.width, height: r.height })));
    const card = await page.locator('.pause-card').boundingBox();
    const problems = [];
    if (!fits(card, vp)) problems.push('menu goes off screen');
    if (buttons.some((r) => r.height < 44)) problems.push('a button is shorter than 44 px');
    // Nothing behind the menu can be touched: the middle of the GAS button now hits the menu backdrop.
    const gas = await page.locator('[data-action="gas"]').boundingBox();
    const blocked = await page.evaluate(([x, y]) => !!document.elementFromPoint(x, y)?.closest('#pause-menu'), [gas.x + gas.width / 2, gas.y + gas.height / 2]);
    if (!blocked) problems.push('driving buttons can still be pressed');
    await page.screenshot({ path: path.join(OUT, `pause-${file}.png`) });
    check(`${name} (${vp.width}×${vp.height}): pause menu fits, buttons easy to tap, controls blocked`, problems.length === 0, problems.join('; '));
    check(`${name}: race frozen while paused (by touch)`, a.paused && frozenSnapshot(a) === frozenSnapshot(b) && a.speedKmh > 10, `${a.speedKmh.toFixed(0)} km/h`);

    await page.locator('#pause-main-menu').tap();
    const confirm = await page.locator('.pause-card').boundingBox();
    check(`${name}: "Leave the race?" question fits`, fits(confirm, vp) && (await page.locator('#confirm-ok').isVisible()));
    await page.screenshot({ path: path.join(OUT, `pause-${file}-confirm.png`) });
    await page.locator('#confirm-cancel').tap();

    // Turn the phone while paused: still frozen, menu still fits.
    await page.setViewportSize({ width: vp.height, height: vp.width });
    await sleep(400);
    vp = page.viewportSize();
    const c = await state(page);
    check(`${name}: turning the phone while paused keeps it frozen and the menu fits`, c.paused && frozenSnapshot(c) === frozenSnapshot(a) && fits(await page.locator('.pause-card').boundingBox(), vp));
    await page.screenshot({ path: path.join(OUT, `pause-${file}-turned.png`) });

    await page.locator('#pause-resume').tap();
    await drive(page, 0.5);
    const d = await state(page);
    check(`${name}: Resume by touch carries on`, !d.paused && d.race.time > a.race.time && !(await page.locator('#pause-menu').isVisible()));
    check(`${name}: no errors in the browser console`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
}

/** Each car's paint colour, as set in the game (the player is red). */
const PAINT = { You: '#e3262f', Nova: '#6b2fd6', Ember: '#ff6a00', Frost: '#e9eef3', Volt: '#ffc400', Jade: '#0f8a5f' };

/** Colour actually drawn on the mini-map at (x, y) CSS pixels inside it. */
function mapPixel(page, x, y) {
  return page.evaluate(([x, y]) => {
    const c = document.getElementById('minimap');
    const k = c.width / c.getBoundingClientRect().width;
    const d = c.getContext('2d').getImageData(Math.round(x * k), Math.round(y * k), 1, 1).data;
    return [d[0], d[1], d[2], d[3]];
  }, [x, y]);
}
const hexRgb = (h) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
const near = (px, hex, tol = 40) => px[3] > 200 && hexRgb(hex).every((v, i) => Math.abs(v - px[i]) <= tol);

/** Checks the mini-map against the game: one arrow per car, right colour, right place, right direction. */
async function checkMiniMap(page, label) {
  const s = await state(page);
  const m = s.miniMap;
  const box = await page.locator('#minimap').boundingBox();
  const cars = s.race ? s.race.cars : [{ name: 'You', shownX: s.position.x, shownZ: s.position.z, heading: s.heading }];
  const problems = [];
  if (m.markers.length !== cars.length) problems.push(`${m.markers.length} arrows for ${cars.length} cars`);
  for (const car of cars) {
    const mk = m.markers.find((x) => x.name === car.name);
    if (!mk) {
      problems.push(`no arrow for ${car.name}`);
      continue;
    }
    // Independent check of where the arrow should be: the car's position, scaled into the map.
    const ex = (car.shownX - m.minX) * m.scale + m.offsetX;
    const ey = (car.shownZ - m.minZ) * m.scale + m.offsetY;
    if (Math.hypot(mk.x - ex, mk.y - ey) > 0.5) problems.push(`${car.name} arrow ${Math.hypot(mk.x - ex, mk.y - ey).toFixed(1)} px out`);
    if (mk.x < 0 || mk.y < 0 || mk.x > box.width || mk.y > box.height) problems.push(`${car.name} arrow outside the map`);
    // Direction: the arrow must point the same way as the car.
    const expected = Math.atan2(Math.cos(car.heading), Math.sin(car.heading));
    if (Math.abs(Math.atan2(Math.sin(mk.angle - expected), Math.cos(mk.angle - expected))) > 0.02) problems.push(`${car.name} arrow points the wrong way`);
    if (mk.colour !== PAINT[car.name]) problems.push(`${car.name} arrow is ${mk.colour}, car is ${PAINT[car.name]}`);
    if (mk.isPlayer !== (car.name === 'You')) problems.push(`${car.name} highlighted wrongly`);
  }
  // What is really drawn: your arrow (on top) shows your red at its centre; an opponent's colour shows where
  // no other arrow is drawn over it.
  for (const mk of m.markers) {
    const covered = m.markers.some((o) => o !== mk && (o.isPlayer || m.markers.indexOf(o) > m.markers.indexOf(mk)) && Math.hypot(o.x - mk.x, o.y - mk.y) < (o.isPlayer ? 15 : 10));
    if (covered && !mk.isPlayer) continue;
    const px = await mapPixel(page, mk.x + Math.cos(mk.angle) * 1.5, mk.y + Math.sin(mk.angle) * 1.5);
    if (!near(px, mk.colour)) problems.push(`${mk.name} arrow not drawn in its colour (found rgb ${px.slice(0, 3).join(',')})`);
  }
  check(`${label}: mini-map shows every car in the right place, colour and direction`, problems.length === 0, problems.join('; ') || `${m.markers.length} arrows`);
  return m;
}

async function miniMapTest(browser) {
  console.log('\n— Mini-map (desktop) —');
  const { context, page, errors } = await openGame(browser, { viewport: { width: 1280, height: 720 } }, '?laps=2');
  check('mini-map hidden on the main menu', !(await page.locator('#minimap').isVisible()));
  await page.keyboard.press('Enter');
  await drive(page, 0.5);
  check('mini-map shown in the race', await page.locator('#minimap').isVisible());
  let m = await checkMiniMap(page, 'on the grid');
  check('6 arrows, each a different colour', new Set(m.markers.map((x) => x.colour)).size === 6, m.markers.map((x) => `${x.name} ${x.colour}`).join(', '));
  // The whole circuit is drawn inside the map: count track pixels along each edge band and in the middle.
  const coverage = await page.evaluate(() => {
    const c = document.getElementById('minimap');
    const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data;
    let lit = 0;
    for (let i = 0; i < d.length; i += 4) if (d[i + 3] > 150 && d[i] > 150 && d[i + 1] > 150 && d[i + 2] > 150) lit++;
    return lit / (c.width * c.height);
  });
  check('circuit is drawn on the map', coverage > 0.05 && coverage < 0.5, `${(coverage * 100).toFixed(0)}% of the map is track`);
  const g = m;
  check('whole circuit fits inside the map', g.offsetX >= 10 && g.offsetY >= 10 && g.width - g.offsetX >= 10, `${g.width.toFixed(0)}×${g.height.toFixed(0)} px`);

  // Racing: the arrows follow the cars in real time.
  await page.keyboard.down('ArrowUp');
  while ((await state(page)).race.time < 0.05) await sleep(40);
  await drive(page, 3);
  const a = await checkMiniMap(page, 'racing');
  await drive(page, 3);
  const b = await checkMiniMap(page, 'racing 3 s later');
  const moved = a.markers.map((x) => Math.hypot(x.x - b.markers.find((y) => y.name === x.name).x, x.y - b.markers.find((y) => y.name === x.name).y));
  check('all 6 arrows move around the track as the cars drive', moved.every((d) => d > 3), moved.map((d) => d.toFixed(0) + ' px').join(', '));
  await page.screenshot({ path: path.join(OUT, 'minimap-1-race-desktop.png') });

  // Paused: the map stands still with everything else.
  await page.keyboard.press('Escape');
  await sleep(200);
  const p1 = (await state(page)).miniMap.markers;
  await sleep(1000);
  const p2 = (await state(page)).miniMap.markers;
  check('paused: mini-map arrows stand still', JSON.stringify(p1) === JSON.stringify(p2));
  check('pause menu covers the mini-map', await page.evaluate(() => {
    const r = document.getElementById('minimap').getBoundingClientRect();
    return !!document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2)?.closest('#pause-menu');
  }));
  await page.keyboard.press('Escape');
  await drive(page, 0.5);
  await checkMiniMap(page, 'after Resume');
  await page.keyboard.up('ArrowUp');

  // Free drive: just your car.
  await leaveToMenu(page, false);
  check('mini-map hidden again on the main menu', !(await page.locator('#minimap').isVisible()));
  await page.keyboard.press('KeyF');
  await page.keyboard.down('ArrowUp');
  await drive(page, 2);
  m = await checkMiniMap(page, 'free drive');
  check('free drive: only your arrow', m.markers.length === 1 && m.markers[0].isPlayer);
  await page.keyboard.up('ArrowUp');
  check('no errors in the browser console', errors.length === 0, errors.join(' | '));
  await context.close();
}

/** Mini-map on iPhone screens, upright and sideways, and turning the phone mid-race. */
async function iphoneMiniMapTest(browser) {
  console.log('\n— Mini-map on iPhone (touch) —');
  for (const name of ['iPhone SE landscape', 'iPhone 13', 'iPhone 13 landscape']) {
    const { context, page, errors } = await openGame(browser, devices[name]);
    const cdp = await context.newCDPSession(page);
    const file = name.replace(/\s+/g, '-');
    await page.locator('#mode-race').tap();
    while ((await state(page)).race.time < 0.2) await sleep(40);
    await holdTouch(page, cdp, '[data-action="gas"]', 2500);
    const box = await page.locator('#minimap').boundingBox();
    check(`${name}: mini-map is small (${Math.round(box.width)}×${Math.round(box.height)} px)`, box.width <= 130 && box.height <= 150 && box.width >= 80);
    await checkMiniMap(page, name);
    // Taps on the map area go through to the game (the map never blocks a touch).
    check(`${name}: mini-map never blocks a tap`, await page.evaluate(() => getComputedStyle(document.getElementById('minimap')).pointerEvents === 'none'));
    await page.screenshot({ path: path.join(OUT, `minimap-${file}.png`) });

    // Turn the phone mid-race: the map moves to its other spot and redraws to fit.
    const vp = page.viewportSize();
    await page.setViewportSize({ width: vp.height, height: vp.width });
    await sleep(500);
    const turned = await page.locator('#minimap').boundingBox();
    const vp2 = page.viewportSize();
    check(`${name} → turned: mini-map fits on screen`, turned.x >= 0 && turned.y >= 0 && turned.x + turned.width <= vp2.width && turned.y + turned.height <= vp2.height, `${Math.round(turned.width)}×${Math.round(turned.height)} px`);
    const m = await checkMiniMap(page, `${name} → turned`);
    check(`${name} → turned: map redrawn at its new size`, Math.abs(m.width - turned.width) < 1 && Math.abs(m.height - turned.height) < 1);
    await page.screenshot({ path: path.join(OUT, `minimap-${file}-turned.png`) });
    check(`${name}: no errors in the browser console`, errors.length === 0, errors.join(' | '));
    await context.close();
  }
}

/** Waits (in game time, up to `seconds`) until `test(state)` is true. Returns the last state. */
async function waitUntil(page, test, seconds) {
  const start = (await state(page)).simTime;
  let s = await state(page);
  while (!test(s) && s.simTime - start < seconds) {
    await sleep(40);
    s = await state(page);
  }
  return s;
}

async function audioTest(browser) {
  console.log('\n— Sound —');
  const { context, page, errors } = await openGame(browser, { viewport: { width: 1280, height: 720 } }, '?laps=2');
  let a = (await state(page)).audio;
  check('no sound before the player interacts (browser rule)', a.ready === false && a.contextState === null);

  // Sound settings panel on the main menu.
  await page.locator('#sound-settings-button').click();
  check('sound settings panel opens from the menu', await page.locator('#sound-panel').isVisible());
  await page.locator('#music-volume').fill('30');
  await page.locator('#sfx-volume').fill('55');
  a = (await state(page)).audio;
  check('music and effects volumes adjust separately', Math.abs(a.musicVolume - 0.3) < 0.01 && Math.abs(a.sfxVolume - 0.55) < 0.01, `music ${a.musicVolume}, effects ${a.sfxVolume}`);
  await page.locator('#sound-done').click();
  check('sound settings panel closes', !(await page.locator('#sound-panel').isVisible()));

  // Start a race: sound switches on.
  await page.locator('#mode-race').click();
  await drive(page, 0.3);
  let s = await state(page);
  check('sound starts when the player taps RACE', s.audio.ready && s.audio.contextState === 'running', s.audio.contextState);
  check('no music during the countdown', !s.audio.musicPlaying);
  const idleFrequency = s.audio.engineFrequency;
  const beepsBefore = s.audio.counts.beep; // the volume preview may have beeped once

  // Countdown → GO.
  s = await waitUntil(page, (x) => x.race.time > 0.3, 8);
  check('countdown beeps on 3, 2 and 1', s.audio.counts.beep - beepsBefore === 3, `${s.audio.counts.beep - beepsBefore} beeps`);
  check('GO! beep', s.audio.counts.go === 1);
  check('race music starts at GO!', s.audio.musicPlaying);

  // Engine pitch follows speed.
  await page.keyboard.down('ArrowUp');
  s = await waitUntil(page, (x) => x.speedKmh > 90, 6);
  check('no false crash sounds during clean driving (start, acceleration)', s.audio.counts.impact === 0, `${s.audio.counts.impact} crash sound(s)`);
  // Hard braking alone must not sound like a crash either.
  await page.keyboard.up('ArrowUp');
  await page.keyboard.down('ArrowDown');
  await drive(page, 1.2);
  await page.keyboard.up('ArrowDown');
  check('no crash sound when braking hard', (await state(page)).audio.counts.impact === 0);
  await page.keyboard.down('ArrowUp');
  await drive(page, 1);
  check('engine pitch rises with speed', s.audio.engineFrequency > idleFrequency + 40, `${idleFrequency.toFixed(0)} Hz at rest → ${s.audio.engineFrequency.toFixed(0)} Hz at ${s.speedKmh.toFixed(0)} km/h`);

  // Hard steering with the handbrake: the tyres squeal.
  await page.keyboard.down('ArrowLeft');
  await page.keyboard.down('Space');
  let maxSqueal = 0;
  await waitUntil(
    page,
    (x) => {
      maxSqueal = Math.max(maxSqueal, x.audio.squeal);
      return maxSqueal > 0.2;
    },
    4,
  );
  await page.keyboard.up('Space');
  check('tyres squeal when sliding', maxSqueal > 0.2, `loudest squeal ${(maxSqueal * 100).toFixed(0)}%`);

  await page.keyboard.up('ArrowLeft');

  // Finish line.
  await page.evaluate(() => window.__game.placeBeforeFinish(40));
  s = await waitUntil(page, (x) => x.audio.counts.finish > 0, 6);
  await page.keyboard.up('ArrowUp');
  check('finish fanfare when the player completes the race', s.audio.counts.finish === 1);

  // Mute button and M key.
  await page.locator('#results-menu').click();
  await page.locator('#mode-free').click();
  await drive(page, 0.5);
  s = await state(page);
  check('no music in free drive', !s.audio.musicPlaying);
  check('engine sound in free drive', s.audio.engineLevel > 0);

  // Drive down the straight, then turn into the barrier: a crash sound.
  await page.keyboard.down('ArrowUp');
  await drive(page, 2.5);
  const impactsBefore = (await state(page)).audio.counts.impact;
  await page.keyboard.down('ArrowLeft');
  s = await waitUntil(page, (x) => x.audio.counts.impact > impactsBefore, 6);
  await page.keyboard.up('ArrowLeft');
  await page.keyboard.up('ArrowUp');
  check('collision sound when hitting the barrier', s.audio.counts.impact > impactsBefore, `${s.audio.counts.impact - impactsBefore} impact(s), ${s.distanceFromCenter.toFixed(1)} m from centre`);
  check('sound button is visible while driving', await page.locator('#sound-button').isVisible());
  await page.locator('#sound-button').click();
  await sleep(300);
  s = await state(page);
  check('sound button mutes everything', s.audio.muted && s.audio.masterGain < 0.05, `volume ${s.audio.masterGain.toFixed(2)}`);
  await page.keyboard.press('KeyM');
  await sleep(300);
  s = await state(page);
  check('M key turns sound back on', !s.audio.muted && s.audio.masterGain > 0.9);
  await page.locator('#sound-button').click(); // mute again, to test that it is remembered

  // Settings are remembered after reloading the page.
  await page.reload();
  await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
  s = await state(page);
  check(
    'sound settings are remembered',
    s.audio.muted && Math.abs(s.audio.musicVolume - 0.3) < 0.01 && Math.abs(s.audio.sfxVolume - 0.55) < 0.01,
  );
  await page.locator('#sound-settings-button').click();
  check('settings panel shows the saved choices', (await page.locator('#sound-toggle').textContent()) === 'Off' && (await page.locator('#music-volume').inputValue()) === '30');
  await page.locator('#sound-toggle').click();
  check('sound can be switched back on from the settings panel', !(await state(page)).audio.muted);
  check('no errors in the browser console', errors.length === 0, errors.join(' | '));
  await context.close();
}

/** Drags a finger across a slider from one fraction of its width to another (real touch events). */
async function touchDrag(page, cdp, selector, from, to) {
  const box = await page.locator(selector).boundingBox();
  const y = box.y + box.height / 2;
  const x = (f) => box.x + box.width * f;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: x(from), y }] });
  for (let i = 1; i <= 12; i++) {
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: x(from + (to - from) * (i / 12)), y }] });
    await sleep(16);
  }
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await sleep(250); // let the volume glide to its new level
}

async function sliderTest(browser) {
  console.log('\n— Sound sliders (touch and mouse) —');
  for (const name of ['iPhone SE', 'iPhone 13 landscape', 'iPhone 14 Pro Max']) {
    const { context, page, errors } = await openGame(browser, devices[name]);
    const cdp = await context.newCDPSession(page);
    await page.locator('#sound-settings-button').tap();
    await sleep(300);

    // Music: drag from the right end down to about a quarter.
    await touchDrag(page, cdp, '#music-volume', 0.95, 0.27);
    let s = await state(page);
    const music = Number(await page.locator('#music-volume').inputValue());
    check(
      `${name}: Music slider follows a finger drag`,
      music >= 15 && music <= 35,
      `moved to ${music}`,
    );
    check(
      `${name}: Music volume changes immediately`,
      Math.abs(s.audio.musicVolume - music / 100) < 0.001 && Math.abs(s.audio.musicGain - (music / 100) ** 2) < 0.02,
      `setting ${s.audio.musicVolume}, music level ${s.audio.musicGain?.toFixed(3)}`,
    );

    // Effects: drag from the left end up to about three quarters.
    const beepsBefore = s.audio.counts.beep;
    await touchDrag(page, cdp, '#sfx-volume', 0.05, 0.73);
    s = await state(page);
    const sfx = Number(await page.locator('#sfx-volume').inputValue());
    check(`${name}: Effects slider follows a finger drag`, sfx >= 62 && sfx <= 84, `moved to ${sfx}`);
    check(
      `${name}: Effects volume changes immediately (with a preview beep)`,
      Math.abs(s.audio.sfxVolume - sfx / 100) < 0.001 && Math.abs(s.audio.sfxGain - (sfx / 100) ** 2) < 0.02 && s.audio.counts.beep > beepsBefore,
      `setting ${s.audio.sfxVolume}, effects level ${s.audio.sfxGain?.toFixed(3)}`,
    );

    // Saved on the device: still there after refreshing.
    await page.reload();
    await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
    s = await state(page);
    check(
      `${name}: slider settings are kept after refreshing`,
      Math.round(s.audio.musicVolume * 100) === music && Math.round(s.audio.sfxVolume * 100) === sfx,
      `music ${Math.round(s.audio.musicVolume * 100)}, effects ${Math.round(s.audio.sfxVolume * 100)}`,
    );
    check(`${name}: no errors`, errors.length === 0, errors.join(' | '));
    await context.close();
  }

  // Desktop: dragging with a mouse.
  const { context, page, errors } = await openGame(browser, { viewport: { width: 1280, height: 720 } });
  await page.locator('#sound-settings-button').click();
  const box = await page.locator('#music-volume').boundingBox();
  const y = box.y + box.height / 2;
  const before = await page.locator('#music-volume').inputValue();
  await page.mouse.move(box.x + box.width * 0.1, y);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.5, y, { steps: 5 });
  await page.mouse.move(box.x + box.width * 0.9, y, { steps: 5 });
  await page.mouse.up();
  await sleep(250);
  const after = Number(await page.locator('#music-volume').inputValue());
  const s = await state(page);
  check('desktop: Music slider works with a mouse drag', after >= 80 && Math.abs(s.audio.musicVolume - after / 100) < 0.001, `${before} → ${after}`);
  check('desktop: no errors', errors.length === 0, errors.join(' | '));
  await context.close();
}

async function persistenceTest(browser) {
  console.log('\n— Sound settings: save, close, reopen —');
  const KEY = 'racing-game-audio';
  const openTab = async (context, name) => {
    const page = await context.newPage();
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
    await page.goto(URL);
    await page.waitForFunction(() => window.__game && window.__game.ready, null, { timeout: 30000 });
    return { page, errors, cdp: name ? await context.newCDPSession(page) : null };
  };
  const sliders = async (page) => [Number(await page.locator('#music-volume').inputValue()), Number(await page.locator('#sfx-volume').inputValue())];
  const stored = (page) => page.evaluate((k) => localStorage.getItem(k), KEY);

  // --- iPhone: first visit, change both sliders by touch, close the tab, reopen. ---
  const phone = await browser.newContext(devices['iPhone 13']);
  let tab = await openTab(phone, 'touch');
  let a = (await state(tab.page)).audio;
  check('first visit: defaults used when nothing is saved', a.storageStatus === 'defaults' && a.musicVolume === 0.6 && a.sfxVolume === 0.8);
  await tab.page.locator('#sound-settings-button').tap();
  await touchDrag(tab.page, tab.cdp, '#music-volume', 0.9, 0.27);
  await touchDrag(tab.page, tab.cdp, '#sfx-volume', 0.1, 0.69);
  const [music, sfx] = await sliders(tab.page);
  a = (await state(tab.page)).audio;
  check('changes are saved on the device', a.storageStatus === 'saved' && (await tab.page.locator('#sound-save-status').textContent()).includes('Saved'), `${music} / ${sfx}`);
  await tab.page.close(); // close the tab

  tab = await openTab(phone, 'touch'); // reopen the game in a new tab
  a = (await state(tab.page)).audio;
  await tab.page.locator('#sound-settings-button').tap();
  const [m2, s2] = await sliders(tab.page);
  check('after closing and reopening: both sliders show the saved values', m2 === music && s2 === sfx, `music ${m2} (saved ${music}), effects ${s2} (saved ${sfx})`);
  check('panel says the saved settings were restored', a.storageStatus === 'restored' && (await tab.page.locator('#sound-save-status').textContent()).includes('restored'));
  await tab.page.locator('#sound-done').tap();
  const before = await stored(tab.page);
  await tab.page.locator('#mode-race').tap(); // sound switches on
  await sleep(500);
  a = (await state(tab.page)).audio;
  check(
    'restored values are the actual music and effects volumes',
    Math.abs(a.musicGain - (music / 100) ** 2) < 0.01 && Math.abs(a.sfxGain - (sfx / 100) ** 2) < 0.01,
    `music level ${a.musicGain.toFixed(3)} (expected ${((music / 100) ** 2).toFixed(3)}), effects level ${a.sfxGain.toFixed(3)} (expected ${((sfx / 100) ** 2).toFixed(3)})`,
  );
  check('starting the game does not overwrite the saved settings', (await stored(tab.page)) === before);
  check('no errors', tab.errors.length === 0, tab.errors.join(' | '));
  await phone.close();

  // --- Saved values are never replaced by defaults at start-up, damaged values are handled. ---
  const ctx = await browser.newContext(devices['iPhone 13']);
  tab = await openTab(ctx);
  await tab.page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ muted: false, musicVolume: 0.15, sfxVolume: 0.4 })), KEY);
  await tab.page.close();
  tab = await openTab(ctx);
  a = (await state(tab.page)).audio;
  check('saved values load at start-up (not defaults)', a.musicVolume === 0.15 && a.sfxVolume === 0.4);
  await tab.page.locator('#mode-free').tap();
  await sleep(300);
  check('switching sound on keeps the saved values', JSON.parse(await stored(tab.page)).musicVolume === 0.15);

  await tab.page.evaluate((k) => localStorage.setItem(k, JSON.stringify({ musicVolume: 0.3 })), KEY);
  await tab.page.close();
  tab = await openTab(ctx);
  a = (await state(tab.page)).audio;
  check('partly saved settings: saved value kept, missing one uses its default', a.musicVolume === 0.3 && a.sfxVolume === 0.8);

  await tab.page.evaluate((k) => localStorage.setItem(k, 'not valid data'), KEY);
  await tab.page.close();
  tab = await openTab(ctx);
  a = (await state(tab.page)).audio;
  check('damaged saved data: defaults used, no crash', a.musicVolume === 0.6 && a.sfxVolume === 0.8 && tab.errors.length === 0);
  await ctx.close();

  // --- A browser that blocks storage: the game still works and says so. ---
  const blocked = await browser.newContext(devices['iPhone 13']);
  await blocked.addInitScript(() => {
    Object.defineProperty(window, 'localStorage', { get() { throw new Error('storage blocked'); } });
  });
  tab = await openTab(blocked);
  await tab.page.locator('#sound-settings-button').tap();
  const msg = await tab.page.locator('#sound-save-status').textContent();
  check('storage blocked: game still runs and warns that settings cannot be saved', (await state(tab.page)).audio.storageStatus === 'unavailable' && msg.includes('not letting'), msg);
  await tab.page.locator('#music-volume').fill('40');
  check('storage blocked: sliders still change the volume', (await state(tab.page)).audio.musicVolume === 0.4 && tab.errors.length === 0, tab.errors.join(' | '));
  await blocked.close();

  // --- Desktop: save with the mouse, close, reopen. ---
  const desk = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  tab = await openTab(desk);
  await tab.page.locator('#sound-settings-button').click();
  const box = await tab.page.locator('#sfx-volume').boundingBox();
  await tab.page.mouse.move(box.x + box.width * 0.8, box.y + box.height / 2);
  await tab.page.mouse.down();
  await tab.page.mouse.move(box.x + box.width * 0.3, box.y + box.height / 2, { steps: 6 });
  await tab.page.mouse.up();
  await tab.page.locator('#music-volume').fill('45');
  const [dm, ds] = await sliders(tab.page);
  await tab.page.close();
  tab = await openTab(desk);
  await tab.page.locator('#sound-settings-button').click();
  const [dm2, ds2] = await sliders(tab.page);
  check('desktop: settings saved, and restored after closing and reopening', dm2 === dm && ds2 === ds && dm === 45, `music ${dm2}, effects ${ds2}`);
  await desk.close();
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
    const sections = { desktopTest, circuitTest, raceTest, pauseTest, miniMapTest, audioTest, sliderTest, persistenceTest, iphoneTest, iphoneRaceTest, iphonePauseTest, iphoneMiniMapTest, hudLayoutTest };
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
