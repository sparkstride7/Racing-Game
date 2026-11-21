// Builds "Proto Corsa-90GT": Proto Corsa-OG with a vertical-bar chrome grille.
//
//   node build_proto_corsa_90gt.mjs <Proto Corsa-OG model .glb> <output.glb>
//
// Starts from the Proto Corsa-OG model (which is only read, never written) and changes only the front grille:
//   - The diamond mesh (2 parts) is replaced by closely spaced, straight, evenly spaced vertical polished-chrome bars.
//     Each bar is a solid rounded (oval) rod, so it catches the light like a real chrome grille bar. The bars run
//     from the top to the bottom of the grille opening and stop just short of its walls, behind the surround's lip,
//     so they touch nothing.
//   - The thin chrome border is replaced by a substantial polished-chrome surround: a rounded trim that stands out
//     from the front face, follows the outline of the grille opening exactly, and has an inner lip that turns into
//     the opening and covers the ends of the bars. It sits in the flat front face, like the border it replaces.
//   - The dark recess (the black duct and back wall behind the grille) is kept as it was, so the bars stand in
//     front of a near-black background.
// Everything else (body, bumpers, splitter, fenders, rocker panels, wheels, lights ...) is kept exactly as it is.
// Car space: +Z forward, +Y up, metres, ground at y = 0.
import { NodeIO } from '@gltf-transform/core';

const [, , INPUT, OUTPUT] = process.argv;
if (!INPUT || !OUTPUT || INPUT === OUTPUT) throw new Error('usage: node build_proto_corsa_90gt.mjs <Proto Corsa-OG .glb> <output.glb> (two different files)');

// ---- Design settings (metres) ------------------------------------------------------------------
const BAR_PITCH = 0.03; // target centre-to-centre spacing of the vertical bars (adjusted slightly so they fill the width evenly)
const BAR_WIDTH = 0.012; // width of each bar, seen from the front
const BAR_DEPTH = 0.016; // front-to-back depth of each bar
const BAR_SIDES = 12; // smoothness of each bar's rounded section
const BAR_SET_BACK = 0.028; // how far the bars' centres sit behind the front face (inside the dark recess)
const BAR_END_GAP = 0.003; // each bar stops this far short of the opening's walls (hidden behind the lip)
const BAR_MIN_LENGTH = 0.025; // the outermost bars sit where the opening (at its pointed side corners) is this tall
const SURROUND_WIDTH = 0.04; // width of the chrome surround on the front face, outward from the opening's edge
const SURROUND_RISE = 0.026; // how far the surround's rounded crown stands out from the front face
const SURROUND_LIP = 0.02; // how far its inner lip reaches into the opening (in front of the bar ends, covering them)
const SURROUND_LIP_DEPTH = 0.012; // how deep the lip reaches into the opening (still in front of the bars)
const SURROUND_INSET = 0.004; // how far the surround's back is set into the front face (as the old border was)
const SURROUND_STEPS = 16; // smoothness of the surround's rounded section
const FACE_MARGIN = 0.004; // the surround must stay at least this far inside the edges of the flat front face
const CHROME = { color: [0.97, 0.97, 0.98, 1], metallic: 1, roughness: 0.05 }; // polished chrome

const io = new NodeIO();
const doc = await io.read(INPUT);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const nodes = root.listNodes();
const node = (name) => { const n = nodes.find((m) => m.getName() === name); if (!n) throw new Error('part not found: ' + name); return n; };
const lerp = (a, b, t) => a + (b - a) * t;
const report = {};

