// Builds "V2 GT racecar: diamond-mesh grille + fenders and quarter panels, revision 4".
//
//   node build_fenders_rev4.mjs <gt_racecar_v2_diamond_grille.glb> <output.glb>
//
// Revision 4 = revision 3 exactly, plus one change: the two front outer corners of the front splitter (seen from
// above) are rounded with a smooth circular curve (SPLITTER_CORNER_RADIUS) that runs tangentially into the splitter's
// front and side edges. The splitter's thickness, height, full width, depth and position are unchanged, and its
// curved edge is smoothly shaded.
//
// Revision 3, for reference: starts again from the approved diamond-grille design (which is only read, never
// written) and makes everything revision 2 made, then three more bodywork changes:
//   1. Lower rocker panels: the rocker's lower edge goes down a further 3.5 cm and stands out a little more, so
//      the side profile is lower and more pronounced. The carbon blade under it moves down with it.
//   2. Lower front bumper: the body's lower edge from the front wheel arches forward (the bumper corners and the
//      front face below the grille) comes down 4.5 cm. The lowered edge starts at the edge of each front arch, so
//      the arch opening now runs down to the bumper's lower edge. The splitter, which sits directly under the
//      bumper, moves down the same 4.5 cm (same shape) so the two still meet as before.
//   3. Lower rear bumper: the same at the back, from the rear wheel arches backward, 4.5 cm. The diffuser, which
//      wraps the bumper's lower edge, moves down the same 4.5 cm (same shape).
// Revision 2 in short (all kept): smooth fender and quarter-panel flares shaped by one smooth blend field, a hip
// line over each wheel, smooth sill and crease curves, body-coloured rocker panels with a carbon blade, wheel
// arches with clearance, wheel-well liners with a painted rolled edge, the old fender rings and side-skirt boxes
// removed, and the undertray notched around the wheels and trimmed inside the rockers.
// Unchanged: the diamond-mesh grille, wheels, lights, canopy, wing, canards, mirrors, the doors (the body panels
// between the wheels), the roof and deck, the shape of the splitter and diffuser, and the car's length and width.
// Car space: +Z forward, +Y up, metres, ground at y = 0.
import { NodeIO } from '@gltf-transform/core';
import cdt2d from 'cdt2d';

const [, , INPUT, OUTPUT] = process.argv;
if (!INPUT || !OUTPUT || INPUT === OUTPUT) throw new Error('usage: node build_fenders_rev4.mjs <diamond_grille.glb> <output.glb> (two different files)');

// ---- Design settings (metres) ------------------------------------------------------------------
const ARCH_RADIUS = { front: 0.4, rear: 0.385 }; // arch opening around the axle (tyre radius 0.36)
const FLARE = { front: 0.09, rear: 0.11 }; // how far the fender swells out at the arch edge
const HIP_RISE = 0.055; // the side crease rises this much over each wheel ("hip line")
const HIP_LENGTH = 0.6; // ... blending back to the original crease over this distance either side of the axle
const ARCH_TOP_FLARE = 0.45; // blend value at the top of each arch (1 at its sides): a gentler fender crown
const NORMAL_SMOOTHING = 3; // passes of neighbour averaging of the shading normals in the smooth panels (evens out
//                               the faceting a 2.5 cm mesh leaves in the reflections; the shape itself is not moved)
const LINER_X = 0.49; // inner wall of each wheel well (distance from the car's centre line)
const ROLLED_EDGE = 0.03; // painted rolled edge inside the arch, before the black liner
const GRID = 0.025; // even surface point spacing on the rebuilt panels
const ARC_SEGMENTS = 72; // smoothness of each arch
const ROCKER_BOTTOM = 0.28; // rocker panel's lower edge height (revision 2: 0.315; the original sill is at 0.39)
const ROCKER_KICK = 0.065; // how far the rocker's lower edge stands out beyond the sill (revision 2: 0.05)
const ROCKER_CURVE = 0.006; // slight outward curve of the rocker face
const ROCKER_INNER_X = 0.62; // the rocker's inner face (distance from the car's centre line)
const BLADE_THICKNESS = 0.0115; // carbon blade under the rocker
const BLADE_OVERHANG = 0.025; // the blade stands out this far beyond the painted rocker
const BLADE_END_GAP = 0.012; // the blade stops this far short of the arch edges
const UNDERTRAY_NOTCH_X = 0.47; // the undertray stays inside this distance from the centre line at the wheels
const UNDERTRAY_NOTCH_CLEARANCE = 0.025;
const FRONT_BUMPER_DROP = 0.045; // the body's lower edge ahead of the front wheels comes down this much
const REAR_BUMPER_DROP = 0.045; // ... and behind the rear wheels
const SPLITTER_CORNER_RADIUS = 0.18; // revision 4: radius of the rounded front outer corners of the splitter
const SPLITTER_CORNER_SEGMENTS = 24; // straight pieces per rounded corner (shaded smoothly)
// (Each drop eases in smoothly between the axle and the arch edge, inside the wheel opening, so along the visible
// bumper it is the full amount. The splitter and diffuser move down by the same amounts.)

const io = new NodeIO();
const doc = await io.read(INPUT);
const root = doc.getRoot();
const buffer = root.listBuffers()[0];
const nodes = root.listNodes();
const node = (name) => nodes.find((n) => n.getName() === name);
const lerp = (a, b, t) => a + (b - a) * t;
const smootherstep = (t) => { t = Math.min(1, Math.max(0, t)); return t * t * t * (t * (6 * t - 15) + 10); };

