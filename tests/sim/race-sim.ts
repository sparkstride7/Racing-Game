/**
 * Headless race simulation: runs complete races with all six cars, with no graphics,
 * many times faster than real time. Checks that the AI opponents can race properly.
 *
 * Run with:  npm run test:race
 *
 * The player's car is driven by a test driver with "good human" skill, so we can see
 * whether the opponents are competitive but beatable.
 */
installFakeCanvas();

import * as THREE from 'three';
import { Physics } from '../../src/core/Physics';
import { Race } from '../../src/race/Race';
import { AIDriver } from '../../src/race/AIDriver';
import { RacingLine } from '../../src/race/RacingLine';
import { TrackProgress } from '../../src/race/TrackProgress';
import { Car } from '../../src/vehicle/Car';
import { Circuit } from '../../src/world/Circuit';
import { OPPONENTS } from '../../src/race/roster';

let failures = 0;
function check(name: string, ok: boolean, detail = '') {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
}

const fmt = (t: number | null) => (t === null ? '  —  ' : `${Math.floor(t / 60)}:${(t % 60).toFixed(2).padStart(5, '0')}`);

async function runRace(label: string, playerGrip: number) {
  const physics = await Physics.create();
  const world = physics.world;
  const scene = new THREE.Scene();
  const circuit = new Circuit(scene, world);
  const player = new Car(world);
  const race = new Race(world, scene, circuit, player);

  // Test driver for the player's car.
  const testDriver = new AIDriver(player, new RacingLine(circuit.path), race.player.progress, {
    cornerGrip: playerGrip,
    braking: 10,
    lane: 0,
    reaction: 0.25,
  });

  // Count recoveries and wall/car contacts.
  const recoveries = new Map<string, number>();
  const originalRecover = race.recover.bind(race);
  race.recover = (r) => {
    recoveries.set(r.name, (recoveries.get(r.name) ?? 0) + 1);
    originalRecover(r);
  };
  const furthest = new Map<string, number>();
  let carContactSteps = 0;
  const colliders = race.racers.map((r) => r.car.body.collider(0));

  const dt = physics.dt;
  const pos = new THREE.Vector3();
  const startedAt = performance.now();
  while (!race.complete && race.time < 400) {
    const controls = testDriver.drive(dt, race.time, race.trafficFor(race.player));
    race.fixedUpdate(dt, controls);
    world.step();
    race.postStep();

    for (const r of race.racers) {
      pos.copy(r.car.body.translation());
      const d = circuit.path.distanceToCenter(pos);
      furthest.set(r.name, Math.max(furthest.get(r.name) ?? 0, d));
    }
    let touching = false;
    for (let i = 0; i < colliders.length; i++)
      for (let j = i + 1; j < colliders.length; j++)
        world.contactPair(colliders[i], colliders[j], (m) => {
          if (m.numContacts() > 0) touching = true;
        });
    if (touching) carContactSteps++;
  }
  const seconds = (performance.now() - startedAt) / 1000;

  console.log(`\n— ${label} (test driver grip ${playerGrip}) — simulated ${race.time.toFixed(0)} s in ${seconds.toFixed(1)} s`);
  console.log('Pos  Driver  Finish     Best lap   Laps                         Furthest  Recovered');
  race.standings().forEach((r, i) => {
    const best = r.lapTimes.length ? Math.min(...r.lapTimes) : null;
    console.log(
      `${String(i + 1).padStart(2)}   ${r.name.padEnd(6)}  ${fmt(r.finishTime)}   ${fmt(best)}   ${r.lapTimes.map(fmt).join(' ').padEnd(27)}  ${furthest.get(r.name)!.toFixed(1).padStart(5)} m   ${recoveries.get(r.name) ?? 0}`,
    );
  });
  console.log(`Steps with car-to-car contact: ${carContactSteps} (${((carContactSteps * dt)).toFixed(1)} s)`);
  return { race, circuit, recoveries, furthest };
}

/** Time trial: one car alone, driven at the car's real limit. Returns its best lap time. */
async function limitLap(grip: number) {
  const physics = await Physics.create();
  const world = physics.world;
  const circuit = new Circuit(new THREE.Scene(), world);
  const car = new Car(world);
  const grid = circuit.gridSlot(0);
  car.setSpawn(grid.position, grid.heading);
  const progress = new TrackProgress(circuit.path, circuit.startLineDistance, grid.position);
  const driver = new AIDriver(car, new RacingLine(circuit.path), progress, { cornerGrip: grip, braking: 11, lane: 0, reaction: 0 });
  const laps: number[] = [];
  let lastCount = 0;
  let lapStart = 0;
  for (let t = 0; t < 200 && laps.length < 3; t += physics.dt) {
    car.fixedUpdate(driver.drive(physics.dt, t, []), physics.dt);
    world.step();
    car.postStep();
    progress.update(car.body.translation());
    const count = Math.floor(progress.totalDistance / circuit.path.length);
    if (count > lastCount) {
      laps.push(t - lapStart);
      lapStart = t;
      lastCount = count;
    }
  }
  return Math.min(...laps.slice(1)); // ignore the first lap (standing start)
}

