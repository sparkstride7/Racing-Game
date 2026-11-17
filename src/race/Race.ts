import * as THREE from 'three';
import type { World } from '@dimforge/rapier3d-compat';
import { RACE } from '../config';
import type { DriveControls } from '../input/Input';
import { seededRandom } from '../utils/math';
import { Car } from '../vehicle/Car';
import { PLAYER_STYLE, type CarStyle } from '../vehicle/CarModel';
import type { Circuit } from '../world/Circuit';
import { AIDriver, type Traffic } from './AIDriver';
import { RacingLine } from './RacingLine';
import { OPPONENTS } from './roster';
import { TrackProgress } from './TrackProgress';

export type RacePhase = 'countdown' | 'racing' | 'finished';

/** One car in the race. */
export interface Racer {
  name: string;
  style: CarStyle;
  isPlayer: boolean;
  car: Car;
  progress: TrackProgress;
  /** AI driver (for the player's car this is only used for a cool-down lap after finishing). */
  driver: AIDriver;
  /** Race time (seconds) when this car finished, or null. */
  finishTime: number | null;
  lapTimes: number[];
  lastLapStart: number;
}

const NO_INPUT: DriveControls = { throttle: 0, brake: 0, steer: 0, handbrake: false };
/** The countdown starts this many seconds before the green light. */
const COUNTDOWN_LEAD = 4;

/**
 * A race: the player against five AI opponents over a number of laps.
 * Handles the grid, the 3-2-1-GO countdown, positions, lap counting, the finish and results.
 * Contains no on-screen code, so it can also run without graphics in automated tests.
 */
export class Race {
  readonly racers: Racer[] = [];
  readonly laps: number;
  phase: RacePhase = 'countdown';
  /** Seconds since the green light (negative during the countdown). */
  time = -COUNTDOWN_LEAD;
  /** True once every car has finished or the time limit after the player's finish has passed. */
  complete = false;