// ---- The grille opening and the flat front face ---------------------------------------------------------
// The opening's outline is the front rim of the black grille duct; the front face is the flat body panel it sits in.
const ductP = node('Front_Grille_Duct').getMesh().listPrimitives()[0].getAttribute('POSITION');
const FACE_Z = ductP.getMax([])[2], RECESS_Z = ductP.getMin([])[2];
const uniq = (pts) => [...new Map(pts.map((p) => [p.map((v) => v.toFixed(5)).join(), p])).values()];
const ring = [];
for (let i = 0; i < ductP.getCount(); i++) { const p = ductP.getElement(i, []); if (Math.abs(p[2] - FACE_Z) < 1e-5) ring.push([p[0], p[1]]); }
const centreOf = (pts) => [pts.reduce((s, p) => s + p[0], 0) / pts.length, pts.reduce((s, p) => s + p[1], 0) / pts.length];
const byAngle = (pts) => { const c = centreOf(pts); return [...pts].sort((a, b) => Math.atan2(a[1] - c[1], a[0] - c[0]) - Math.atan2(b[1] - c[1], b[0] - c[0])); };
const opening = byAngle(uniq(ring)); // anticlockwise (x right, y up)
const bodyP = node('Sculpted_Main_Body').getMesh().listPrimitives()[0].getAttribute('POSITION');
const facePts = [];
for (let i = 0; i < bodyP.getCount(); i++) { const p = bodyP.getElement(i, []); if (Math.abs(p[2] - FACE_Z) < 1e-5) facePts.push([p[0], p[1]]); }
function hull(pts) { // convex hull, anticlockwise
  const s = uniq(pts.map((p) => [p[0], p[1]])).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  const cr = (o, a, b) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
  const lo = [], hi = [];
  for (const p of s) { while (lo.length > 1 && cr(lo[lo.length - 2], lo[lo.length - 1], p) <= 0) lo.pop(); lo.push(p); }
  for (const p of [...s].reverse()) { while (hi.length > 1 && cr(hi[hi.length - 2], hi[hi.length - 1], p) <= 0) hi.pop(); hi.push(p); }
  return [...lo.slice(0, -1), ...hi.slice(0, -1)];
}
const face = hull(facePts);
const N = opening.length;
const edgeNormal = (a, b) => { const d = [b[0] - a[0], b[1] - a[1]], l = Math.hypot(...d); return [d[1] / l, -d[0] / l]; }; // outward, anticlockwise
const normals = opening.map((p, k) => edgeNormal(p, opening[(k + 1) % N])); // normal of edge k (from vertex k to k+1)
// Point at signed distance t outward from the opening's edges, at vertex k (mitred corner).
function offsetAt(k, t) {
  const n1 = normals[(k - 1 + N) % N], n2 = normals[k], m = [n1[0] + n2[0], n1[1] + n2[1]], l = Math.hypot(...m);
  const mu = [m[0] / l, m[1] / l], f = t / (mu[0] * n1[0] + mu[1] * n1[1]);
  return [opening[k][0] + mu[0] * f, opening[k][1] + mu[1] * f];
}
// The surround's outer edge must stay on the flat front face.
const faceDist = (p) => Math.min(...face.map((a, k) => { const b = face[(k + 1) % face.length], n = edgeNormal(a, b); return -((p[0] - a[0]) * n[0] + (p[1] - a[1]) * n[1]); }));
const outerMargin = Math.min(...opening.map((_, k) => faceDist(offsetAt(k, SURROUND_WIDTH))));
if (outerMargin < FACE_MARGIN) throw new Error(`the chrome surround would run off the front face (margin ${(outerMargin * 1000).toFixed(1)} mm); make SURROUND_WIDTH smaller`);
report.opening = { corners: N, width: +(Math.max(...opening.map((p) => p[0])) - Math.min(...opening.map((p) => p[0]))).toFixed(4), height: +(Math.max(...opening.map((p) => p[1])) - Math.min(...opening.map((p) => p[1]))).toFixed(4), recessDepth: +(FACE_Z - RECESS_Z).toFixed(4) };

// ---- Mesh helpers --------------------------------------------------------------------------------------
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (v) => { const l = Math.hypot(...v) || 1; return v.map((x) => x / l); };
function meshBuilder() {
  const positions = [], nrm = [], indices = [];
  return {
    positions, nrm, indices,
    vert(p, n) { positions.push(...p); nrm.push(...norm(n)); return positions.length / 3 - 1; },
    tri(a, b, c, facing) { // wound so that the triangle faces `facing`
      const P3 = (i) => positions.slice(3 * i, 3 * i + 3);
      if (dot(cross(sub(P3(b), P3(a)), sub(P3(c), P3(a))), facing) >= 0) indices.push(a, b, c); else indices.push(a, c, b);
    },
  };
}