// ---- The body's cross-sections ("stations") --------------------------------------------------------
const bodyPrim = node('Sculpted_Main_Body').getMesh().listPrimitives()[0];
const P = bodyPrim.getAttribute('POSITION');
const I = Array.from(bodyPrim.getIndices().getArray());
const ORIGINAL_VERTS = 64; // the original body's vertices (later ones belong to the grille opening)
const pos = (i) => P.getElement(i, []);
const role = {};
const stationMap = new Map();
for (let i = 0; i < ORIGINAL_VERTS; i++) {
  const [x, y, z] = pos(i);
  const key = z.toFixed(4);
  if (!stationMap.has(key)) stationMap.set(key, { z, pts: [] });
  stationMap.get(key).pts.push({ i, x, y });
}
const ROLES = ['bottom', 'widest', 'shoulder', 'roof'];
const stations = [...stationMap.values()].sort((a, b) => a.z - b.z).map((st) => {
  const right = st.pts.filter((p) => p.x > 0).sort((a, b) => a.y - b.y);
  const left = st.pts.filter((p) => p.x < 0).sort((a, b) => a.y - b.y);
  const out = { z: st.z };
  ROLES.forEach((r, k) => {
    out[r] = { x: right[k].x, y: right[k].y };
    role[right[k].i] = { r, s: 1, z: st.z };
    role[left[k].i] = { r, s: -1, z: st.z };
  });
  return out;
});
const stationZs = stations.map((s) => s.z);
const zMin = stationZs[0], zMax = stationZs[stationZs.length - 1];

// ---- Wheels, zones ---------------------------------------------------------------------------------
function wheelInfo(name) {
  const p = node(name).getMesh().listPrimitives()[0].getAttribute('POSITION');
  const a = p.getMin([]), b = p.getMax([]);
  return { x: (a[0] + b[0]) / 2, y: (a[1] + b[1]) / 2, z: (a[2] + b[2]) / 2, radius: (b[1] - a[1]) / 2, halfWidth: (b[0] - a[0]) / 2 };
}
const frontWheel = wheelInfo('Wheel_FR'), rearWheel = wheelInfo('Wheel_RR');
// The door segment: the stretch of body between the wheels whose cross-section stays the same.
const doorStations = stationZs.filter((z) => z > rearWheel.z + 0.6 && z < frontWheel.z - 0.6);
const DOOR = [Math.min(...doorStations), Math.max(...doorStations)];
const ZONES = [
  { name: 'front', wheel: frontWheel, R: ARCH_RADIUS.front, flare: FLARE.front, z0: DOOR[1], z1: zMax },
  { name: 'rear', wheel: rearWheel, R: ARCH_RADIUS.rear, flare: FLARE.rear, z0: zMin, z1: DOOR[0] },
].map((zone) => ({ ...zone, yc: zone.wheel.y, zc: zone.wheel.z }));
const F = ZONES[0], RZ = ZONES[1];

// ---- Base body lines, smoothed inside the fender zones ----------------------------------------------
// Monotone cubic (Fritsch–Carlson) through the stations of one zone: no overshoot, exact at every station.
function monotoneCubic(xs, ys) {
  const n = xs.length, d = [], m = new Array(n);
  for (let k = 0; k < n - 1; k++) d.push((ys[k + 1] - ys[k]) / (xs[k + 1] - xs[k]));
  m[0] = d[0]; m[n - 1] = d[n - 2];
  for (let k = 1; k < n - 1; k++) m[k] = d[k - 1] * d[k] <= 0 ? 0 : (3 * (xs[k + 1] - xs[k - 1])) / ((2 * xs[k + 1] - xs[k] - xs[k - 1]) / d[k - 1] + (xs[k + 1] + xs[k] - 2 * xs[k - 1]) / d[k]);
  return (x) => {
    let k = 0;
    while (k < n - 2 && x > xs[k + 1]) k++;
    const h = xs[k + 1] - xs[k], t = (x - xs[k]) / h;
    const h00 = 2 * t ** 3 - 3 * t ** 2 + 1, h10 = t ** 3 - 2 * t ** 2 + t, h01 = -2 * t ** 3 + 3 * t ** 2, h11 = t ** 3 - t ** 2;
    return h00 * ys[k] + h10 * h * m[k] + h01 * ys[k + 1] + h11 * h * m[k + 1];
  };
}
const linear = (r, c) => (z) => {
  let k = stations.findIndex((s, j) => j < stations.length - 1 && z >= s.z - 1e-9 && z <= stations[j + 1].z + 1e-9);
  if (k < 0) k = z < stations[0].z ? 0 : stations.length - 2;
  const a = stations[k], b = stations[k + 1];
  return lerp(a[r][c], b[r][c], (z - a.z) / (b.z - a.z));
};
const curves = {};
for (const zone of ZONES) {
  const st = stations.filter((s) => s.z >= zone.z0 - 1e-9 && s.z <= zone.z1 + 1e-9);
  const zs = st.map((s) => s.z);
  zone.line = {};
  for (const r of ['bottom', 'widest']) for (const c of ['x', 'y']) zone.line[r + c] = monotoneCubic(zs, st.map((s) => s[r][c]));
}
for (const r of ROLES) for (const c of ['x', 'y']) curves[r + c] = linear(r, c);
const zoneAt = (z) => ZONES.find((zone) => z >= zone.z0 - 1e-9 && z <= zone.z1 + 1e-9 && !(z > DOOR[0] + 1e-9 && z < DOOR[1] - 1e-9)) ?? null;
// How far the body's lower edge is lowered at z: nothing between the axles, the full bumper drop from the arch
// edges outward, easing in smoothly between the axle and the arch edge (inside the wheel opening).
function bumperDrop(z) {
  if (z > F.zc) return FRONT_BUMPER_DROP * smootherstep((z - F.zc) / F.R);
  if (z < RZ.zc) return REAR_BUMPER_DROP * smootherstep((RZ.zc - z) / RZ.R);
  return 0;
}
// Sill (bottom), crease (widest) and shoulder lines at any z. The shoulder stays as in the original body,
// because the untouched deck panels above it share that line.
function lineAt(r, z) {
  const zone = zoneAt(z);
  if (zone && r === 'widest') {
    const u = (z - zone.zc) / HIP_LENGTH;
    const hip = Math.abs(u) < 1 ? HIP_RISE * Math.cos((Math.PI / 2) * u) ** 2 : 0; // smooth rise over the wheel
    return { x: zone.line.widestx(z), y: zone.line.widesty(z) + hip };
  }
  if (zone && r === 'bottom') {
    // Lowered bumpers: the side panel's own slope (from the crease down to the sill) simply continues further down,
    // so every part of the body above the old lower edge keeps exactly its revision 2 shape.
    const x = zone.line.bottomx(z), y = zone.line.bottomy(z), drop = bumperDrop(z);
    if (!drop) return { x, y };
    const w = lineAt('widest', z);
    return { x: x - ((w.x - x) * drop) / (w.y - y), y: y - drop };
  }
  return { x: curves[r + 'x'](z), y: curves[r + 'y'](z) };
}
// The base body side as x = X0(y, z): straight from sill to crease and from crease to shoulder.
function X0(y, z) {
  const b = lineAt('bottom', z), w = lineAt('widest', z), s = lineAt('shoulder', z);
  if (y <= w.y) return lerp(b.x, w.x, (y - b.y) / (w.y - b.y));
  return lerp(w.x, s.x, (y - w.y) / (s.y - w.y));
}
function archCut(zone, dir) {
  let z = zone.zc + dir * zone.R;
  for (let k = 0; k < 40; k++) z = zone.zc + dir * Math.sqrt(zone.R * zone.R - (lineAt('bottom', z).y - zone.yc) ** 2);
  return z;
}
for (const zone of ZONES) { zone.zr = archCut(zone, -1); zone.zf = archCut(zone, 1); }
const ROCKER = [RZ.zf, F.zr]; // the rocker runs between the rear arch's front edge and the front arch's rear edge