/** One car drives flat out into another parked car: they must collide, not pass through each other. */
async function collisionTest() {
  const physics = await Physics.create();
  const world = physics.world;
  const circuit = new Circuit(new THREE.Scene(), world);
  const a = new Car(world);
  const b = new Car(world, OPPONENTS[0].style);
  const ga = circuit.gridSlot(0);
  const gb = circuit.gridSlot(0);
  const ahead = new THREE.Vector3(Math.sin(ga.heading), 0, Math.cos(ga.heading));
  a.setSpawn(ga.position, ga.heading);
  b.setSpawn(gb.position.clone().addScaledVector(ahead, 25), gb.heading);
  let contact = false;
  let minGap = Infinity;
  const pa = new THREE.Vector3();
  const pb = new THREE.Vector3();
  for (let t = 0; t < 4; t += physics.dt) {
    a.fixedUpdate({ throttle: 1, brake: 0, steer: 0, handbrake: false }, physics.dt);
    b.fixedUpdate({ throttle: 0, brake: 0, steer: 0, handbrake: false }, physics.dt);
    world.step();
    a.postStep();
    b.postStep();
    world.contactPair(a.body.collider(0), b.body.collider(0), (m) => {
      if (m.numContacts() > 0) contact = true;
    });
    pa.copy(a.body.translation());
    pb.copy(b.body.translation());
    // Gap along the driving direction between the two car centres.
    minGap = Math.min(minGap, pb.clone().sub(pa).dot(ahead));
  }
  check('cars collide with each other', contact);
  check('cars cannot drive through each other', minGap > 3.5, `closest centre-to-centre ${minGap.toFixed(1)} m (cars are 4.1 m long)`);
  check('the hit car is pushed forward', pb.clone().sub(gb.position).dot(ahead) > 30);
}

(async () => {
  await collisionTest();
  const best = await limitLap(24);
  console.log(`Fastest possible lap (car driven at its limit, alone): ${fmt(best)}`);

  const { race, circuit, recoveries, furthest } = await runRace('Race 1', Number(process.env.PLAYER_GRIP ?? 22));
  const ai = race.racers.filter((r) => !r.isPlayer);
  check('race completed', race.complete);
  check('all 5 opponents finished all laps', ai.every((r) => r.finishTime !== null && r.lapTimes.length === race.laps));
  check('nobody went beyond the barriers', [...furthest.values()].every((d) => d < circuit.barrierOffset));
  const totalRecoveries = ai.reduce((n, r) => n + (recoveries.get(r.name) ?? 0), 0);
  check('opponents rarely need rescuing', totalRecoveries <= 2, `${totalRecoveries} recoveries`);
  const times = ai.map((r) => r.finishTime!).filter((t) => t !== null);
  const spread = Math.max(...times) - Math.min(...times);
  check('field is close (fastest to slowest opponent under 30 s)', spread < 30, `${spread.toFixed(1)} s`);

  const fastestAiLap = Math.min(...ai.flatMap((r) => r.lapTimes));
  const margin = fastestAiLap - best;
  check(
    'fair: the fastest opponent is beatable (at least 1 s per lap slower than the limit)',
    margin >= 1,
    `fastest opponent lap ${fmt(fastestAiLap)}, ${margin.toFixed(1)} s off the limit`,
  );
  check('competitive: the fastest opponent is within 4 s per lap of the limit', margin <= 4);
  const playerPos = race.standings().indexOf(race.player) + 1;
  check('a skilled driver starting 4th can reach the podium', playerPos <= 3, `finished P${playerPos}`);

  console.log(failures === 0 ? '\nAll race checks passed.' : `\n${failures} race check(s) failed.`);
  process.exit(failures === 0 ? 0 : 1);
})().catch((e) => {
  console.error(e);
  process.exit(1);
});

/** The game draws some textures with a canvas; without a browser we give it a do-nothing stand-in. */
function installFakeCanvas() {
  const noop = () => ({ addColorStop() {} });
  const context = new Proxy({} as Record<string | symbol, unknown>, {
    get: (target, prop) => (prop in target ? target[prop] : noop),
    set: (target, prop, value) => ((target[prop] = value), true),
  });
  (globalThis as unknown as { document: unknown }).document = {
    createElement: () => ({ width: 0, height: 0, getContext: () => context }),
  };
}
