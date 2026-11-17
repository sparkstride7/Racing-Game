import * as THREE from 'three';
import { ChaseCamera } from '../camera/ChaseCamera';
import { CAR } from '../config';
import { Input, type DriveControls } from '../input/Input';
import { GameAudio } from '../audio/GameAudio';
import { Race } from '../race/Race';
import { Hud, type GameMode } from '../ui/Hud';
import { RaceHud } from '../ui/RaceHud';
import { SoundControls } from '../ui/SoundControls';
import { Car } from '../vehicle/Car';
import { Environment } from '../world/Environment';
import { Circuit } from '../world/Circuit';
import { Physics } from './Physics';

const NO_INPUT: DriveControls = { throttle: 0, brake: 0, steer: 0, handbrake: false };

/**
 * The heart of the game: creates everything and runs the loop
 * (read input → step physics → move camera → draw), once per screen refresh.
 */
export class Game {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly isTouch: boolean;
  readonly hud: Hud;
  /** All sound and music (generated in code). */
  readonly audio = new GameAudio();

  private physics!: Physics;
  private environment!: Environment;
  private track!: Circuit;
  private car!: Car;
  private chaseCamera!: ChaseCamera;
  private input!: Input;

  private started = false;
  private mode: GameMode | null = null;
  private race: Race | null = null;
  private raceHud!: RaceHud;
  /** Race length override for testing (add ?laps=1 to the address). */
  private readonly raceLaps = Number(new URLSearchParams(location.search).get('laps')) || undefined;
  private readonly timer = new THREE.Timer();
  private fps = 60;

  constructor(container: HTMLElement) {
    this.isTouch = detectTouch();
    this.hud = new Hud(this.isTouch);

    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
    // Phones have very dense screens; capping the resolution keeps the frame rate high.
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.8;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    container.appendChild(this.renderer.domElement);
  }

  /** Loads the physics engine and builds the world. */
  async init() {
    this.physics = await Physics.create();

    this.environment = new Environment(this.scene, this.renderer, {
      shadowMapSize: this.isTouch ? 1024 : 2048,
    });
    this.track = new Circuit(this.scene, this.physics.world);

    this.car = new Car(this.physics.world);
    this.car.setSpawn(this.track.spawnPosition, this.track.spawnHeading);
    this.scene.add(this.car.object);

    this.chaseCamera = new ChaseCamera(window.innerWidth / window.innerHeight);

    this.input = new Input(document.getElementById('touch-controls')!, this.isTouch);
    this.input.onReset(() => {
      if (!this.started) return;
      // In a race, put the car back on the track where it is; in free drive, back on the grid.
      if (this.race) {
        if (this.race.time > 0 && this.race.player.finishTime === null) this.race.recover(this.race.player);
      } else this.car.reset();
    });

    this.raceHud = new RaceHud();
    this.raceHud.onResultsButtons(
      () => this.startMode('race'),
      () => this.showMenu(),
    );
    this.hud.onMenuButton(() => this.showMenu());
    new SoundControls(this.audio.manager);

    window.addEventListener('resize', () => this.onResize());
    this.onResize();
    this.exposeDebugState();

    this.timer.connect(document); // pauses timing while the page is hidden
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  /** Shows the main menu (race or free drive). */
  showMenu() {
    this.endRace();
    this.started = false;
    this.mode = null;
    this.car.setSpawn(this.track.spawnPosition, this.track.spawnHeading);
    this.chaseCamera.showcase();
    this.hud.showMenu((mode) => this.startMode(mode));
  }

  /** Starts free drive (alone, as before) or a race against the five opponents. */
  startMode(mode: GameMode) {
    // Called from the player's tap/click/key press, so sound is allowed to start now.
    this.audio.unlock();
    this.endRace();
    this.mode = mode;
    this.started = true;
    if (mode === 'race') {
      this.race = new Race(this.physics.world, this.scene, this.track, this.car, this.raceLaps);
      this.raceHud.show(this.race);
    } else {
      this.car.setSpawn(this.track.spawnPosition, this.track.spawnHeading);
    }
    this.chaseCamera.startChase();
  }

  private endRace() {
    if (!this.race) return;
    this.race.dispose();
    this.race = null;
    this.raceHud.hide();
  }

  private frame(time: number) {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;

    const controls = this.started ? this.input.read() : NO_INPUT;
    const race = this.race;
    const alpha = race
      ? this.physics.update(
          dt,
          (stepDt) => race.fixedUpdate(stepDt, controls),
          () => {
            race.postStep();
            this.audio.afterPhysicsStep(this.physics.dt, this.car, race);
          },
        )
      : this.physics.update(
          dt,
          (stepDt) => this.car.fixedUpdate(controls, stepDt),
          () => {
            this.car.postStep();
            this.audio.afterPhysicsStep(this.physics.dt, this.car, null);
          },
        );
    if (race) {
      race.render(alpha);
      this.raceHud.update(race);
    } else this.car.render(alpha);

    const speed = this.car.forwardSpeed;
    this.chaseCamera.update(this.car.object, speed, dt);
    this.environment.update(this.car.object.position);
    this.hud.setSpeed(this.car.speedKmh, Math.abs(speed) / CAR.topSpeed);

    this.audio.update({ dt, playerCar: this.car, throttle: controls.throttle, driving: this.started, race: this.race });

    this.renderer.render(this.scene, this.chaseCamera.camera);
  }

  private onResize() {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h);
    this.chaseCamera.setAspect(w / h);
  }

