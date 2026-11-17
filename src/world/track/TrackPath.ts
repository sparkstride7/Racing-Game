import * as THREE from 'three';
import type { TrackLayout } from './layout';

/** One evenly spaced point along the track's centre line. */
export interface TrackSample {
  point: THREE.Vector3;
  /** Unit vector along the driving direction. */
  tangent: THREE.Vector3;
  /** Unit vector pointing to the driver's left. */
  left: THREE.Vector3;
  /** Distance from the start of the curve, in metres. */
  distance: number;
  /** Signed curvature (1 / corner radius). Positive = turning left. */
  curvature: number;
}

/** The track's centre line, sampled every ~2 m, with helpers to measure and place things along it. */
export class TrackPath {
  readonly curve: THREE.CatmullRomCurve3;
  readonly length: number;
  /** Closed loop: the last sample is the first one repeated, so strips join up seamlessly. */
  readonly samples: TrackSample[];

  constructor(layout: TrackLayout, spacing = 2) {
    this.curve = new THREE.CatmullRomCurve3(
      layout.points.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      'centripetal',
    );
    this.length = this.curve.getLength();
    const count = Math.round(this.length / spacing);
    const points = this.curve.getSpacedPoints(count);
    const step = this.length / count;

    this.samples = points.map((point, i) => {
      const tangent = this.curve.getTangentAt(Math.min(i / count, 1)).setY(0).normalize();
      return {
        point,
        tangent,
        left: new THREE.Vector3(tangent.z, 0, -tangent.x),
        distance: i * step,
        curvature: 0,
      };
    });

    // Curvature from how fast the direction changes, measured over a few samples to smooth it.
    const n = count; // unique samples (the last one repeats the first)
    const span = 3;
    for (let i = 0; i < n; i++) {
      const a = this.samples[(i - span + n) % n].tangent;
      const b = this.samples[(i + span) % n].tangent;
      const turn = Math.atan2(a.x * b.z - a.z * b.x, a.x * b.x + a.z * b.z);
      // Y-up, Z-forward: a negative cross product here is a turn to the driver's left.
      this.samples[i].curvature = -turn / (2 * span * step);
    }
    this.samples[n].curvature = this.samples[0].curvature;
  }

  /** Index of the sample closest to a point (horizontal distance). */
  nearestIndex(p: THREE.Vector3): number {
    let best = 0;
    let bestD = Infinity;
    for (let i = 0; i < this.samples.length; i++) {
      const s = this.samples[i].point;
      const d = (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    return best;
  }

  /** Horizontal distance from a point to the centre line. */
  distanceToCenter(p: THREE.Vector3): number {
    return Math.sqrt(this.distanceToCenterSq(p));
  }

  distanceToCenterSq(p: THREE.Vector3): number {
    const s = this.samples[this.nearestIndex(p)].point;
    return (s.x - p.x) ** 2 + (s.z - p.z) ** 2;
  }

  /** Bounding box of the centre line. */
  bounds(): THREE.Box3 {
    return new THREE.Box3().setFromPoints(this.samples.map((s) => s.point));
  }
}