// ---- Helpers -------------------------------------------------------------------------------------
function sampleZ(a, b, step, extra = []) {
  const zs = [a, b, ...extra, ...stationZs.filter((z) => z > a + 1e-6 && z < b - 1e-6)];
  const n = Math.max(1, Math.round((b - a) / step));
  for (let k = 1; k < n; k++) zs.push(a + ((b - a) * k) / n);
  zs.sort((p, q) => p - q);
  return zs.filter((z, k) => k === 0 || z - zs[k - 1] > 0.006 || k === zs.length - 1).filter((z, k, arr) => k === arr.length - 1 || k === 0 || arr[arr.length - 1] - z > 0.006);
}
function segDist(px, py, ax, ay, bx, by) {
  const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy;
  const t = l2 ? Math.max(0, Math.min(1, ((px - ax) * dx + (py - ay) * dy) / l2)) : 0;
  return Math.hypot(px - ax - t * dx, py - ay - t * dy);
}
function insidePoly(px, py, poly) {
  let c = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const [xi, yi] = poly[i], [xj, yj] = poly[j];
    if (yi > py !== yj > py && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) c = !c;
  }
  return c;
}
// Even interior points (a staggered grid, which gives near-equilateral triangles).
function steinerPoints(outline) {
  const xs = outline.map((p) => p[0]), ys = outline.map((p) => p[1]);
  const out = [], dy = GRID * 0.866;
  for (let row = 0, v = Math.min(...ys); v <= Math.max(...ys); row++, v += dy)
    for (let u = Math.min(...xs) + (row % 2 ? GRID / 2 : 0); u <= Math.max(...xs); u += GRID) {
      if (!insidePoly(u, v, outline)) continue;
      let near = false;
      for (let k = 0; k < outline.length && !near; k++) { const a = outline[k], b = outline[(k + 1) % outline.length]; if (segDist(u, v, a[0], a[1], b[0], b[1]) < 0.55 * GRID) near = true; }
      if (!near) out.push([u, v]);
    }
  return out;
}
function triangulate(outline, steiner = []) {
  const pts = [...outline, ...steiner];
  return { pts, tris: cdt2d(pts, outline.map((_, k) => [k, (k + 1) % outline.length]), { exterior: false }) };
}
const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
function pushTri(list, a, b, c, towards) {
  const n = cross(sub(b, a), sub(c, a));
  if (Math.hypot(...n) < 1e-12) return;
  if (dot(n, towards) >= 0) list.push(a, b, c);
  else list.push(a, c, b);
}
// A smoothly shaded group of shared points; triangles are oriented towards `towards(p)`.
function smoothGroup(points, tris, towards) {
  const g = { points, tris: [] };
  for (const [a, b, c] of tris) {
    const n = cross(sub(points[b], points[a]), sub(points[c], points[a]));
    if (Math.hypot(...n) < 1e-12) continue;
    const mid = [0, 1, 2].map((k) => (points[a][k] + points[b][k] + points[c][k]) / 3);
    g.tris.push(dot(n, towards(mid)) >= 0 ? [a, b, c] : [a, c, b]);
  }
  return g;
}

// ---- 1. Side panels: lower (sill to crease) and upper (crease to shoulder) ---------------------------
const bodyFlat = []; // flat-shaded painted triangles (like the original body)
const smoothGroups = []; // smoothly shaded painted panels
const sillX = new Map(); // z → x of the (flared) sill line, shared with the rocker, underside and wheel wells
const archOuterX = {}; // per zone: x of the arch edge points (the flare at the arch)
const zk = (z) => z.toFixed(6);
const report = { zones: {} };

