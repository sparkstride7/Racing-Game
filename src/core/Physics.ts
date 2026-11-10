import RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '@dimforge/rapier3d-compat';
import { PHYSICS } from '../config';

/**
 * Wraps the Rapier physics engine.
 * Physics always advances in fixed 1/60 s steps (for consistent handling on every device);
 * rendering then blends between the last two steps so motion stays smooth on 120 Hz screens.
 */
export class Physics {
  readonly world: World;
  readonly dt = PHYSICS.fixedTimeStep;
  /** Total simulated time in seconds. */
  time = 0;
  private accumulator = 0;

  private constructor() {
    this.world = new RAPIER.World({ x: 0, y: PHYSICS.gravity, z: 0 });
    this.world.timestep = this.dt;
  }

  /** Rapier is WebAssembly, so it must be loaded before use. */
  static async create(): Promise<Physics> {
    await RAPIER.init();
    return new Physics();
  }

  /**
   * Runs as many fixed physics steps as needed for `frameDt` seconds of real time.
   * `beforeStep` runs before each step (apply controls there), `afterStep` after it.
   * Returns how far (0..1) we are between the last step and the next one, for smooth rendering.
   */
  update(frameDt: number, beforeStep: (dt: number) => void, afterStep: () => void): number {
    this.accumulator += frameDt;
    let steps = 0;
    while (this.accumulator >= this.dt && steps < PHYSICS.maxStepsPerFrame) {
      beforeStep(this.dt);
      this.world.step();
      afterStep();
      this.time += this.dt;
      this.accumulator -= this.dt;
      steps++;
    }
    if (steps === PHYSICS.maxStepsPerFrame) this.accumulator = 0;
    return this.accumulator / this.dt;
  }
}
