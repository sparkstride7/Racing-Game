// Suspension clearance: how far each wheel can move up into its wheel arch (as when the suspension compresses
// over a bump) before any part of it touches the rest of the car.
//
//   node check_suspension_travel.mjs <model.glb> [maxSteerDegrees = 40]
//
// Each wheel (tyre, rim, spokes, brake disc and calliper) is raised in 2 mm steps. At every height it is tested
// spun to 12 positions (every 30 degrees) and, for the front wheels, steered from full left to full right in
// 10 degree steps. Reported: the largest rise with no contact (every triangle tested against every triangle of
// the rest of the car, with at least 1 mm to spare), up to 60 mm. Moving a wheel down (droop) only takes it away
// from the body. Read-only: the model file is not changed.
import { NodeIO } from '@gltf-transform/core';

const [, , FILE, MAX_STEER = '40'] = process.argv;
const doc = await new NodeIO().read(FILE);
const WHEEL_PART = /^(Wheel|Rim|Disc|Caliper|Spoke)_(FL|FR|RL|RR)(_\d+)?$/;
const trianglesOf = (n) => {
  const prim = n.getMesh().listPrimitives()[0];
  const P = prim.getAttribute('POSITION'), I = prim.getIndices()?.getArray();
  const count = I ? I.length : P.getCount(), out = [];
  for (let k = 0; k < count; k += 3) out.push([0, 1, 2].map((j) => P.getElement(I ? I[k + j] : k + j, [])));
  return out;
};
const wheels = { FL: [], FR: [], RL: [], RR: [] }, rest = [];
for (const n of doc.getRoot().listNodes()) {
  if (!n.getMesh()) continue;
  const m = n.getName().match(WHEEL_PART);
  if (m) wheels[m[2]].push({ name: m[1], tris: trianglesOf(n) });
  else for (const t of trianglesOf(n)) rest.push({ t, part: n.getName() });
}
const CELL = 0.1, grid = new Map(), key = (i, j, k) => `${i},${j},${k}`;
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
function pointTri(p, t) {
  const [a, b, c] = t, ab = sub(b, a), ac = sub(c, a), ap = sub(p, a), len = (v) => Math.hypot(...v);
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
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
// Is there contact (a crossing or less than 1 mm) with the wheel raised by `rise`? Returns the closest part, or null.
function contact(parts, c, steers, rise) {
  for (const steer of steers) for (let spin = 0; spin < 360; spin += 30) {
    const cs = Math.cos((spin * Math.PI) / 180), ss = Math.sin((spin * Math.PI) / 180), ct = Math.cos((steer * Math.PI) / 180), st = Math.sin((steer * Math.PI) / 180);
    const move = (p, spins) => {
      let [x, y, z] = [p[0] - c[0], p[1] - c[1], p[2] - c[2]];
      if (spins) [y, z] = [y * cs - z * ss, y * ss + z * cs];
      [x, z] = [x * ct + z * st, -x * st + z * ct];
      return [x + c[0], y + c[1] + rise, z + c[2]];
    };
    for (const part of parts) for (const t0 of part.tris) {
      const t = t0.map((p) => move(p, part.name !== 'Caliper')), box = bbox(t);
      for (const r of nearby(box, 0.01)) {
        if (trisCross(t, r.t)) return { part: r.part, steer, spin };
        for (const p of t) if (pointTri(p, r.t) < 0.001) return { part: r.part, steer, spin };
        for (const p of r.t) if (pointTri(p, t) < 0.001) return { part: r.part, steer, spin };
      }
    }
  }
  return null;
}
const results = {};
for (const [w, parts] of Object.entries(wheels)) {
  const tyre = parts.find((p) => p.name === 'Wheel').tris.flat();
  const c = [0, 1, 2].map((a) => (Math.min(...tyre.map((p) => p[a])) + Math.max(...tyre.map((p) => p[a]))) / 2);
  const steers = w.startsWith('F') ? Array.from({ length: 2 * Math.round(MAX_STEER / 10) + 1 }, (_, i) => -MAX_STEER + 10 * i) : [0];
  let free = null, first = null;
  for (let mm = 0; mm <= 60; mm += 2) {
    const hit = contact(parts, c, steers, mm / 1000);
    if (hit) { first = { atMm: mm, ...hit }; break; }
    free = mm;
  }
  results[w] = { steering: w.startsWith('F') ? `±${MAX_STEER}°` : 'none', freeRiseMm: free, firstContact: first ?? 'none up to 60 mm' };
}
console.log(JSON.stringify(results, null, 1));