for (const zone of ZONES) {
  const sillA = sampleZ(zone.z0, zone.zr, GRID), sillB = sampleZ(zone.zf, zone.z1, GRID);
  const crease = sampleZ(zone.z0, zone.z1, GRID);
  const shoulderZs = stationZs.filter((z) => z >= zone.z0 - 1e-9 && z <= zone.z1 + 1e-9);
  // Angles of the arch's two ends about the axle. The rear end is kept between 90 and 270 degrees, so the arch always
  // runs over the top of the wheel, even where a lowered bumper takes an end slightly below the axle.
  let phiR = Math.atan2(lineAt('bottom', zone.zr).y - zone.yc, zone.zr - zone.zc);
  const phiF = Math.atan2(lineAt('bottom', zone.zf).y - zone.yc, zone.zf - zone.zc);
  if (phiR < 0) phiR += 2 * Math.PI;
  const arc = [];
  for (let k = 0; k <= ARC_SEGMENTS; k++) { const phi = lerp(phiR, phiF, k / ARC_SEGMENTS); arc.push([zone.zc + zone.R * Math.cos(phi), zone.yc + zone.R * Math.sin(phi)]); }
  arc[0] = [zone.zr, lineAt('bottom', zone.zr).y];
  arc[arc.length - 1] = [zone.zf, lineAt('bottom', zone.zf).y];
  zone.arc = arc;
  const lowerOutline = [...sillA.map((z) => [z, lineAt('bottom', z).y]), ...arc.slice(1, -1), ...sillB.map((z) => [z, lineAt('bottom', z).y]), ...[...crease].reverse().map((z) => [z, lineAt('widest', z).y])];
  const upperOutline = [...crease.map((z) => [z, lineAt('widest', z).y]), ...[...shoulderZs].reverse().map((z) => [z, lineAt('shoulder', z).y])];
  const lower = triangulate(lowerOutline, steinerPoints(lowerOutline));
  const upper = triangulate(upperOutline, steinerPoints(upperOutline));

  // Harmonic blend field over both panels together (joined along the crease): 1 on the arch edge (easing to
  // ARCH_TOP_FLARE at its top), 0 on the
  // shoulder line and at both ends of the zone; free along the sill.
  const key = ([z, y]) => `${z.toFixed(6)},${y.toFixed(6)}`;
  const index = new Map(), verts = [];
  const idOf = (p) => { const k = key(p); if (!index.has(k)) { index.set(k, verts.length); verts.push(p); } return index.get(k); };
  const lowerIds = lower.pts.map(idOf), upperIds = upper.pts.map(idOf);
  const allTris = [...lower.tris.map((t) => t.map((i) => lowerIds[i])), ...upper.tris.map((t) => t.map((i) => upperIds[i]))];
  const fixed = new Map();
  for (const p of arc) {
    const up = Math.max(0, (p[1] - zone.yc) / zone.R); // 0 at the sides of the arch, 1 at its top
    fixed.set(idOf(p), 1 - (1 - ARCH_TOP_FLARE) * up * up);
  }
  for (const [z, y] of [...upperOutline, ...lowerOutline]) {
    const id = idOf([z, y]);
    if (fixed.has(id)) continue;
    const onShoulder = upperOutline.slice(crease.length).some((q) => q[0] === z && q[1] === y);
    if (onShoulder || Math.abs(z - zone.z0) < 1e-9 || Math.abs(z - zone.z1) < 1e-9) fixed.set(id, 0);
  }
  // Cotangent weights (in the panel's own flat layout), Gauss–Seidel with over-relaxation.
  const nbr = verts.map(() => new Map());
  for (const [a, b, c] of allTris) {
    for (const [i, j, k] of [[a, b, c], [b, c, a], [c, a, b]]) {
      const u = [verts[i][0] - verts[k][0], verts[i][1] - verts[k][1]], v = [verts[j][0] - verts[k][0], verts[j][1] - verts[k][1]];
      const cot = (u[0] * v[0] + u[1] * v[1]) / Math.max(1e-12, Math.abs(u[0] * v[1] - u[1] * v[0]));
      const w = Math.max(0.01, cot / 2);
      nbr[i].set(j, (nbr[i].get(j) ?? 0) + w);
      nbr[j].set(i, (nbr[j].get(i) ?? 0) + w);
    }
  }
  const h = verts.map((_, i) => (fixed.has(i) ? fixed.get(i) : 0.3));
  for (let it = 0; it < 6000; it++) {
    let change = 0;
    for (let i = 0; i < verts.length; i++) {
      if (fixed.has(i)) continue;
      let s = 0, ws = 0;
      for (const [j, w] of nbr[i]) { s += w * h[j]; ws += w; }
      const next = h[i] + 1.85 * (s / ws - h[i]);
      change = Math.max(change, Math.abs(next - h[i]));
      h[i] = next;
    }
    if (change < 1e-7) { report.zones[zone.name] = { harmonicIterations: it + 1 }; break; }
  }
  const flareOf = (id) => zone.flare * smootherstep(h[id]);
  for (const s of [1, -1]) {
    const make = (pts, ids) => pts.map(([z, y], k) => [s * (X0(y, z) + flareOf(ids[k])), y, z]);
    smoothGroups.push(smoothGroup(make(lower.pts, lowerIds), lower.tris, () => [s, -0.2, 0]));
    smoothGroups.push(smoothGroup(make(upper.pts, upperIds), upper.tris, () => [s, 0.6, 0]));
  }
  for (const z of [...sillA, ...sillB]) sillX.set(zk(z), X0(lineAt('bottom', z).y, z) + flareOf(idOf([z, lineAt('bottom', z).y])));
  archOuterX[zone.name] = arc.map(([z, y]) => X0(y, z) + flareOf(idOf([z, y])));
  report.zones[zone.name] = { ...report.zones[zone.name], zone: [+zone.z0.toFixed(3), +zone.z1.toFixed(3)], archCuts: [+zone.zr.toFixed(4), +zone.zf.toFixed(4)], archRadius: zone.R, flare: zone.flare, panelPoints: verts.length };
}

// Door panels (lower strip between the zones): rebuilt exactly in their original flat plane, with points along
// the sill so the rocker can join them; their top edge (shared with the untouched upper door panel) keeps its
// two original corners.
const doorSill = sampleZ(DOOR[0], DOOR[1], GRID);
for (const z of doorSill) sillX.set(zk(z), X0(lineAt('bottom', z).y, z));
{
  const outline = [...doorSill.map((z) => [z, lineAt('bottom', z).y]), [DOOR[1], lineAt('widest', DOOR[1]).y], [DOOR[0], lineAt('widest', DOOR[0]).y]];
  const t = triangulate(outline);
  for (const s of [1, -1]) for (const [a, b, c] of t.tris) {
    const [p, q, r] = [a, b, c].map((k) => { const [z, y] = t.pts[k]; return [s * X0(y, z), y, z]; });
    pushTri(bodyFlat, p, q, r, [s, -0.2, 0]);
  }
}

