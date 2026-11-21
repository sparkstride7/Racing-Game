// Checks that all four wheels can turn (and the front wheels steer) without touching any other part of the car.
//
//   node check_wheel_clearance.mjs <model.glb> [maxSteerDegrees = 26]
//
// For each wheel, every part that turns with it (tyre, rim, spokes, brake disc) is spun through a full turn in
// 15-degree steps, and the front wheels are also steered from full left to full right in 5-degree steps; the brake calliper steers but does
// not spin. In every position each wheel triangle is tested against every triangle of the rest of the car for
// any crossing, and the smallest gap is measured. Read-only: the model file is not changed.
import { NodeIO } from '@gltf-transform/core';

const [, , FILE, MAX_STEER = '26'] = process.argv;
const doc = await new NodeIO().read(FILE);
const WHEEL_PART = /^(Wheel|Rim|Disc|Caliper|Spoke)_(FL|FR|RL|RR)(_\d+)?$/;
function trianglesOf(n) {
  const prim = n.getMesh().listPrimitives()[0];
  const P = prim.getAttribute('POSITION'), I = prim.getIndices()?.getArray();
  const count = I ? I.length : P.getCount(), out = [];
  for (let k = 0; k < count; k += 3) out.push([0, 1, 2].map((j) => P.getElement(I ? I[k + j] : k + j, [])));
  return out;
}
const wheels = { FL: [], FR: [], RL: [], RR: [] }, rest = [];
for (const n of doc.getRoot().listNodes()) {
  if (!n.getMesh()) continue;
  const m = n.getName().match(WHEEL_PART);
  if (m) wheels[m[2]].push({ name: m[1], tris: trianglesOf(n) });
  else for (const t of trianglesOf(n)) rest.push({ t, part: n.getName() });
}
// Spatial grid of the rest of the car, for speed.
const CELL = 0.1, grid = new Map();
const key = (i, j, k) => `${i},${j},${k}`;
const bbox = (t) => [0, 1, 2].map((a) => [Math.min(t[0][a], t[1][a], t[2][a]), Math.max(t[0][a], t[1][a], t[2][a])]);
rest.forEach((r, idx) => {
  r.box = bbox(r.t);
  for (let i = Math.floor(r.box[0][0] / CELL); i <= Math.floor(r.box[0][1] / CELL); i++)
    for (let j = Math.floor(r.box[1][0] / CELL); j <= Math.floor(r.box[1][1] / CELL); j++)
      for (let k = Math.floor(r.box[2][0] / CELL); k <= Math.floor(r.box[2][1] / CELL); k++) (grid.get(key(i, j, k)) ?? grid.set(key(i, j, k), []).get(key(i, j, k))).push(idx);
});
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
// Does segment p→q cross triangle t? (Möller–Trumbore, limited to the segment)
function segHitsTri(p, q, t) {
  const d = sub(q, p), e1 = sub(t[1], t[0]), e2 = sub(t[2], t[0]), h = cross(d, e2), a = dot(e1, h);
  if (Math.abs(a) < 1e-12) return false;
  const f = 1 / a, s = sub(p, t[0]), u = f * dot(s, h);
  if (u < 0 || u > 1) return false;
  const qv = cross(s, e1), v = f * dot(d, qv);
  if (v < 0 || u + v > 1) return false;
  const w = f * dot(e2, qv);
  return w > 1e-9 && w < 1 - 1e-9;
}
const trisCross = (a, b) => [0, 1, 2].some((k) => segHitsTri(a[k], a[(k + 1) % 3], b) || segHitsTri(b[k], b[(k + 1) % 3], a));
// Distance from point p to triangle t.
function pointTri(p, t) {
  const [a, b, c] = t, ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  const len = (v) => Math.hypot(...v);
  if (d1 <= 0 && d2 <= 0) return len(ap);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return len(bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) { const v = d1 / (d1 - d3); return len(sub(p, [a[0] + v * ab[0], a[1] + v * ab[1], a[2] + v * ab[2]])); }
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return len(cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) { const w = d2 / (d2 - d6); return len(sub(p, [a[0] + w * ac[0], a[1] + w * ac[1], a[2] + w * ac[2]])); }
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) { const w = (d4 - d3) / (d4 - d3 + (d5 - d6)); return len(sub(p, [b[0] + w * (c[0] - b[0]), b[1] + w * (c[1] - b[1]), b[2] + w * (c[2] - b[2])])); }
  const n = cross(ab, ac); return Math.abs(dot(ap, n)) / len(n);
}
function nearby(box, margin) {
  const out = new Set();
  for (let i = Math.floor((box[0][0] - margin) / CELL); i <= Math.floor((box[0][1] + margin) / CELL); i++)
    for (let j = Math.floor((box[1][0] - margin) / CELL); j <= Math.floor((box[1][1] + margin) / CELL); j++)
      for (let k = Math.floor((box[2][0] - margin) / CELL); k <= Math.floor((box[2][1] + margin) / CELL); k++) for (const idx of grid.get(key(i, j, k)) ?? []) out.add(idx);
  return [...out].map((idx) => rest[idx]);
}
const results = {};
for (const [w, parts] of Object.entries(wheels)) {
  const tyre = parts.find((p) => p.name === 'Wheel').tris.flat();
  const c = [0, 1, 2].map((a) => (Math.min(...tyre.map((p) => p[a])) + Math.max(...tyre.map((p) => p[a]))) / 2);
  const steers = w.startsWith('F') ? Array.from({ length: 2 * Math.round(MAX_STEER / 5) + 1 }, (_, i) => -MAX_STEER + 5 * i) : [0];
  let crossings = 0, minGap = Infinity, worst = null;
  const hitParts = new Set();
  for (const steer of steers) for (let spin = 0; spin < 360; spin += 15) {
    const cs = Math.cos((spin * Math.PI) / 180), ss = Math.sin((spin * Math.PI) / 180), ct = Math.cos((steer * Math.PI) / 180), st = Math.sin((steer * Math.PI) / 180);
    const move = (p, spins) => {
      let [x, y, z] = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
      if (spins) [y, z] = [y * cs - z * ss, y * ss + z * cs]; // turn about the axle (x axis)
      [x, z] = [x * ct + z * st, -x * st + z * ct]; // steer about the vertical axis
      return [x + c[0], y + c[1], z + c[2]];
    };
    for (const part of parts) for (const t0 of part.tris) {
      const t = t0.map((p) => move(p, part.name !== 'Caliper'));
      const box = bbox(t);
      for (const r of nearby(box, 0.06)) {
        if (box[0][0] <= r.box[0][1] && box[0][1] >= r.box[0][0] && box[1][0] <= r.box[1][1] && box[1][1] >= r.box[1][0] && box[2][0] <= r.box[2][1] && box[2][1] >= r.box[2][0] && trisCross(t, r.t)) { crossings++; hitParts.add(r.part); }
        for (const p of t) { const d = pointTri(p, r.t); if (d < minGap) { minGap = d; worst = { part: r.part, steer, spin }; } }
        for (const p of r.t) { const d = pointTri(p, t); if (d < minGap) { minGap = d; worst = { part: r.part, steer, spin }; } }
      }
    }
  }
  results[w] = { positionsTested: steers.length * 24, steering: w.startsWith('F') ? `±${MAX_STEER}°` : 'none', crossings, partsTouched: [...hitParts], smallestGapMm: minGap === Infinity ? null : +(minGap * 1000).toFixed(1), closestPart: worst?.part ?? null };
}
console.log(JSON.stringify(results, null, 1));
