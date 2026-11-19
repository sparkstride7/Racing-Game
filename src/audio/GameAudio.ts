import * as THREE from 'three';
import type { Race } from '../race/Race';
import type { Car } from '../vehicle/Car';
import { clamp } from '../utils/math';
import { AudioManager } from './AudioManager';
import { countdownBeep, finishFanfare, impact } from './effects';
import { EngineSound } from './EngineSound';
import { Music } from './Music';
import { TireSound } from './TireSound';

/** What the game tells the audio each frame. */
export interface AudioFrame {
  dt: number;
  playerCar: Car;
  /** 0..1 from the keyboard / touchscreen. */
  throttle: number;
  /** True while driving (not on the menu). */
  driving: boolean;
  /** True while the pause menu is open: everything goes quiet and nothing moves on. */
  paused: boolean;
  race: Race | null;
}

/** Remembers each car's last velocity and position, to detect sudden stops (collisions). */
interface ImpactTracker {
  velocity: THREE.Vector3;
  position: THREE.Vector3;
  cooldown: number;
  /** Strongest impact since the last frame (0 = none). */
  pending: number;
}

const RIGHT = new THREE.Vector3(1, 0, 0);

/**
 * Connects the game to the sounds: engine and tyres follow the player's car, collisions are detected
 * from sudden changes in speed, the countdown beeps and finish fanfare follow the race, and the music
 * plays during races only. It only reads the game's state; it never changes gameplay.
 */
export class GameAudio {
  readonly manager = new AudioManager();
  private engine: EngineSound | null = null;
  private rivalEngine: EngineSound | null = null;
  private tires: TireSound | null = null;
  private music: Music | null = null;

  private readonly trackers = new Map<Car, ImpactTracker>();
  private race: Race | null = null;
  private lastCountdown = '';
  private musicStarted = false;
  private finished = false;
  private paused = false;

  private readonly tmpV = new THREE.Vector3();
  private readonly tmpP = new THREE.Vector3();
  private readonly tmpQ = new THREE.Quaternion();
  private readonly tmpRight = new THREE.Vector3();

  constructor() {
    this.manager.onReady(() => {
      this.engine = new EngineSound(this.manager, 0.32);
      this.rivalEngine = new EngineSound(this.manager, 0.16);
      this.tires = new TireSound(this.manager);
      this.music = new Music(this.manager);
    });
  }

  /** Call from inside the tap/click/key press that starts a game mode (browser audio rule). */
  unlock() {
    this.manager.unlock();
  }

  /** Back to the menu: engines quiet, music off. */
  stopAll() {
    this.engine?.silence();
    this.rivalEngine?.silence();
    this.tires?.silence();
    this.music?.stop();
    this.paused = false;
    this.race = null;
    this.trackers.clear();
  }

  update(frame: AudioFrame) {
    if (!this.manager.isReady || !this.engine) return;
    const { playerCar, race } = frame;

    if (!frame.driving) {
      this.stopAll();
      return;
    }

    // A new race (or a restart) resets the race sounds.
    if (race !== this.race) {
      this.race = race;
      this.lastCountdown = '';
      this.musicStarted = false;
      this.finished = false;
      this.trackers.clear();
      // Leaving a race, or restarting from the pause menu: no paused music left over.
      if (!race || this.music!.paused) this.music!.stop();
    }

    // --- Paused: engines and tyres silent, music held where it is. ---
    if (frame.paused) {
      if (!this.paused) {
        this.paused = true;
        this.engine.silence();
        this.rivalEngine!.silence();
        this.tires!.silence();
        this.music!.pause();
      }
      return;
    }
    if (this.paused) {
      this.paused = false;
      this.music!.resume();
    }

    // --- Engine and tyres of the player's car. ---
    const speed = playerCar.forwardSpeed;
    this.engine.update(speed, frame.throttle);
    this.tires!.update(this.sidewaysSpeed(playerCar), speed);

    // --- Collisions found during the physics steps (player always; opponents when close enough to hear). ---
    this.playImpact(playerCar, 1);

    if (race) {
      // Nearest opponent's engine, fading with distance.
      let nearest: Car | null = null;
      let nearestD = Infinity;
      const me = playerCar.object.position;
      for (const r of race.racers) {
        if (r.isPlayer) continue;
        const d = r.car.object.position.distanceTo(me);
        this.playImpact(r.car, d < 45 ? 1 - d / 45 : 0);
        if (d < nearestD) {
          nearestD = d;
          nearest = r.car;
        }
      }
      if (nearest) this.rivalEngine!.update(nearest.forwardSpeed, 0.7, clamp(1 - nearestD / 60, 0, 1) ** 2);

      // --- Countdown beeps (3, 2, 1, GO!). ---
      const text = race.countdownText;
      if (text !== this.lastCountdown) {
        if (text === '3' || text === '2' || text === '1') countdownBeep(this.manager, false);
        else if (text === 'GO!') countdownBeep(this.manager, true);
        this.lastCountdown = text;
      }

      // --- Music starts at GO!. ---
      if (!this.musicStarted && race.time >= 0) {
        this.musicStarted = true;
        this.music!.start();
      }

      // --- Finish: fanfare, music turns down. ---
      if (!this.finished && race.player.finishTime !== null) {
        this.finished = true;
        const position = race.standings().indexOf(race.player) + 1;
        finishFanfare(this.manager, position === 1);
        this.music!.duck();
      }
    } else {
      this.rivalEngine!.silence();
      this.music!.stop(); // music is for races only
    }
  }