// ---- 2. Rocker panels ---------------------------------------------------------------------------------
const rockerZs = [...sampleZ(RZ.zf, RZ.z1, GRID), ...doorSill.slice(1, -1), ...sampleZ(F.z0, F.zr, GRID)];
const ROCKER_FACE_STEPS = 5;
const rockerFlat = [];
const blades = [];
// Cross-section at z (right side): points down the outer face from the sill to the lower edge, then the
// lower edge, inner bottom and inner top corners.
function rockerSection(z) {
  const yb = lineAt('bottom', z).y, xs = sillX.get(zk(z));
  const T = [xs, yb], E = [xs + ROCKER_KICK, ROCKER_BOTTOM];
  const len = Math.hypot(E[0] - T[0], E[1] - T[1]), n = [(T[1] - E[1]) / len, (E[0] - T[0]) / len]; // outward (and upward) normal of the face
  const face = [];
  for (let k = 0; k <= ROCKER_FACE_STEPS; k++) {
    const u = k / ROCKER_FACE_STEPS, b = ROCKER_CURVE * Math.sin(Math.PI * u);
    face.push([lerp(T[0], E[0], u) + b * n[0], lerp(T[1], E[1], u) + b * n[1]]);
  }
  return { face, bottomIn: [ROCKER_INNER_X, ROCKER_BOTTOM], topIn: [ROCKER_INNER_X, yb] };
}
const sections = rockerZs.map((z) => ({ z, ...rockerSection(z) }));
for (const s of [1, -1]) {
  // Outer face: smoothly shaded strip.
  const pts = [], tris = [];
  sections.forEach((sec) => sec.face.forEach(([x, y]) => pts.push([s * x, y, sec.z])));
  const W = ROCKER_FACE_STEPS + 1;
  for (let k = 0; k < sections.length - 1; k++) for (let j = 0; j < ROCKER_FACE_STEPS; j++) {
    const a = k * W + j, b = k * W + j + 1, c = (k + 1) * W + j + 1, d = (k + 1) * W + j;
    tris.push([a, b, c], [a, c, d]);
  }
  smoothGroups.push(smoothGroup(pts, tris, () => [s, 0.3, 0]));
  // Bottom and inner face: flat.
  for (let k = 0; k < sections.length - 1; k++) {
    const A = sections[k], B = sections[k + 1];
    const e = (sec) => sec.face[ROCKER_FACE_STEPS];
    pushTri(rockerFlat, [s * e(A)[0], e(A)[1], A.z], [s * e(B)[0], e(B)[1], B.z], [s * B.bottomIn[0], B.bottomIn[1], B.z], [0, -1, 0]);
    pushTri(rockerFlat, [s * e(A)[0], e(A)[1], A.z], [s * B.bottomIn[0], B.bottomIn[1], B.z], [s * A.bottomIn[0], A.bottomIn[1], A.z], [0, -1, 0]);
    pushTri(rockerFlat, [s * A.bottomIn[0], A.bottomIn[1], A.z], [s * B.bottomIn[0], B.bottomIn[1], B.z], [s * B.topIn[0], B.topIn[1], B.z], [-s, 0, 0]);
    pushTri(rockerFlat, [s * A.bottomIn[0], A.bottomIn[1], A.z], [s * B.topIn[0], B.topIn[1], B.z], [s * A.topIn[0], A.topIn[1], A.z], [-s, 0, 0]);
  }
  // End faces at the arch edges: the arch continues down through the rocker.
  for (const [sec, dir] of [[sections[0], 1], [sections[sections.length - 1], -1]]) {
    const xs = sec.face[0][0];
    const outline = [[xs, sec.face[0][1]], [xs - ROLLED_EDGE, sec.face[0][1]], sec.topIn, sec.bottomIn, ...[...sec.face].reverse().slice(0, -1)];
    const t = triangulate(outline);
    for (const [a, b, c] of t.tris) {
      const [p, q, r] = [a, b, c].map((k) => [s * t.pts[k][0], t.pts[k][1], sec.z]);
      pushTri(rockerFlat, p, q, r, [0, 0, -dir]); // faces the wheel
    }
  }
  // Carbon blade under the rocker.
  const z0 = ROCKER[0] + BLADE_END_GAP, z1 = ROCKER[1] - BLADE_END_GAP;
  const bz = sampleZ(z0, z1, 0.1, rockerZs.filter((z) => z > z0 && z < z1));
  const bx = (z) => { const k = rockerZs.findIndex((q) => q >= z); const a = sections[Math.max(0, k - 1)], b = sections[Math.max(0, k)]; const t = b.z === a.z ? 0 : (z - a.z) / (b.z - a.z); return lerp(a.face[ROCKER_FACE_STEPS][0], b.face[ROCKER_FACE_STEPS][0], t) + BLADE_OVERHANG; };
  const yTop = ROCKER_BOTTOM - 0.0005, yBot = ROCKER_BOTTOM - BLADE_THICKNESS; // just below the rocker, not touching it
  const blade = [];
  for (let k = 0; k < bz.length - 1; k++) {
    const A = bz[k], B = bz[k + 1];
    const q = (x, y, z) => [s * x, y, z];
    for (const [y, dirY] of [[yTop, 1], [yBot, -1]]) {
      pushTri(blade, q(bx(A), y, A), q(bx(B), y, B), q(ROCKER_INNER_X, y, B), [0, dirY, 0]);
      pushTri(blade, q(bx(A), y, A), q(ROCKER_INNER_X, y, B), q(ROCKER_INNER_X, y, A), [0, dirY, 0]);
    }
    pushTri(blade, q(bx(A), yBot, A), q(bx(B), yBot, B), q(bx(B), yTop, B), [s, 0, 0]);
    pushTri(blade, q(bx(A), yBot, A), q(bx(B), yTop, B), q(bx(A), yTop, A), [s, 0, 0]);
    pushTri(blade, q(ROCKER_INNER_X, yBot, A), q(ROCKER_INNER_X, yBot, B), q(ROCKER_INNER_X, yTop, B), [-s, 0, 0]);
    pushTri(blade, q(ROCKER_INNER_X, yBot, A), q(ROCKER_INNER_X, yTop, B), q(ROCKER_INNER_X, yTop, A), [-s, 0, 0]);
  }
  for (const [z, dir] of [[bz[0], -1], [bz[bz.length - 1], 1]]) {
    const q = (x, y) => [s * x, y, z];
    pushTri(blade, q(ROCKER_INNER_X, yBot), q(bx(z), yBot), q(bx(z), yTop), [0, 0, dir]);
    pushTri(blade, q(ROCKER_INNER_X, yBot), q(bx(z), yTop), q(ROCKER_INNER_X, yTop), [0, 0, dir]);
  }
  blades.push({ s, tris: blade });
}
report.rocker = { from: +ROCKER[0].toFixed(4), to: +ROCKER[1].toFixed(4), lowerEdge: ROCKER_BOTTOM, bladeBottom: +(ROCKER_BOTTOM - BLADE_THICKNESS).toFixed(4) };

