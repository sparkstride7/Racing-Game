// Checks the bodywork for gaps and for parts cutting through it.
//
//   node check_bodywork.mjs <model.glb>
//
// 1. Gaps: the painted body, the grille recess and the wheel-well liners together should form one closed
//    shell: every edge is shared by exactly two triangles. Edges used only once are holes or cracks.
// 2. Crossings: for every other part, the number of its triangles that cut through the body shell.
// Read-only: the model file is not changed.
import { NodeIO } from '@gltf-transform/core';

const doc = await new NodeIO().read(process.argv[2]);
const SHELL = /^(Sculpted_Main_Body|Front_Grille_Duct|Front_Grille_Back_Wall|Wheel_Well_Liner_..)$/;
const tris = (n) => {
  const prim = n.getMesh().listPrimitives()[0];
  const P = prim.getAttribute('POSITION'), I = prim.getIndices()?.getArray();
  const count = I ? I.length : P.getCount(), out = [];
  for (let k = 0; k < count; k += 3) out.push([0, 1, 2].map((j) => P.getElement(I ? I[k + j] : k + j, [])));
  return out;
};
const shell = [], others = {};
for (const n of doc.getRoot().listNodes()) {
  if (!n.getMesh()) continue;
  if (SHELL.test(n.getName())) shell.push(...tris(n));
  else others[n.getName()] = tris(n);
}
// 1. Edge use counts (positions rounded to 0.01 mm).
const k = (p) => p.map((v) => Math.round(v * 1e5)).join(',');
const edges = new Map();
for (const t of shell) for (let e = 0; e < 3; e++) {
  const a = k(t[e]), b = k(t[(e + 1) % 3]);
  if (a === b) continue;
  const id = a < b ? a + '|' + b : b + '|' + a;
  edges.set(id, (edges.get(id) ?? 0) + 1);
}
const open = [...edges.values()].filter((c) => c === 1).length, over = [...edges.values()].filter((c) => c > 2).length;
// 2. Crossings with the shell.
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
const box = (t) => [0, 1, 2].map((a) => [Math.min(t[0][a], t[1][a], t[2][a]), Math.max(t[0][a], t[1][a], t[2][a])]);
const overlap = (A, B) => A.every(([a0, a1], i) => a0 <= B[i][1] && a1 >= B[i][0]);
const shellBoxes = shell.map(box);
const crossings = {};
for (const [name, list] of Object.entries(others)) {
  let n = 0;
  for (const t of list) {
    const tb = box(t);
    if (shellBoxes.some((sb, i) => overlap(tb, sb) && [0, 1, 2].some((e) => segHitsTri(t[e], t[(e + 1) % 3], shell[i]) || segHitsTri(shell[i][e], shell[i][(e + 1) % 3], t)))) n++;
  }
  if (n) crossings[name] = n;
}
console.log(JSON.stringify({ shellTriangles: shell.length, edgesUsedOnce: open, edgesUsedMoreThanTwice: over, partsCrossingTheShell: crossings }, null, 1));