  /** Lets automated tests read what is happening in the game. */
  private exposeDebugState() {
    (window as unknown as { __game: unknown }).__game = {
      ready: true,
      state: () => {
        const p = this.car.object.position;
        const f = new THREE.Vector3(0, 0, 1).applyQuaternion(this.car.object.quaternion);
        const race = this.race;
        return {
          started: this.started,
          mode: this.mode,
          race: race
            ? {
                phase: race.phase,
                time: race.time,
                countdown: race.countdownText,
                complete: race.complete,
                lap: race.currentLap(),
                laps: race.laps,
                position: race.standings().indexOf(race.player) + 1,
                cars: race.racers.map((r) => ({
                  name: r.name,
                  speedKmh: r.car.speedKmh,
                  distance: r.progress.totalDistance,
                  finished: r.finishTime !== null,
                  x: r.car.body.translation().x,
                  z: r.car.body.translation().z,
                })),
              }
            : null,
          speedKmh: this.car.speedKmh,
          position: { x: p.x, y: p.y, z: p.z },
          heading: Math.atan2(f.x, f.z),
          fps: this.fps,
          simTime: this.physics.time,
          audio: this.audio.debugState(),
          distanceFromCenter: this.track.path.distanceToCenter(p),
          barrierOffset: this.track.barrierOffset,
          drawCalls: this.renderer.info.render.calls,
          triangles: this.renderer.info.render.triangles,
        };
      },
      /** Test helper: puts the car on the centre line at `fraction` (0..1) of the way round the lap. */
      teleport: (fraction: number) => {
        const samples = this.track.path.samples;
        const s = samples[Math.floor(fraction * (samples.length - 1))];
        this.car.setSpawn(s.point, Math.atan2(s.tangent.x, s.tangent.z));
      },
      /** Test helper: puts the car back on the starting grid. */
      returnToGrid: () => this.car.setSpawn(this.track.spawnPosition, this.track.spawnHeading),
      /** Test helper (race): moves the player's car `metres` before the finish line of the last lap. */
      placeBeforeFinish: (metres: number) => {
        const race = this.race;
        if (!race) return;
        const path = this.track.path;
        const n = path.samples.length - 1;
        const step = path.length / n;
        const startIndex = Math.round(this.track.startLineDistance / step);
        const s = path.samples[(startIndex - Math.round(metres / step) + n) % n];
        this.car.placeAt(s.point, Math.atan2(s.tangent.x, s.tangent.z));
        race.player.progress.forceLap(race.laps - 1, s.point);
      },
    };
  }
}

/** True on phones and tablets. Add ?touch=1 or ?touch=0 to the address to force it. */
function detectTouch() {
  const forced = new URLSearchParams(location.search).get('touch');
  if (forced !== null) return forced === '1';
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}