// ---- 3. Underside (whole length), with the wheel-well notches and the rocker inner faces --------------
{
  const yAt = (z) => lineAt('bottom', z).y;
  const sillFront = sampleZ(F.zf, F.z1, GRID), sillRear = sampleZ(RZ.z0, RZ.zr, GRID);
  const chord = (zone) => sampleZ(zone.zr, zone.zf, 10).filter((z) => z > zone.zr + 1e-6 && z < zone.zf - 1e-6);
  const notchEdge = (z) => [[sillX.get(zk(z)), z], [sillX.get(zk(z)) - ROLLED_EDGE, z], [ROCKER_INNER_X, z], [LINER_X, z]];
  const right = [
    ...sillRear.map((z) => [sillX.get(zk(z)), z]),
    ...notchEdge(RZ.zr).slice(1),
    ...chord(RZ).map((z) => [LINER_X, z]),
    [LINER_X, RZ.zf], [ROCKER_INNER_X, RZ.zf],
    ...rockerZs.slice(1, -1).map((z) => [ROCKER_INNER_X, z]),
    [ROCKER_INNER_X, F.zr], [LINER_X, F.zr],
    ...chord(F).map((z) => [LINER_X, z]),
    ...[...notchEdge(F.zf)].reverse().slice(0, -1),
    ...sillFront.map((z) => [sillX.get(zk(z)), z]),
  ];
  const left = right.map(([x, z]) => [-x, z]).reverse();
  const t = triangulate([...right, ...left]);
  for (const [a, b, c] of t.tris) {
    const [p, q, r] = [a, b, c].map((k) => { const [x, z] = t.pts[k]; return [x, yAt(z), z]; });
    pushTri(bodyFlat, p, q, r, [0, -1, 0]);
  }
}

// ---- 4. Wheel wells -------------------------------------------------------------------------------------
const liners = {};
for (const zone of ZONES) for (const s of [1, -1]) {
  const key = (zone.name === 'front' ? 'F' : 'R') + (s > 0 ? 'R' : 'L');
  const liner = (liners[key] = []);
  const ring = zone.arc.map(([z, y], k) => {
    const xo = archOuterX[zone.name][k];
    return { o: [s * xo, y, z], m: [s * (xo - ROLLED_EDGE), y, z], r: [s * ROCKER_INNER_X, y, z], i: [s * LINER_X, y, z] };
  });
  for (let k = 0; k < ring.length - 1; k++) {
    const a = ring[k], b = ring[k + 1];
    const towardsAxle = [0, zone.yc - (a.o[1] + b.o[1]) / 2, zone.zc - (a.o[2] + b.o[2]) / 2];
    pushTri(bodyFlat, a.o, b.o, b.m, towardsAxle);
    pushTri(bodyFlat, a.o, b.m, a.m, towardsAxle);
    for (const [u, v] of [['m', 'r'], ['r', 'i']]) {
      pushTri(liner, a[u], b[u], b[v], towardsAxle);
      pushTri(liner, a[u], b[v], a[v], towardsAxle);
    }
  }
  const chordZs = sampleZ(zone.zr, zone.zf, 10).filter((z) => z > zone.zr + 1e-6 && z < zone.zf - 1e-6);
  const wall = [...zone.arc, ...[...chordZs].reverse().map((z) => [z, lineAt('bottom', z).y])];
  const w = triangulate(wall);
  for (const [a, b, c] of w.tris) {
    const [p, q, r] = [a, b, c].map((k) => [s * LINER_X, w.pts[k][1], w.pts[k][0]]);
    pushTri(liner, p, q, r, [s, 0, 0]);
  }
}

// ---- 5. Replace the body's side and underside panels, keep everything else ----------------------------
// Rebuilt: lower side panels (whole length), upper side panels in the two fender zones, and the underside.
const keep = [];
let removed = 0;
for (let t = 0; t < I.length; t += 3) {
  const v = I.slice(t, t + 3);
  const orig = v.every((i) => i < ORIGINAL_VERTS);
  let replace = false;
  if (orig) {
    const roles = new Set(v.map((i) => role[i].r)), sides = new Set(v.map((i) => role[i].s)), zs = new Set(v.map((i) => role[i].z.toFixed(4)));
    const span = zs.size === 2;
    const lowerStrip = sides.size === 1 && roles.size === 2 && roles.has('bottom') && roles.has('widest');
    const upperStrip = sides.size === 1 && roles.size === 2 && roles.has('widest') && roles.has('shoulder') && ZONES.some((zone) => v.every((i) => role[i].z >= zone.z0 - 1e-9 && role[i].z <= zone.z1 + 1e-9));
    const underside = sides.size === 2 && roles.size === 1 && roles.has('bottom');
    replace = span && (lowerStrip || upperStrip || underside);
  }
  if (replace) removed++;
  else keep.push(...v);
}
const positions = [], normals = [], indices = [];
const faceNormal = (a, b, c) => { const n = cross(sub(b, a), sub(c, a)); const l = Math.hypot(...n); return n.map((v) => v / l); };
const addFlat = (a, b, c) => { const n = faceNormal(a, b, c), k = positions.length / 3; positions.push(...a, ...b, ...c); normals.push(...n, ...n, ...n); indices.push(k, k + 1, k + 2); };
// Kept original triangles: their lower-edge corners follow the lowered bumper line (the front face below the grille
// and the rear face get taller and tuck in slightly at their lower corners; everything else stays where it was).
const posKept = (i) => {
  const p = pos(i);
  if (!(i < ORIGINAL_VERTS && role[i].r === 'bottom')) return p;
  const b = lineAt('bottom', p[2]);
  return [Math.sign(p[0]) * b.x, b.y, p[2]];
};
for (let t = 0; t < keep.length; t += 3) addFlat(posKept(keep[t]), posKept(keep[t + 1]), posKept(keep[t + 2]));
for (const list of [bodyFlat, rockerFlat]) for (let t = 0; t < list.length; t += 3) addFlat(list[t], list[t + 1], list[t + 2]);
let smoothTris = 0;
for (const g of smoothGroups) {
  const acc = g.points.map(() => [0, 0, 0]);
  for (const [a, b, c] of g.tris) { const n = cross(sub(g.points[b], g.points[a]), sub(g.points[c], g.points[a])); for (const v of [a, b, c]) for (let k = 0; k < 3; k++) acc[v][k] += n[k]; }
  let nrm = acc.map((n) => { const l = Math.hypot(...n) || 1; return n.map((x) => x / l); });
  const ring = g.points.map(() => new Set());
  for (const [a, b, c] of g.tris) for (const [i, j] of [[a, b], [b, c], [c, a]]) { ring[i].add(j); ring[j].add(i); }
  for (let pass = 0; pass < NORMAL_SMOOTHING; pass++) {
    nrm = nrm.map((n, v) => {
      const m = [...n];
      for (const j of ring[v]) for (let k = 0; k < 3; k++) m[k] += nrm[j][k];
      const l = Math.hypot(...m) || 1;
      return m.map((x) => x / l);
    });
  }
  const k0 = positions.length / 3;
  g.points.forEach((p, v) => { positions.push(...p); normals.push(...nrm[v]); });
  for (const [a, b, c] of g.tris) indices.push(k0 + a, k0 + b, k0 + c);
  smoothTris += g.tris.length;
}
const oldIdx = bodyPrim.getIndices();
bodyPrim
  .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer))
  .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer))
  .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint32Array(indices)).setBuffer(buffer));
