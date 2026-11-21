// Checks how the vertical-bar chrome grille fits the car.
//
//   node check_grille_fit.mjs <model.glb>
//
// 1. Bars: every bar triangle is tested against every triangle of every other part for any crossing, and the
//    smallest gap to each nearby part is measured. Also: every bar point must be inside the grille opening (seen
//    from the front) and inside the dark recess (between its back wall and the front face).
// 2. Surround: which parts it crosses (it is set a few millimetres into the flat front face, as the original chrome
//    border was) and its smallest gap to the headlights, bonnet and other nearby parts. Its outer edge must stay on
//    the flat front face.
// Read-only: the model file is not changed.
import { NodeIO } from '@gltf-transform/core';

const doc = await new NodeIO().read(process.argv[2]);
const tris = (n) => {
  const prim = n.getMesh().listPrimitives()[0];
  const P = prim.getAttribute('POSITION'), I = prim.getIndices()?.getArray();
  const count = I ? I.length : P.getCount(), out = [];
  for (let k = 0; k < count; k += 3) out.push([0, 1, 2].map((j) => P.getElement(I ? I[k + j] : k + j, [])));
  return out;
};
const parts = {};
for (const n of doc.getRoot().listNodes()) if (n.getMesh()) parts[n.getName()] = tris(n);
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
const box = (list) => { const lo = [1e9, 1e9, 1e9], hi = [-1e9, -1e9, -1e9]; for (const t of list) for (const p of t) for (let k = 0; k < 3; k++) { lo[k] = Math.min(lo[k], p[k]); hi[k] = Math.max(hi[k], p[k]); } return [lo, hi]; };
const near = (A, B, m) => A[0].every((v, k) => v - m <= B[1][k] && A[1][k] + m >= B[0][k]);
const tbox = (t) => [[0, 1, 2].map((k) => Math.min(t[0][k], t[1][k], t[2][k])), [0, 1, 2].map((k) => Math.max(t[0][k], t[1][k], t[2][k]))];
// Crossings and smallest gaps between one part and all others (within 5 cm).
function against(name) {
  const mine = parts[name], mb = box(mine), mineBoxes = mine.map(tbox), out = {};
  for (const [other, list] of Object.entries(parts)) {
    if (other === name || !near(mb, box(list), 0.05)) continue;
    let crossings = 0, gap = Infinity;
    for (const t of list) {
      const tb = tbox(t);
      if (!near(tb, mb, 0.05)) continue;
      for (let i = 0; i < mine.length; i++) {
        if (!near(tb, mineBoxes[i], 0.05)) continue;
        if (near(tb, mineBoxes[i], 0) && trisCross(t, mine[i])) crossings++;
        for (const p of t) gap = Math.min(gap, pointTri(p, mine[i]));
        for (const p of mine[i]) gap = Math.min(gap, pointTri(p, t));
      }
    }
    out[other] = { crossings, smallestGapMm: +(gap * 1000).toFixed(1) };
  }
  return out;
}
// The opening outline (front rim of the black duct), and the recess depth.
const duct = parts['Front_Grille_Duct'].flat(), faceZ = Math.max(...duct.map((p) => p[2])), backZ = Math.min(...duct.map((p) => p[2]));
const ringPts = [...new Map(duct.filter((p) => Math.abs(p[2] - faceZ) < 1e-5).map((p) => [p[0].toFixed(5) + ',' + p[1].toFixed(5), [p[0], p[1]]])).values()];
const c = [ringPts.reduce((s, p) => s + p[0], 0) / ringPts.length, ringPts.reduce((s, p) => s + p[1], 0) / ringPts.length];
const opening = ringPts.sort((a, b) => Math.atan2(a[1] - c[1], a[0] - c[0]) - Math.atan2(b[1] - c[1], b[0] - c[0]));
const insideBy = (p) => Math.min(...opening.map((a, k) => { const b = opening[(k + 1) % opening.length], d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...d); return ((p[0] - a[0]) * -d[1] + (p[1] - a[1]) * d[0]) / l; }));
const barPts = parts['Front_Grille_Vertical_Bars'].flat();
const barsInside = { allInsideOpening: barPts.every((p) => insideBy(p) > 0), smallestDistanceToOpeningEdgeMm: +(Math.min(...barPts.map(insideBy)) * 1000).toFixed(1),
  allInsideRecess: barPts.every((p) => p[2] > backZ && p[2] < faceZ), frontOfBarsBehindFaceMm: +((faceZ - Math.max(...barPts.map((p) => p[2]))) * 1000).toFixed(1), gapToBackWallMm: +((Math.min(...barPts.map((p) => p[2])) - backZ) * 1000).toFixed(1) };
const xs = [...new Set(parts['Front_Grille_Vertical_Bars'].flat().map((p) => p[0]))];
console.log(JSON.stringify({ bars: { ...barsInside, againstOtherParts: against('Front_Grille_Vertical_Bars') }, surround: { againstOtherParts: against('Front_Grille_Chrome_Surround') } }, null, 1));