  private readonly line: RacingLine;
  private readonly opponentCars: Car[] = [];
  private finishOrder: Racer[] = [];
  private playerFinishTime: number | null = null;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly world: World,
    private readonly scene: THREE.Scene,
    private readonly circuit: Circuit,
    playerCar: Car,
    laps = RACE.laps,
  ) {
    this.laps = laps;
    this.line = new RacingLine(circuit.path);

    // Grid order: opponents fill the slots around the player's chosen slot.
    const slots = [...Array(6).keys()];
    const playerSlot = RACE.playerGridSlot;
    const aiSlots = slots.filter((s) => s !== playerSlot);
    const rand = seededRandom(99);

    this.addRacer('You', PLAYER_STYLE, true, playerCar, playerSlot, 0.15);
    OPPONENTS.forEach((opponent, i) => {
      const car = new Car(world, opponent.style);
      scene.add(car.object);
      this.opponentCars.push(car);
      this.addRacer(opponent.name, opponent.style, false, car, aiSlots[i], 0.1 + rand() * 0.35, opponent.skill);
    });
    this.restart();
  }

  private addRacer(
    name: string,
    style: CarStyle,
    isPlayer: boolean,
    car: Car,
    slot: number,
    reaction: number,
    skill = { cornerGrip: 15, braking: 8, lane: 0 },
  ) {
    const grid = this.circuit.gridSlot(slot);
    car.setSpawn(grid.position, grid.heading);
    const progress = new TrackProgress(this.circuit.path, this.circuit.startLineDistance, grid.position);
    const driver = new AIDriver(car, this.line, progress, { ...skill, reaction });
    const racer: Racer = { name, style, isPlayer, car, progress, driver, finishTime: null, lapTimes: [], lastLapStart: 0 };
    // If a car ends up on its roof, put it back on the track where it was (not on the grid).
    car.onAutoReset = () => this.recover(racer);
    this.racers.push(racer);
  }

  get player() {
    return this.racers[0];
  }

  /** Puts every car back on the grid and restarts the countdown. */
  restart() {
    for (const r of this.racers) {
      r.car.reset(); // back to its grid slot
      r.progress.reset(this.tmp.copy(r.car.body.translation()));
      r.finishTime = null;
      r.lapTimes = [];
      r.lastLapStart = 0;
      r.driver.resetStuck();
    }
    this.phase = 'countdown';
    this.time = -COUNTDOWN_LEAD;
    this.complete = false;
    this.finishOrder = [];
    this.playerFinishTime = null;
    this.circuit.setStartLights(0);
  }

  /** What the countdown shows right now: 3, 2, 1, GO! or nothing. */
  get countdownText(): string {
    if (this.time < -3) return '';
    if (this.time < 0) return String(Math.ceil(-this.time));
    if (this.time < 1) return 'GO!';
    return '';
  }

  /** Runs one physics step for every car. `playerControls` comes from the keyboard/touchscreen. */
  fixedUpdate(dt: number, playerControls: DriveControls) {
    this.time += dt;
    if (this.phase === 'countdown') {
      // Start lights: one more lights up every 0.6 s, then all go out at GO.
      this.circuit.setStartLights(this.time < 0 ? Math.min(5, Math.floor((this.time + 3) / 0.6) + 1) : 0);
      if (this.time >= 0) this.phase = 'racing';
    }

    for (const r of this.racers) {
      let controls: DriveControls;
      if (this.time < 0) controls = NO_INPUT;
      else if (r.isPlayer && r.finishTime === null) controls = playerControls;
      else if (r.finishTime !== null) controls = r.driver.drive(dt, this.time, this.trafficFor(r), 0.6); // cool-down lap
      else controls = r.driver.drive(dt, this.time, this.trafficFor(r));
      r.car.fixedUpdate(controls, dt);
    }
  }

  /** Call after each physics step: updates positions, laps and finishes. */
  postStep() {
    const finishDistance = this.laps * this.circuit.path.length;
    for (const r of this.racers) {
      r.car.postStep();
      r.progress.update(r.car.body.translation());
      if (this.time < 0) continue;

      // Lap completed?
      const lapsDone = Math.floor(r.progress.totalDistance / this.circuit.path.length);
      if (lapsDone > r.lapTimes.length && r.lapTimes.length < this.laps) {
        r.lapTimes.push(this.time - r.lastLapStart);
        r.lastLapStart = this.time;
      }
      // Finished?
      if (r.finishTime === null && r.progress.totalDistance >= finishDistance) {
        r.finishTime = this.time;
        this.finishOrder.push(r);
        if (r.isPlayer) {
          this.playerFinishTime = this.time;
          this.phase = 'finished';
        }
      }
      // An AI car that has been stuck for a while is put back on the track.
      if (!r.isPlayer && r.driver.isStuck) this.recover(r);
    }

    const allDone = this.racers.every((r) => r.finishTime !== null);
    if (this.playerFinishTime !== null && (allDone || this.time - this.playerFinishTime > RACE.finishTimeout)) {
      this.complete = true;
    }
  }

  render(alpha: number) {
    for (const r of this.racers) r.car.render(alpha);
  }

  /** Cars in race order: finishers first (by finishing time), then everyone else by distance covered. */
  standings(): Racer[] {
    const running = this.racers
      .filter((r) => r.finishTime === null)
      .sort((a, b) => b.progress.totalDistance - a.progress.totalDistance);
    return [...this.finishOrder, ...running];
  }

  /** The player's current lap (1..laps). */
  currentLap(racer: Racer = this.player) {
    const lap = Math.floor(Math.max(0, racer.progress.totalDistance) / this.circuit.path.length) + 1;
    return Math.min(lap, this.laps);
  }

  /** Puts a car back on the track at its current spot, facing the right way (used for resets and stuck cars). */
  recover(r: Racer) {
    const samples = this.circuit.path.samples;
    const n = samples.length - 1;
    const s = samples[(r.progress.index + 4) % n];
    // Use whichever side of the road is free of other cars.
    let lateral = 3;
    for (const side of [3, -3, 0]) {
      this.tmp.copy(s.point).addScaledVector(s.left, side);
      const blocked = this.racers.some((o) => o !== r && o.car.object.position.distanceTo(this.tmp) < 6);
      if (!blocked) {
        lateral = side;
        break;
      }
    }
    this.tmp.copy(s.point).addScaledVector(s.left, lateral);
    r.car.placeAt(this.tmp, Math.atan2(s.tangent.x, s.tangent.z));
    r.driver.resetStuck();
  }

  /** Cars near `me` (from just behind to 30 m ahead), measured along the track. */
  trafficFor(me: Racer): Traffic[] {
    const L = this.circuit.path.length;
    const traffic: Traffic[] = [];
    for (const other of this.racers) {
      if (other === me) continue;
      let gap = (other.progress.totalDistance - me.progress.totalDistance) % L;
      if (gap > L / 2) gap -= L;
      if (gap < -L / 2) gap += L;
      if (gap < -6 || gap > 30) continue;
      const pos = other.car.body.translation();
      traffic.push({ distance: gap, lateral: me.progress.lateralOffset(pos), speed: other.car.forwardSpeed });
    }
    return traffic;
  }

  /** Removes the opponents' cars (when leaving race mode). */
  dispose() {
    this.player.car.onAutoReset = null; // free drive resets to the grid again
    for (const car of this.opponentCars) {
      this.scene.remove(car.object);
      car.dispose(this.world);
    }
    this.circuit.setStartLights(5);
  }
}