for (const acc of [P, oldIdx]) if (acc.listParents().every((p) => p === root)) acc.dispose();

// ---- 6. New and adjusted parts ---------------------------------------------------------------------------
const world = nodes.find((n) => n.listChildren().length > 0 && !n.getMesh()) ?? null;
const addNode = (name, tris, mat) => {
  const acc = doc.createAccessor().setType('VEC3').setArray(new Float32Array(tris.flat())).setBuffer(buffer);
  const n = doc.createNode(name).setMesh(doc.createMesh(name).addPrimitive(doc.createPrimitive().setAttribute('POSITION', acc).setMaterial(mat)));
  (world ?? root.listScenes()[0]).addChild(n);
};
const linerMat = doc.createMaterial('Wheel_Well_Black').setBaseColorFactor([0.018, 0.019, 0.021, 1]).setMetallicFactor(0).setRoughnessFactor(0.9);
for (const [key, tris] of Object.entries(liners)) addNode('Wheel_Well_Liner_' + key, tris, linerMat);
const carbon = root.listMaterials().find((m) => m.getName() === 'Carbon_Fibre');
for (const b of blades) addNode(b.s > 0 ? 'Rocker_Blade_R' : 'Rocker_Blade_L', b.tris, carbon);
// Removes a part. Its geometry data is deleted only if no other part shares it (several small box parts in the
// original file share one list of triangle corners).
const removeNode = (name) => {
  const n = node(name), mesh = n.getMesh();
  const accessors = new Set();
  for (const prim of mesh.listPrimitives()) {
    for (const acc of [prim.getIndices(), ...prim.listAttributes()]) if (acc) accessors.add(acc);
    prim.dispose();
  }
  mesh.dispose();
  n.dispose();
  for (const acc of accessors) if (acc.listParents().every((p) => p === root)) acc.dispose();
};
// The old flat fender rings (replaced by the fenders) and carbon side-skirt boxes (replaced by the rockers).
for (const name of ['Fender_Lip_FL', 'Fender_Lip_FR', 'Fender_Lip_RL', 'Fender_Lip_RR', 'Left_Side_Skirt', 'Right_Side_Skirt']) removeNode(name);
// Carbon undertray: notched around the wheels and trimmed to sit inside the rockers between them.
{
  const prim = node('Carbon_Undertray').getMesh().listPrimitives()[0];
  const up = prim.getAttribute('POSITION'), ui = prim.getIndices();
  const [x0, y0, z0] = up.getMin([]), [x1, y1, z1] = up.getMax([]);
  const reach = (w) => Math.hypot(w.radius, w.halfWidth) + UNDERTRAY_NOTCH_CLEARANCE;
  const rN = [rearWheel.z - reach(rearWheel), rearWheel.z + reach(rearWheel)], fN = [frontWheel.z - reach(frontWheel), frontWheel.z + reach(frontWheel)];
  const xIn = ROCKER_INNER_X - 0.01;
  const rightSide = [[x1, z0], [x1, rN[0]], [UNDERTRAY_NOTCH_X, rN[0]], [UNDERTRAY_NOTCH_X, rN[1]], [xIn, rN[1]], [xIn, fN[0]], [UNDERTRAY_NOTCH_X, fN[0]], [UNDERTRAY_NOTCH_X, fN[1]], [x1, fN[1]], [x1, z1]];
  const outline = [...rightSide, ...rightSide.map(([x, z]) => [-x, z]).reverse()];
  const t = triangulate(outline);
  const tris = [];
  for (const [a, b, c] of t.tris) {
    const [p, q, r] = [a, b, c].map((k) => t.pts[k]);
    pushTri(tris, [p[0], y1, p[1]], [q[0], y1, q[1]], [r[0], y1, r[1]], [0, 1, 0]);
    pushTri(tris, [p[0], y0, p[1]], [q[0], y0, q[1]], [r[0], y0, r[1]], [0, -1, 0]);
  }
  const cw = outline.reduce((s, p, j) => { const q = outline[(j + 1) % outline.length]; return s + (q[0] - p[0]) * (q[1] + p[1]); }, 0) > 0;
  for (let k = 0; k < outline.length; k++) {
    const a = outline[k], b = outline[(k + 1) % outline.length];
    const out = [b[1] - a[1], 0, -(b[0] - a[0])].map((v) => (cw ? -v : v));
    pushTri(tris, [a[0], y0, a[1]], [b[0], y0, b[1]], [b[0], y1, b[1]], out);
    pushTri(tris, [a[0], y0, a[1]], [b[0], y1, b[1]], [a[0], y1, a[1]], out);
  }
  prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(tris.flat())).setBuffer(buffer)).setIndices(null);
  for (const acc of [up, ui]) if (acc && acc.listParents().every((p) => p === root)) acc.dispose();
  report.undertray = { notches: [rN, fN].map(([a, b]) => [+a.toFixed(3), +b.toFixed(3)]), betweenWheelsHalfWidth: xIn };
}

