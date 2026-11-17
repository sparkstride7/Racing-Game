import * as THREE from 'three';
import type { TrackPath } from '../world/track/TrackPath';

/**
 * Follows one car around the lap: where it is along the track, which lap it is on,
 * and how far it has travelled in total. Race positions are worked out from this.
 */
export class TrackProgress {
  /** Index of the nearest centre-line sample. */
  index = 0;
  /** Times the car has crossed the start/finish line forwards (minus backwards crossings). */
  private crossings = 0;
  private lapDistance = 0;
  private readonly count: number;
  private readonly tmp = new THREE.Vector3();

  constructor(
    private readonly path: TrackPath,
    /** Distance along the centre line where the start/finish line is. */
    private readonly startDistance: number,
    position: THREE.Vector3,
  ) {
    this.count = path.samples.length - 1; // the last sample repeats the first
    this.reset(position);
  }

  /** Re-finds the car from scratch (start of race). Cars behind the line start at a negative distance. */
  reset(position: THREE.Vector3) {
    this.index = this.path.nearestIndex(position) % this.count;
    this.lapDistance = this.computeLapDistance();
    this.crossings = this.lapDistance > this.path.length / 2 ? -1 : 0;
  }

  /** Call every physics step. Searches only near the last known spot, so it is cheap and never jumps across the infield. */
  update(position: { x: number; z: number }) {
    const samples = this.path.samples;
    let best = this.index;
    let bestD = Infinity;
    for (let k = -25; k <= 25; k++) {
      const i = (this.index + k + this.count) % this.count;
      const p = samples[i].point;
      const d = (p.x - position.x) ** 2 + (p.z - position.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    this.index = best;
    const previous = this.lapDistance;
    this.lapDistance = this.computeLapDistance();
    const L = this.path.length;
    if (previous > L * 0.75 && this.lapDistance < L * 0.25) this.crossings++;
    else if (previous < L * 0.25 && this.lapDistance > L * 0.75) this.crossings--;
  }

  /** Test helper: jumps to `position` and pretends `completedLaps` laps are already done. */
  forceLap(completedLaps: number, position: THREE.Vector3) {
    this.index = this.path.nearestIndex(position) % this.count;
    this.lapDistance = this.computeLapDistance();
    this.crossings = completedLaps + (this.lapDistance > this.path.length / 2 ? 0 : 1);
  }

  /** Metres travelled since the start of the race (negative while still behind the start line). */
  get totalDistance() {
    return this.crossings * this.path.length + this.lapDistance;
  }

  /** Signed sideways distance from the centre line (positive = driver's left). */
  lateralOffset(position: { x: number; z: number }) {
    const s = this.path.samples[this.index];
    this.tmp.set(position.x - s.point.x, 0, position.z - s.point.z);
    return this.tmp.dot(s.left);
  }

  private computeLapDistance() {
    const L = this.path.length;
    return (this.path.samples[this.index].distance - this.startDistance + L) % L;
  }
}
