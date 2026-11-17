import { CAR, TRACK } from '../config';
import type { TrackPath } from '../world/track/TrackPath';
import { clamp } from '../utils/math';

/**
 * Pre-calculated knowledge of the track that every AI driver shares:
 * - the racing line: where across the road to drive (wide before a corner, tight at the apex, wide on exit)
 * - a speed plan: how fast each part of the track can be taken, including braking early enough.
 */
export class RacingLine {
  /** Unique samples (the path's last sample repeats the first). */
  readonly count: number;
  /** Metres between samples. */
  readonly step: number;
  /** Smoothed curvature (1 / radius) at each sample. */
  readonly curvature: Float32Array;
  /** Best sideways position at each sample (positive = left of the centre line). */
  readonly offset: Float32Array;

  constructor(readonly path: TrackPath) {
    this.count = path.samples.length - 1;
    this.step = path.length / this.count;
    const n = this.count;

    // Smooth the curvature over ±16 m so small wiggles don't confuse the drivers.
    const raw = path.samples.slice(0, n).map((s) => s.curvature);
    this.curvature = new Float32Array(n);
    const window = 8;
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -window; k <= window; k++) sum += raw[(i + k + n) % n];
      this.curvature[i] = sum / (window * 2 + 1);
    }

    // Racing line: lean towards the inside of the corner around the apex,
    // and towards the outside just before it (to open up the corner).
    const maxOffset = TRACK.width / 2 - 1.6;
    const lead = Math.round(30 / this.step);
    this.offset = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const here = this.curvature[i];
      const comingUp = this.curvature[(i + lead) % n];
      this.offset[i] = clamp(260 * here - 140 * comingUp, -maxOffset, maxOffset);
    }
    // Smooth the line so the cars don't weave.
    const smoothed = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      let sum = 0;
      for (let k = -10; k <= 10; k++) sum += this.offset[(i + k + n) % n];
      smoothed[i] = sum / 21;
    }
    this.offset.set(smoothed);
  }

  /**
   * Target speed (m/s) at each sample for a driver who corners with up to `lateralGrip` m/s²
   * and brakes at `braking` m/s². Works backwards from every corner so braking starts in time.
   */
  speedPlan(lateralGrip: number, braking: number): Float32Array {
    const n = this.count;
    const plan = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const k = Math.max(Math.abs(this.curvature[i]), 1e-4);
      plan[i] = Math.min(CAR.topSpeed, Math.sqrt(lateralGrip / k));
    }
    // Two passes round the loop so braking zones carry across the start/finish line.
    for (let pass = 0; pass < 2; pass++) {
      for (let i = n - 1; i >= 0; i--) {
        const next = plan[(i + 1) % n];
        plan[i] = Math.min(plan[i], Math.sqrt(next * next + 2 * braking * this.step));
      }
    }
    return plan;
  }
}