// Splitter and diffuser: moved straight down with the bumpers (same shape), so they meet the bumpers as before.
// New position data is written for each, so no other part that might share the old data is moved.
for (const [name, drop] of [['Front_Splitter', FRONT_BUMPER_DROP], ['Rear_Diffuser', REAR_BUMPER_DROP]]) {
  const prim = node(name).getMesh().listPrimitives()[0];
  const old = prim.getAttribute('POSITION'), arr = Float32Array.from(old.getArray());
  for (let k = 1; k < arr.length; k += 3) arr[k] -= drop;
  prim.setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(arr).setBuffer(buffer));
  if (old.listParents().every((p) => p === root)) old.dispose();
  report[name] = { movedDown: drop };
}
// Revision 4: the splitter's two front outer corners rounded (seen from above). The plate keeps its top and bottom
// heights, its full width and its depth; only the two corners are cut back to a circular curve. The top and bottom
// stay flat; the edge all round is upright, smoothly shaded along the curves and sharp at the two square rear
// corners.
{
  const prim = node('Front_Splitter').getMesh().listPrimitives()[0];
  const oldP = prim.getAttribute('POSITION'), oldI = prim.getIndices();
  const [x0, y0, z0] = oldP.getMin([]), [x1, y1, z1] = oldP.getMax([]);
  const R = SPLITTER_CORNER_RADIUS, N = SPLITTER_CORNER_SEGMENTS;
  // Plan outline, anticlockwise seen from above (x right, z forward). Points on the curves carry their outward
  // direction, used for smooth shading.
  const outline = [{ p: [x0, z0] }, { p: [x1, z0] }];
  for (const [cx, a0] of [[x1 - R, 0], [x0 + R, Math.PI / 2]]) {
    for (let k = 0; k <= N; k++) {
      const a = a0 + ((Math.PI / 2) * k) / N, d = [Math.cos(a), Math.sin(a)];
      outline.push({ p: [cx + R * d[0], z1 - R + R * d[1]], d });
    }
  }
  const positions = [], normals = [], indices = [];
  const vert = (p, n) => { positions.push(...p); normals.push(...n); return positions.length / 3 - 1; };
  const tri = (a, b, c, n) => {
    const P3 = (i) => positions.slice(3 * i, 3 * i + 3);
    const g = cross(sub(P3(b), P3(a)), sub(P3(c), P3(a)));
    if (dot(g, n) >= 0) indices.push(a, b, c); else indices.push(a, c, b);
  };
  const centre = [(x0 + x1) / 2, (z0 + z1) / 2];
  for (const [y, ny] of [[y1, 1], [y0, -1]]) { // flat top and bottom
    const c = vert([centre[0], y, centre[1]], [0, ny, 0]);
    const ring = outline.map(({ p }) => vert([p[0], y, p[1]], [0, ny, 0]));
    for (let k = 0; k < ring.length; k++) tri(c, ring[k], ring[(k + 1) % ring.length], [0, ny, 0]);
  }
  for (let k = 0; k < outline.length; k++) { // upright edge
    const A = outline[k], B = outline[(k + 1) % outline.length];
    let nA, nB;
    if (A.d && B.d) { nA = [A.d[0], 0, A.d[1]]; nB = [B.d[0], 0, B.d[1]]; }
    else {
      const e = [B.p[0] - A.p[0], B.p[1] - A.p[1]], l = Math.hypot(...e);
      nA = nB = [e[1] / l, 0, -e[0] / l]; // outward for an anticlockwise outline
    }
    const a0 = vert([A.p[0], y0, A.p[1]], nA), a1 = vert([A.p[0], y1, A.p[1]], nA);
    const b0 = vert([B.p[0], y0, B.p[1]], nB), b1 = vert([B.p[0], y1, B.p[1]], nB);
    const n = [nA[0] + nB[0], 0, nA[2] + nB[2]];
    tri(a0, b0, b1, n);
    tri(a0, b1, a1, n);
  }
  prim
    .setAttribute('POSITION', doc.createAccessor().setType('VEC3').setArray(new Float32Array(positions)).setBuffer(buffer))
    .setAttribute('NORMAL', doc.createAccessor().setType('VEC3').setArray(new Float32Array(normals)).setBuffer(buffer))
    .setIndices(doc.createAccessor().setType('SCALAR').setArray(new Uint16Array(indices)).setBuffer(buffer));
  for (const acc of [oldP, oldI]) if (acc && acc.listParents().every((q) => q === root)) acc.dispose();
  report.splitterCorners = { radius: R, width: +(x1 - x0).toFixed(4), depth: +(z1 - z0).toFixed(4), top: +y1.toFixed(4), bottom: +y0.toFixed(4) };
}
report.bumpers = { frontDrop: FRONT_BUMPER_DROP, rearDrop: REAR_BUMPER_DROP, frontLowerEdge: +lineAt('bottom', zMax).y.toFixed(4), rearLowerEdge: +lineAt('bottom', zMin).y.toFixed(4) };

root.getAsset().generator = 'Racing Game: build_fenders_rev4.mjs (V2 GT + diamond grille + fenders and quarter panels, revision 4)';
await io.write(OUTPUT, doc);
console.log(JSON.stringify({ ...report, bodyTrianglesRemoved: removed, smoothPanelTriangles: smoothTris, flatNewTriangles: (bodyFlat.length + rockerFlat.length) / 3 }));