// ---- 1. Chrome surround --------------------------------------------------------------------------------
// Its section (t = outward distance from the opening's edge, d = distance in front of the face), going round:
// lip back -> lip front -> rounded crown -> outer edge -> back (set into the face) -> inside of the lip.
const profile = [];
profile.push({ p: [-SURROUND_LIP, -SURROUND_LIP_DEPTH] });
for (let s = 0; s <= SURROUND_STEPS; s++) { // rounded crown: a half-ellipse from the lip to the outer edge
  const u = s / SURROUND_STEPS, t = lerp(-SURROUND_LIP, SURROUND_WIDTH, u);
  const d = lerp(0.004, 0.0025, u) + SURROUND_RISE * Math.sqrt(Math.max(0, 1 - (2 * u - 1) ** 2));
  profile.push({ p: [t, d], round: s > 0 && s < SURROUND_STEPS });
}
profile.push({ p: [SURROUND_WIDTH, -SURROUND_INSET] }, { p: [-0.0015, -SURROUND_INSET] }, { p: [-0.0015, -SURROUND_LIP_DEPTH] });
// Normals of the section (in t, d), smooth over the rounded crown, sharp at its corners.
const P2 = profile.map((q) => q.p), M = P2.length;
const area = P2.reduce((s, p, k) => { const q = P2[(k + 1) % M]; return s + p[0] * q[1] - q[0] * p[1]; }, 0); // > 0: anticlockwise in (t, d)
const segN = P2.map((p, k) => { const q = P2[(k + 1) % M], e = [q[0] - p[0], q[1] - p[1]], l = Math.hypot(...e); return area > 0 ? [e[1] / l, -e[0] / l] : [-e[1] / l, e[0] / l]; });
const surround = meshBuilder();
for (let k = 0; k < N; k++) { // one straight piece per edge of the opening, mitred at the corners
  const n = normals[k], to3 = (k2, [t, d]) => { const q = offsetAt(k2, t); return [q[0], q[1], FACE_Z + d]; };
  const dir3 = ([nt, nd]) => [nt * n[0], nt * n[1], nd];
  for (let j = 0; j < M; j++) {
    const jn = (j + 1) % M;
    const smoothA = profile[j].round, smoothB = profile[jn].round;
    const nA = smoothA ? [segN[(j - 1 + M) % M][0] + segN[j][0], segN[(j - 1 + M) % M][1] + segN[j][1]] : segN[j];
    const nB = smoothB ? [segN[j][0] + segN[jn][0], segN[j][1] + segN[jn][1]] : segN[j];
    const a0 = surround.vert(to3(k, P2[j]), dir3(nA)), b0 = surround.vert(to3(k, P2[jn]), dir3(nB));
    const a1 = surround.vert(to3((k + 1) % N, P2[j]), dir3(nA)), b1 = surround.vert(to3((k + 1) % N, P2[jn]), dir3(nB));
    const facing = dir3(segN[j]);
    surround.tri(a0, b0, b1, facing);
    surround.tri(a0, b1, a1, facing);
  }
}