  /** Sideways sliding speed of a car (m/s). */
  private sidewaysSpeed(car: Car) {
    const v = car.body.linvel();
    const r = car.body.rotation();
    this.tmpQ.set(r.x, r.y, r.z, r.w);
    this.tmpRight.copy(RIGHT).applyQuaternion(this.tmpQ);
    return v.x * this.tmpRight.x + v.z * this.tmpRight.z;
  }

  /**
   * Call after every physics step (a fixed 60 times per second), so collisions are detected
   * the same way however fast or slow the screen is updating.
   */
  afterPhysicsStep(dt: number, playerCar: Car, race: Race | null) {
    if (!this.manager.isReady) return;
    this.checkImpact(playerCar, dt);
    if (race) for (const r of race.racers) if (!r.isPlayer) this.checkImpact(r.car, dt);
  }

  private playImpact(car: Car, volume: number) {
    const tracker = this.trackers.get(car);
    if (!tracker || tracker.pending <= 0) return;
    if (volume > 0) impact(this.manager, tracker.pending, volume);
    tracker.pending = 0;
  }

  /**
   * A collision shows up as a sudden drop in speed within one physics step, much bigger than
   * braking can cause. Teleports (reset button, putting a car back on track) are ignored.
   */
  private checkImpact(car: Car, dt: number) {
    const v = car.body.linvel();
    const p = car.body.translation();
    this.tmpV.set(v.x, 0, v.z);
    this.tmpP.set(p.x, 0, p.z);
    let tracker = this.trackers.get(car);
    if (!tracker) {
      tracker = { velocity: this.tmpV.clone(), position: this.tmpP.clone(), cooldown: 0, pending: 0 };
      this.trackers.set(car, tracker);
      return;
    }
    tracker.cooldown -= dt;
    const moved = tracker.position.distanceTo(this.tmpP);
    const teleported = moved > tracker.velocity.length() * dt * 2 + 3;
    const change = tracker.velocity.distanceTo(this.tmpV);
    const unexplained = change - 16 * dt; // hard braking alone is about 15 m/s²
    if (!teleported && unexplained > 0.8 && tracker.cooldown <= 0) {
      tracker.pending = Math.max(tracker.pending, clamp((unexplained - 0.8) / 5, 0, 1));
      tracker.cooldown = 0.3;
    }
    tracker.velocity.copy(this.tmpV);
    tracker.position.copy(this.tmpP);
  }

  /** For automated tests. */
  debugState() {
    const m = this.manager;
    return {
      ready: m.isReady,
      contextState: m.ctx?.state ?? null,
      muted: m.settings.muted,
      storageStatus: m.storageStatus,
      musicVolume: m.settings.musicVolume,
      sfxVolume: m.settings.sfxVolume,
      masterGain: m.isReady ? m.master.gain.value : null,
      musicGain: m.isReady ? m.music.gain.value : null,
      sfxGain: m.isReady ? m.sfx.gain.value : null,
      musicPlaying: this.music?.playing ?? false,
      musicPaused: this.music?.paused ?? false,
      engineFrequency: this.engine?.frequency ?? 0,
      engineLevel: this.engine?.level ?? 0,
      squeal: this.tires?.level ?? 0,
      counts: { ...m.stats },
    };
  }
}
