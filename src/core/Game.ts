import * as THREE from 'three';
import { ChaseCamera } from '../camera/ChaseCamera';
import { CAR } from '../config';
import { Input, type DriveControls } from '../input/Input';
import { Hud } from '../ui/Hud';
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

  private physics!: Physics;
  private environment!: Environment;
  private track!: Circuit;
  private car!: Car;
  private chaseCamera!: ChaseCamera;
  private input!: Input;

  private started = false;
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
    this.input.onReset(() => this.started && this.car.reset());

    window.addEventListener('resize', () => this.onResize());
    this.onResize();
    this.exposeDebugState();

    this.timer.connect(document); // pauses timing while the page is hidden
    this.renderer.setAnimationLoop((time) => this.frame(time));
  }

  /** Called when the player leaves the start screen. */
  start() {
    this.started = true;
    this.chaseCamera.startChase();
  }

  private frame(time: number) {
    this.timer.update(time);
    const dt = Math.min(this.timer.getDelta(), 0.1);
    if (dt > 0) this.fps += (1 / dt - this.fps) * 0.05;

    const controls = this.started ? this.input.read() : NO_INPUT;
    const alpha = this.physics.update(
      dt,
      (stepDt) => this.car.fixedUpdate(controls, stepDt),
      () => this.car.postStep(),
    );
    this.car.render(alpha);

    const speed = this.car.forwardSpeed;
    this.chaseCamera.update(this.car.object, speed, dt);
    this.environment.update(this.car.object.position);
    this.hud.setSpeed(this.car.speedKmh, Math.abs(speed) / CAR.topSpeed);

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
        return {
          started: this.started,
          speedKmh: this.car.speedKmh,
          position: { x: p.x, y: p.y, z: p.z },
          heading: Math.atan2(f.x, f.z),
          fps: this.fps,
          simTime: this.physics.time,
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
    };
  }
}

/** True on phones and tablets. Add ?touch=1 or ?touch=0 to the address to force it. */
function detectTouch() {
  const forced = new URLSearchParams(location.search).get('touch');
  if (forced !== null) return forced === '1';
  return window.matchMedia('(pointer: coarse)').matches || navigator.maxTouchPoints > 0;
}