// ---- 2. Vertical chrome bars ---------------------------------------------------------------------------
// Where a vertical line at x crosses the opening: the lower and upper edges, each with its slope.
function spanAt(x) {
  const hits = [];
  for (let k = 0; k < N; k++) {
    const a = opening[k], b = opening[(k + 1) % N];
    if (a[0] === b[0] || x < Math.min(a[0], b[0]) || x > Math.max(a[0], b[0])) continue;
    const slope = (b[1] - a[1]) / (b[0] - a[0]);
    hits.push({ y: a[1] + slope * (x - a[0]), slope });
  }
  if (hits.length < 2) return null;
  hits.sort((p, q) => p.y - q.y);
  return { lo: hits[0], hi: hits[hits.length - 1] };
}
const bars = meshBuilder();
const xMin = Math.min(...opening.map((p) => p[0])), xMax = Math.max(...opening.map((p) => p[0]));
// The outermost bars go as far into the pointed side corners as BAR_MIN_LENGTH allows; the bars in between are
// spread evenly, as close to BAR_PITCH apart as possible.
const usableLength = (xc) => {
  let least = Infinity;
  for (let j = 0; j <= 8; j++) {
    const x = xc + BAR_WIDTH * (j / 8 - 0.5), span = spanAt(x);
    if (!span) return 0;
    least = Math.min(least, span.hi.y - span.lo.y - 2 * BAR_END_GAP * 2);
  }
  return least;
};
let reach = (xMax - xMin) / 2;
const mid = (xMin + xMax) / 2;
while (reach > 0 && (usableLength(mid + reach) < BAR_MIN_LENGTH || usableLength(mid - reach) < BAR_MIN_LENGTH)) reach -= 0.0005;
const count = Math.round((2 * reach) / BAR_PITCH) + 1, pitch = (2 * reach) / (count - 1);
const barZ = FACE_Z - BAR_SET_BACK;
let made = 0, shortest = Infinity, longest = 0;
for (let i = 0; i < count; i++) {
  const xc = mid - reach + i * pitch;
  const section = [];
  for (let j = 0; j < BAR_SIDES; j++) {
    const a = (2 * Math.PI * j) / BAR_SIDES, x = xc + (BAR_WIDTH / 2) * Math.cos(a), z = barZ + (BAR_DEPTH / 2) * Math.sin(a);
    const span = spanAt(x);
    if (!span) { section.length = 0; break; }
    // Each end follows the opening's edge, BAR_END_GAP away from it (measured square to the edge).
    const lo = span.lo.y + BAR_END_GAP * Math.hypot(1, span.lo.slope), hi = span.hi.y - BAR_END_GAP * Math.hypot(1, span.hi.slope);
    section.push({ x, z, lo, hi, n: [Math.cos(a) / (BAR_WIDTH / 2), 0, Math.sin(a) / (BAR_DEPTH / 2)] });
  }
  if (!section.length) continue;
  const length = Math.min(...section.map((s) => s.hi - s.lo));
  if (length < BAR_MIN_LENGTH / 2) continue;
  made++; shortest = Math.min(shortest, length); longest = Math.max(longest, Math.max(...section.map((s) => s.hi - s.lo)));
  const lo = section.map((s) => bars.vert([s.x, s.lo, s.z], s.n)), hi = section.map((s) => bars.vert([s.x, s.hi, s.z], s.n));
  for (let j = 0; j < BAR_SIDES; j++) {
    const jn = (j + 1) % BAR_SIDES, out = [section[j].n[0] + section[jn].n[0], 0, section[j].n[2] + section[jn].n[2]];
    bars.tri(lo[j], lo[jn], hi[jn], out);
    bars.tri(lo[j], hi[jn], hi[j], out);
  }
  for (const [ends, ny, key] of [[lo, -1, 'lo'], [hi, 1, 'hi']]) { // end caps (flat shaded)
    const pts = section.map((s) => [s.x, s[key], s.z]), c = pts.reduce((acc, p) => acc.map((v, q) => v + p[q] / pts.length), [0, 0, 0]);
    const fn = norm(cross(sub(pts[1], pts[0]), sub(pts[2], pts[0]))), capN = fn[1] * ny >= 0 ? fn : fn.map((v) => -v);
    const cv = bars.vert(c, capN), ring2 = pts.map((p) => bars.vert(p, capN));
    for (let j = 0; j < BAR_SIDES; j++) bars.tri(cv, ring2[j], ring2[(j + 1) % BAR_SIDES], capN);
  }
}
report.bars = { count: made, pitch: +pitch.toFixed(5), outermostBarCentreX: +reach.toFixed(4), width: BAR_WIDTH, depth: BAR_DEPTH, centreBehindFace: BAR_SET_BACK, shortest: +shortest.toFixed(4), longest: +longest.toFixed(4) };
report.surround = { width: SURROUND_WIDTH, standsOut: +(SURROUND_RISE + 0.004).toFixed(4), lip: SURROUND_LIP, marginToFaceEdgeMm: +(outerMargin * 1000).toFixed(1) };

// ---- 3. Swap the parts ---------------------------------------------------------------------------------
const removeNode = (name) => { // geometry data deleted only if no other part shares it
  const n = node(name), mesh = n.getMesh(), accessors = new Set();
  for (const prim of mesh.listPrimitives()) { for (const acc of [prim.getIndices(), ...prim.listAttributes()]) if (acc) accessors.add(acc); prim.dispose(); }
  mesh.dispose(); n.dispose();
  for (const acc of accessors) if (acc.listParents().every((p) => p === root)) acc.dispose();
};
for (const name of ['Front_Grille_Diamond_Mesh_A', 'Front_Grille_Diamond_Mesh_B', 'Front_Grille_Chrome_Border']) removeNode(name);
for (const m of root.listMaterials()) if (['Grille_Mesh_Silver', 'Grille_Chrome'].includes(m.getName()) && m.listParents().every((p) => p === root)) m.dispose(); // now unused
const chrome = doc.createMaterial('Grille_Polished_Chrome').setBaseColorFactor(CHROME.color).setMetallicFactor(CHROME.metallic).setRoughnessFactor(CHROME.roughness);
const world = nodes.find((n) => n.listChildren().length > 0 && !n.getMesh()) ?? null;
function addPart(name, mb) {
  const big = mb.positions.length / 3 > 65535;
  const prim = doc.createPrimitive()
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(mb.positions)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(mb.nrm)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(big ? new Uint32Array(mb.indices) : new Uint16Array(mb.indices)).setBuffer(buffer))
    .setMaterial(chrome);
  const n = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(prim));
  (world ?? root.listScenes()[0]).addChild(n);
  return mb.indices.length / 3;
}
report.triangles = { surround: addPart('Front_Grille_Chrome_Surround', surround), bars: addPart('Front_Grille_Vertical_Bars', bars) };

root.getAsset().generator = 'Racing Game: build_proto_corsa_90gt.mjs (Proto Corsa-OG with a vertical-bar chrome grille)';
await io.write(OUTPUT, doc);
console.log(JSON.stringify(report));
