import * as THREE from 'three';
import type { TrackSample } from './TrackPath';

/**
 * Builders that turn the track's centre line into 3D shapes.
 * Each returns a single geometry, so a whole kerb set or barrier ring
 * is drawn in one go (important for iPhone performance).
 */

interface StripRow {
  a: THREE.Vector3;
  b: THREE.Vector3;
  uvA: [number, number];
  uvB: [number, number];
}

/**
 * A strip of quads between two lines of points.
 * `facing` is the direction the surface should face (used to get the triangle winding right).
 */
function stripGeometry(rows: StripRow[], facing: THREE.Vector3) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  for (const row of rows) {
    positions.push(row.a.x, row.a.y, row.a.z, row.b.x, row.b.y, row.b.z);
    uvs.push(...row.uvA, ...row.uvB);
  }
  // Check which way the first quad faces and flip the winding if needed.
  const e1 = rows[1].a.clone().sub(rows[0].a);
  const e2 = rows[0].b.clone().sub(rows[0].a);
  const flip = e1.cross(e2).dot(facing) < 0;
  for (let i = 0; i < rows.length - 1; i++) {
    const a = i * 2;
    if (flip) indices.push(a, a + 1, a + 2, a + 1, a + 3, a + 2);
    else indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

const UP = new THREE.Vector3(0, 1, 0);

/**
 * A flat strip that follows the track, between two sideways offsets from the centre line
 * (positive = driver's left). U runs across the strip (0..1), V along it, repeating every `repeatLength` metres.
 */
export function ribbonGeometry(
  samples: TrackSample[],
  fromOffset: number,
  toOffset: number,
  yFrom: number,
  yTo: number,
  repeatLength: number,
) {
  const rows: StripRow[] = samples.map((s) => ({
    a: s.point.clone().addScaledVector(s.left, fromOffset).setY(yFrom),
    b: s.point.clone().addScaledVector(s.left, toOffset).setY(yTo),
    uvA: [0, s.distance / repeatLength],
    uvB: [1, s.distance / repeatLength],
  }));
  const geometry = stripGeometry(rows, UP);
  // Keep lighting consistent on flat strips.
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 1, 0);
  return geometry;
}

/**
 * A solid wall (inner face, top, outer face) running alongside the track.
 * `side` is +1 for the driver's left, -1 for the right. `offset` is where the track-facing side of the wall stands.
 * Texture: U along the wall (repeating every `repeatLength` m), V from bottom (0) to top (1).
 */
export function wallGeometry(
  samples: TrackSample[],
  side: 1 | -1,
  offset: number,
  height: number,
  thickness: number,
  repeatLength: number,
) {
  const inner: StripRow[] = [];
  const top: StripRow[] = [];
  const outer: StripRow[] = [];
  for (const s of samples) {
    const out = s.left.clone().multiplyScalar(side);
    const innerBase = s.point.clone().addScaledVector(out, offset);
    const outerBase = innerBase.clone().addScaledVector(out, thickness);
    const u = s.distance / repeatLength;
    const innerTop = innerBase.clone().setY(height);
    const outerTop = outerBase.clone().setY(height);
    inner.push({ a: innerBase, b: innerTop, uvA: [u, 0], uvB: [u, 0.97] });
    top.push({ a: innerTop, b: outerTop, uvA: [u, 0.97], uvB: [u, 1] });
    outer.push({ a: outerBase, b: outerTop, uvA: [u, 0], uvB: [u, 0.97] });
  }
  const s0 = samples[0].left.clone().multiplyScalar(side);
  return [
    stripGeometry(inner, s0.clone().negate()),
    stripGeometry(top, UP),
    stripGeometry(outer, s0),
  ];
}

/**
 * Splits the samples into runs where `test` is true (e.g. "this is a corner").
 * Each run is extended by `pad` samples at both ends. Runs never wrap past the end of the lap.
 */
export function findRuns(samples: TrackSample[], test: (s: TrackSample) => boolean, pad: number) {
  const n = samples.length;
  const marked = new Array<boolean>(n).fill(false);
  samples.forEach((s, i) => {
    if (!test(s)) return;
    for (let k = Math.max(0, i - pad); k <= Math.min(n - 1, i + pad); k++) marked[k] = true;
  });
  const runs: TrackSample[][] = [];
  let current: TrackSample[] = [];
  marked.forEach((m, i) => {
    if (m) current.push(samples[i]);
    else if (current.length) {
      runs.push(current);
      current = [];
    }
  });
  if (current.length) runs.push(current);
  return runs.filter((r) => r.length > 1);
}
