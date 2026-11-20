// Builds a version-4 car from a design and exports it as a game-ready GLB.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { clamp, mesh, mix, sdEllipsoid, sdRoundTrap, smax, smin } from './geo';
import type { Design, Tag } from './designs4';
import { materials, wheel, WHEEL_R } from './parts';

export const WHEELS = { x: 0.84, front: 1.32, rear: -1.28 };

function bodySDF(d: Design, o: { cuts: boolean; pockets: boolean; flare?: boolean } = { cuts: true, pockets: true }) {
  const core = coreSDF(d);
  return (X: number, y: number, z: number) => {
    const x = Math.abs(X);
    let s = core(x, y, z);
    // v8: the lower bumper flares smoothly outwards down onto the splitter, so bumper and splitter read as one shape.
    if (d.flare && o.flare !== false && z > d.flare.zStart - 0.3 && y < d.flare.yBottom + d.flare.height + 0.05) {
      const F = d.flare, t = clamp((y - F.yBottom) / F.height, 0, 1);
      const gz = clamp((z - (F.zStart - 0.25)) / 0.25, 0, 1), ease = gz * gz * (3 - 2 * gz); // emerges gradually along the side
      const out = core(x, F.ySample, z) - F.grow * (1 - t) * (1 - t) + (1 - ease) * 0.08;
      const slab = Math.max(out, Math.abs(y - (F.yBottom + F.height / 2)) - F.height / 2);
      s = smin(s, slab, F.k);
    }
    // v8r1: soft scoops first (the bumper surface dips gently towards the opening), then the openings themselves.
    if (o.cuts) for (const c of d.cuts) if (c.scoop) s = smax(s, -Math.max(c.sd(x, y, z) - c.scoop.grow, -(s + c.scoop.depth)), c.scoop.k);
    if (o.cuts) for (const c of d.cuts) s = smax(s, -c.sd(x, y, z), c.k ?? 0.015);
    return s;
  };
}

/** The sculpted body before openings: shell, cabin, fenders, unions and wheel arches. */
function coreSDF(d: Design) {
  return (x: number, y: number, z: number) => {
    const zc = clamp(z, d.z0, d.z1);
    const top = d.top.at(zc), bot = d.bot.at(zc), hw = d.hw.at(zc);
    const tumble = typeof d.tumble === 'number' ? d.tumble : d.tumble.at(zc); // v10: may vary along the car
    let s = sdRoundTrap(x, y - (top + bot) / 2, hw, hw * tumble, (top - bot) / 2, d.rad.at(zc));
    s = smax(s, Math.max(d.z0 - z, z - d.z1), d.endK);
    for (const w of d.wings === undefined ? [] : Array.isArray(d.wings) ? d.wings : [d.wings]) {
      // v9b: raise the body's own surface over the front wheels (smooth everywhere, so no crease).
      // v9c: smootherstep (curvature-continuous), so glossy reflections flow across the wings without faint lines.
      const ss = (a: number, b: number, t: number) => { const u = clamp((t - a) / (b - a), 0, 1); return u * u * u * (u * (6 * u - 15) + 10); };
      const gx = ss(w.x0, w.x1, x) * (1 - ss(w.x2, w.x3, x));
      let gz = 1 - ss(w.zr0, w.zr1, Math.abs(z - w.zc));
      if (w.slope) gz *= 1 - ss(w.slope[0], w.slope[1], z); // v10b: smooth, gradual fall towards the front (no kink, no crease)
      s -= w.h * gx * gz * ss(w.y0, w.y1, y);
    }
    const g = d.g;
    const gz = clamp(z, g.z0, g.z1);
    const belt = g.belt.at(gz) - 0.08, roof = g.roof.at(gz);
    if (roof > belt + 0.02) {
      let c = sdRoundTrap(x, y - (roof + belt) / 2, g.wB.at(gz), g.wT.at(gz), (roof - belt) / 2, g.r);
      c = smax(c, Math.max(g.z0 - z, z - g.z1), 0.04);
      s = smin(s, c, 0.05);
    }
    for (const [fx, fy, fz, rx, ry, rz, k] of d.fenders) s = smin(s, sdEllipsoid(x - fx, y - fy, z - fz, rx, ry, rz), k);
    for (const u of d.unions ?? []) s = smin(s, u.sd(x, y, z), u.k);
    // Body-shaped wheel arches: carved out of the bodywork where the wheels are.
    for (const wz of [WHEELS.front, WHEELS.rear]) {
      const cyl = Math.hypot(y - WHEEL_R, z - wz) - d.archR;
      s = smax(s, -smax(cyl, 0.6 - x, 0.02), 0.045); // v9c: slightly rounder arch lip (was 0.03)
    }
    return s;
  };
}

function classifier(d: Design, f0: (x: number, y: number, z: number) => number) {
  const g = d.g;
  const glass = (x: number, y: number, z: number, n: THREE.Vector3, m: number) => {
    if (z < g.z0 || z > g.z1) return false;
    const belt = g.belt.at(z), roof = g.roof.at(z);
    if (y < belt + 0.02 + m) return false;
    const f = clamp((y - belt) / Math.max(roof - belt, 0.01), 0, 1);
    const halfW = mix(g.wB.at(z), g.wT.at(z), f);
    if (Math.abs(n.x) > 0.4 && y < roof - 0.075 - m && z > d.sideGlass[0] + m && z < d.sideGlass[1] - m) return true;
    if (n.z > 0.25 && n.y > 0.1 && x < halfW - 0.09 - m && y < roof - 0.025 - m) return true;
    if (d.rearGlass && n.z < -0.25 && n.y > 0.1 && x < halfW - 0.12 - m && y > belt + 0.05 + m && y < roof - 0.03 - m) return true;
    return false;
  };
  return (c: THREE.Vector3, n: THREE.Vector3): Tag => {
    const x = Math.abs(c.x);
    for (const wz of [WHEELS.front, WHEELS.rear]) {
      const r = Math.hypot(c.y - WHEEL_R, c.z - wz) - d.archR;
      // v9: only inside the arch opening itself (the body is only carved there, x > 0.6), not on bodywork above it.
      // v9b: the arch's inner lip plus a thin, even edge band (clean and unbroken).
      // Defined purely by distance from the arch circle, so its outer edge is an exact, smooth circle.
      if (r > -0.025 && r < -0.002 && x > 0.6) return 'mesh'; // v9c: trim stays inside the arch (no thin outer ring)
    }
    if (d.lamps && d.lamps.foot(x, c.y, c.z) < 0) return 'housing'; // headlight unit floor (under the lens)
    for (const cut of d.cuts) {
      const v = cut.sd(x, c.y, c.z);
      if (v > -0.004 && v < 0.012) return cut.wall && n.z < 0.6 ? cut.wall : cut.tag; // v8r1: matte dark side walls
    }
    for (const zone of d.zones) if (zone.test(x, c.y, c.z, n)) return zone.tag;
    if (c.z < d.z0 + 0.32 && n.z < -0.3 && c.y < 0.42) return 'carbon';
    if (c.z > d.z1 - 0.35 && n.z > 0.25 && c.y < 0.215) return 'carbon';
    if (glass(x, c.y, c.z, n, 0)) return 'glass';
    if (glass(x, c.y, c.z, n, -0.028)) return 'trim';
    return 'paint';
  };
}

const PART_NAMES: Record<Tag, string> = {
  housing: 'Headlight_Housing', liner: 'Intake_Walls', paint: 'Body_Paint', glass: 'Body_Glass', trim: 'Window_Trim', carbon: 'Body_Carbon', mesh: 'Intakes_And_Vents',
  lamp: 'Headlight_Housings', led: 'Headlight_LEDs', tail: 'Taillight_Lenses', tailLed: 'Taillight_LEDs',
};

export async function buildCar(d: Design, opts: { resolution: number; bodyTriangles: number; error?: number } = { resolution: 0.015, bodyTriangles: 32000 }) {
  await MeshoptSimplifier.ready;
  const mats = materials(d.style);
  // Clear names for every material (they show up in the GLB).
  const names: Record<string, string> = {
    paint: 'Recolourable_Paint', accent: 'Accent', glass: 'Glass', trim: 'Trim_Black', carbon: 'Carbon_Fibre', mesh: 'Intake_Mesh',
    lamp: 'Headlight_Lens', housing: 'Headlight_Housing', led: 'LED_White', tail: 'Taillight_Lens', tailLed: 'LED_Red', chrome: 'Chrome', titanium: 'Exhaust_Titanium',
    liner: 'Arch_Liner', rim: 'Alloy_Rim', rimLip: 'Rim_Lip_Polished', tyre: 'Tyre_Rubber', disc: 'Brake_Disc_Metal', caliper: 'Brake_Caliper',
  };
  for (const [k, n] of Object.entries(names)) ((mats as unknown as Record<string, THREE.Material>)[k]).name = n;
  mats.liner.side = THREE.DoubleSide;

  const root = new THREE.Group();
  root.name = d.id;
  const stats: Record<string, number> = {};

  // ---- Sculpted body: fine mesh, then simplified to the game budget (keeps vertices on the true surface and their smooth normals).
  const f = bodySDF(d);
  const m = mesh(f, [-1.12, 0.04, d.z0 - 0.12], [1.12, 1.42, d.z1 + 0.12], opts.resolution);
  stats.bodyTrianglesBeforeSimplify = m.idx.length / 3;
  // 1) Decide the material of every fine-mesh corner, then cut triangles that straddle two materials exactly
  //    where the border runs (found by bisection along each edge). The old version gave each whole triangle one
  //    material, which made every border a saw-tooth staircase; this keeps borders on the designed smooth line.
  const f0 = bodySDF(d, { cuts: true, pockets: false });
  const classify = classifier(d, f0);
  const P: number[] = Array.from(m.pos), N: number[] = Array.from(m.nrm);
  const c = new THREE.Vector3(), n = new THREE.Vector3();
  const tagAt = (px: number, py: number, pz: number, nx: number, ny: number, nz: number) => classify(c.set(px, py, pz), n.set(nx, ny, nz).normalize());
  const vtag: Tag[] = [];
  for (let v = 0; v < P.length / 3; v++) vtag[v] = tagAt(P[v * 3], P[v * 3 + 1], P[v * 3 + 2], N[v * 3], N[v * 3 + 1], N[v * 3 + 2]);
  const addVertex = (a: number, b: number, t: number) => {
    const r = P.length / 3;
    for (let k = 0; k < 3; k++) P.push(P[a * 3 + k] + (P[b * 3 + k] - P[a * 3 + k]) * t);
    const nx = N[a * 3] + (N[b * 3] - N[a * 3]) * t, ny = N[a * 3 + 1] + (N[b * 3 + 1] - N[a * 3 + 1]) * t, nz = N[a * 3 + 2] + (N[b * 3 + 2] - N[a * 3 + 2]) * t;
    const l = Math.hypot(nx, ny, nz) || 1;
    N.push(nx / l, ny / l, nz / l);
    return r;
  };
  const crossings = new Map<string, number>();
  const cross = (a: number, b: number) => {
    const lo = Math.min(a, b), hi = Math.max(a, b), key = lo + '_' + hi;
    let r = crossings.get(key);
    if (r !== undefined) return r;
    let t0 = 0, t1 = 1;
    for (let it = 0; it < 14; it++) {
      const t = (t0 + t1) / 2;
      const L = (i: number) => P[lo * 3 + i] + (P[hi * 3 + i] - P[lo * 3 + i]) * t;
      const M = (i: number) => N[lo * 3 + i] + (N[hi * 3 + i] - N[lo * 3 + i]) * t;
      if (tagAt(L(0), L(1), L(2), M(0), M(1), M(2)) === vtag[lo]) t0 = t; else t1 = t;
    }
    r = addVertex(lo, hi, (t0 + t1) / 2);
    crossings.set(key, r);
    return r;
  };
  const buckets = new Map<Tag, number[]>();
  const put = (tag: Tag, a: number, b: number, cc: number) => { if (!buckets.has(tag)) buckets.set(tag, []); buckets.get(tag)!.push(a, b, cc); };
  for (let t = 0; t < m.idx.length; t += 3) {
    const a = m.idx[t], b = m.idx[t + 1], q = m.idx[t + 2];
    const A = vtag[a], B = vtag[b], C = vtag[q];
    if (A === B && B === C) { put(A, a, b, q); continue; }
    if (A !== B && B !== C && A !== C) {
      const gx = addVertex(a, b, 0.5); // temporary midpoint, then moved to the centroid
      for (let k = 0; k < 3; k++) P[gx * 3 + k] = (P[a * 3 + k] + P[b * 3 + k] + P[q * 3 + k]) / 3;
      const nx = N[a * 3] + N[b * 3] + N[q * 3], ny = N[a * 3 + 1] + N[b * 3 + 1] + N[q * 3 + 1], nz = N[a * 3 + 2] + N[b * 3 + 2] + N[q * 3 + 2], l = Math.hypot(nx, ny, nz) || 1;
      N[gx * 3] = nx / l; N[gx * 3 + 1] = ny / l; N[gx * 3 + 2] = nz / l;
      const ab = cross(a, b), bc = cross(b, q), ca = cross(q, a);
      put(A, a, ab, gx); put(A, a, gx, ca);
      put(B, b, bc, gx); put(B, b, gx, ab);
      put(C, q, ca, gx); put(C, q, gx, bc);
      continue;
    }
    // Two corners share a material: rotate so the odd one comes first (keeps the winding).
    const [o, p1, p2] = A === B ? [q, a, b] : A === C ? [b, q, a] : [a, b, q];
    const x = cross(o, p1), y = cross(o, p2);
    put(vtag[o], o, x, y);
    put(vtag[p1], x, p1, p2);
    put(vtag[p1], x, p2, y);
  }
  // v9b: tidy specks. Any patch of one material smaller than MIN_AREA (e.g. a fleck of grille on the wheel-arch lip)
  // takes the material that surrounds it, so edges stay clean. Patches are joined through shared corners.
  {
    const MIN_AREA = 0.0006; // m², about 2.5 cm x 2.5 cm
    const nv = P.length / 3;
    const tagsAt = new Map<number, Map<Tag, number>>();
    for (const [tag, list] of buckets) for (const v of list) { let m = tagsAt.get(v); if (!m) tagsAt.set(v, (m = new Map())); m.set(tag, (m.get(tag) ?? 0) + 1); }
    const area = (l: number[], t: number) => {
      const a = l[t] * 3, b = l[t + 1] * 3, c = l[t + 2] * 3;
      const ux = P[b] - P[a], uy = P[b + 1] - P[a + 1], uz = P[b + 2] - P[a + 2], wx = P[c] - P[a], wy = P[c + 1] - P[a + 1], wz = P[c + 2] - P[a + 2];
      return Math.hypot(uy * wz - uz * wy, uz * wx - ux * wz, ux * wy - uy * wx) / 2;
    };
    let moved = 0;
    for (const [tag, list] of [...buckets]) {
      const parent = new Int32Array(nv).fill(-1);
      const find = (v: number): number => { while (parent[v] >= 0 && parent[v] !== v) v = parent[v] = parent[parent[v]] >= 0 ? parent[parent[v]] : parent[v]; return v; };
      for (const v of list) if (parent[v] < 0) parent[v] = v;
      for (let t = 0; t < list.length; t += 3) { const r = find(list[t]); parent[find(list[t + 1])] = r; parent[find(list[t + 2])] = r; }
      const compArea = new Map<number, number>();
      for (let t = 0; t < list.length; t += 3) { const r = find(list[t]); compArea.set(r, (compArea.get(r) ?? 0) + area(list, t)); }
      const small = new Set([...compArea].filter(([, a]) => a < MIN_AREA).map(([r]) => r));
      if (!small.size) continue;
      const keep: number[] = [];
      const byComp = new Map<number, number[]>();
      for (let t = 0; t < list.length; t += 3) {
        const r = find(list[t]);
        if (small.has(r)) { let l = byComp.get(r); if (!l) byComp.set(r, (l = [])); l.push(list[t], list[t + 1], list[t + 2]); } else keep.push(list[t], list[t + 1], list[t + 2]);
      }
      let movedAll = true;
      for (const tris of byComp.values()) {
        const votes = new Map<Tag, number>();
        for (const v of tris) for (const [ot, n] of tagsAt.get(v) ?? []) if (ot !== tag) votes.set(ot, (votes.get(ot) ?? 0) + n);
        const best = [...votes].sort((a, b) => b[1] - a[1])[0]?.[0];
        if (!best) { keep.push(...tris); movedAll = false; continue; }
        buckets.get(best)!.push(...tris);
        moved += tris.length / 3;
      }
      buckets.set(tag, keep);
      void movedAll;
    }
    stats.speckTrianglesRetagged = moved;
  }
  const fine = { pos: new Float32Array(P), nrm: new Float32Array(N) };
  // 2) ...then simplify each material area on its own, with its border locked so edges stay clean.
  let total = 0; for (const b of buckets.values()) total += b.length / 3;
  let maxErr = 0;
  const simplified = new Map<Tag, { pos: Float32Array; nrm: Float32Array; idx: Uint32Array }>();
  for (const [tag, idx] of buckets) {
    const remap = new Map<number, number>();
    const pos: number[] = [], nrm: number[] = [];
    const local = new Uint32Array(idx.length);
    idx.forEach((v, i) => {
      let r = remap.get(v);
      if (r === undefined) {
        r = pos.length / 3;
        remap.set(v, r);
        pos.push(fine.pos[v * 3], fine.pos[v * 3 + 1], fine.pos[v * 3 + 2]);
        nrm.push(fine.nrm[v * 3], fine.nrm[v * 3 + 1], fine.nrm[v * 3 + 2]);
      }
      local[i] = r;
    });
    const p32 = new Float32Array(pos);
    const target = Math.max(60, Math.round((opts.bodyTriangles * idx.length) / 3 / total)) * 3;
    const [out, e] = MeshoptSimplifier.simplify(local, p32, 3, Math.min(target, local.length), opts.error ?? 0.002, ['LockBorder']);
    maxErr = Math.max(maxErr, e);
    simplified.set(tag, { pos: p32, nrm: new Float32Array(nrm), idx: out });
  }
  stats.simplifyErrorMetres = +(maxErr * 4.8).toFixed(4);
  const body = new THREE.Group();
  body.name = 'Body';
  let bodyTris = 0;
  for (const [tag, part0] of simplified) {
    // Compact the vertices still used after simplifying.
    const remap = new Map<number, number>();
    const p: number[] = [], nn: number[] = [], uv: number[] = [], ii: number[] = [];
    for (const v of part0.idx) {
      let r = remap.get(v);
      if (r === undefined) {
        r = p.length / 3;
        remap.set(v, r);
        const px = part0.pos[v * 3], py = part0.pos[v * 3 + 1], pz = part0.pos[v * 3 + 2];
        p.push(px, py, pz);
        nn.push(part0.nrm[v * 3], part0.nrm[v * 3 + 1], part0.nrm[v * 3 + 2]);
        // UVs: side projection (length, height) across the whole car; grilles: projected along their facing axis.
        if (tag === 'mesh') {
          const ax = Math.abs(part0.nrm[v * 3]), ay = Math.abs(part0.nrm[v * 3 + 1]), az = Math.abs(part0.nrm[v * 3 + 2]);
          if (az >= ax && az >= ay) uv.push(px * 12, py * 12); else if (ax >= ay) uv.push(pz * 12, py * 12); else uv.push(px * 12, pz * 12);
        } else uv.push((pz - d.z0) / (d.z1 - d.z0), py / 1.4);
      }
      ii.push(r);
    }
    bodyTris += ii.length / 3;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.Float32BufferAttribute(p, 3));
    geo.setAttribute('normal', new THREE.Float32BufferAttribute(nn, 3));
    geo.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    geo.setIndex(ii);
    const mat = (mats as unknown as Record<string, THREE.Material>)[tag] ?? mats.paint;
    const part = new THREE.Mesh(geo, mat);
    part.name = PART_NAMES[tag];
    body.add(part);
  }
  stats.bodyTriangles = bodyTris;
  root.add(body);
  if (d.lamps) root.add(buildHeadlights(d, f, f0, mats));
  if (d.splitter) root.add(buildSplitter(d, mats));
  if (d.canards) root.add(buildCanards(d, mats));

  // ---- Dark wheel-arch liners (inside the bodywork only).
  const liners: THREE.BufferGeometry[] = [];
  for (const wz of [WHEELS.front, WHEELS.rear])
    for (const s of [-1, 1])
      liners.push(new THREE.CylinderGeometry(d.archR + 0.004, d.archR + 0.004, 0.2, 32, 1, true, -0.35, Math.PI + 0.7).rotateZ(Math.PI / 2).translate(s * 0.7, WHEEL_R, wz));
  const liner = new THREE.Mesh(mergeGeometries(liners), mats.liner);
  liner.name = 'Wheel_Arch_Liners';
  root.add(liner);

  // ---- Wheels: Wheel_XX (steering pivot at the wheel centre) > Wheel_XX_Spin (rolls) > parts; Caliper_XX steers but does not spin.
  // +X is the car's LEFT side, so FL / RL are at x = +0.84.
  for (const [corner, x, z] of [['FL', WHEELS.x, WHEELS.front], ['FR', -WHEELS.x, WHEELS.front], ['RL', WHEELS.x, WHEELS.rear], ['RR', -WHEELS.x, WHEELS.rear]] as const) {
    const pivot = new THREE.Group();
    pivot.name = 'Wheel_' + corner;
    pivot.position.set(x, WHEEL_R, z);
    const spin = new THREE.Group();
    spin.name = 'Wheel_' + corner + '_Spin';
    pivot.add(spin);
    const w = wheel(d.rimStyle, mats, d.centreLock);
    // Right-hand wheels are mirrored so their faces point outwards; bake that into the geometry so the nodes stay unrotated.
    const mirrorM = new THREE.Matrix4().makeRotationY(x < 0 ? Math.PI : 0);
    const byMat = new Map<THREE.Material, THREE.BufferGeometry[]>();
    w.updateMatrixWorld(true);
    w.traverse((o) => {
      const me = o as THREE.Mesh;
      if (!me.isMesh) return;
      const geo = me.geometry.clone().applyMatrix4(me.matrixWorld).applyMatrix4(mirrorM);
      if (me.userData.caliper) {
        // Callipers are mirrored (not rotated) on the right, so all four sit at the same position on their disc.
        let cg = me.geometry.clone().applyMatrix4(me.matrixWorld);
        if (x < 0) {
          cg = (cg.index ? cg.toNonIndexed() : cg).applyMatrix4(new THREE.Matrix4().makeScale(-1, 1, 1));
          const pa = cg.getAttribute('position'), na = cg.getAttribute('normal'), ua = cg.getAttribute('uv');
          for (let t = 0; t < pa.count; t += 3) // reverse winding so faces stay outward after mirroring
            for (const a of [pa, na, ua]) {
              if (!a) continue;
              for (let k = 0; k < a.itemSize; k++) {
                const tmp = a.getComponent(t + 1, k);
                a.setComponent(t + 1, k, a.getComponent(t + 2, k));
                a.setComponent(t + 2, k, tmp);
              }
            }
        }
        const cal = new THREE.Mesh(cg, me.material as THREE.Material);
        cal.name = 'Caliper_' + corner;
        pivot.add(cal);
        return;
      }
      const mat = me.material as THREE.Material;
      if (!byMat.has(mat)) byMat.set(mat, []);
      byMat.get(mat)!.push(geo.index ? geo.toNonIndexed() : geo);
    });
    const partName: Record<string, string> = { Tyre_Rubber: 'Tyre', Alloy_Rim: 'Rim', Rim_Lip_Polished: 'Rim_Lip', Arch_Liner: 'Rim_Inner', Brake_Disc_Metal: 'BrakeDisc', Trim_Black: 'Hub_Cap' };
    for (const [mat, geos] of byMat) {
      for (const g of geos) for (const k of Object.keys(g.attributes)) if (!['position', 'normal', 'uv'].includes(k)) g.deleteAttribute(k);
      const merged = mergeVertices(mergeGeometries(geos));
      const part = new THREE.Mesh(merged, mat);
      part.name = 'Wheel_' + corner + '_' + (partName[mat.name] ?? mat.name);
      spin.add(part);
    }
    root.add(pivot);
  }

  // ---- Aero, mirrors, exhausts, splitter, diffuser.
  const extras = new THREE.Group();
  extras.name = 'Details';
  d.parts(extras, mats);
  root.add(extras);

  root.traverse((o) => {
    const me = o as THREE.Mesh;
    if (me.isMesh) {
      me.castShadow = true;
      me.receiveShadow = true;
    }
  });
  return { root, stats };
}

export async function exportGLB(root: THREE.Object3D) {
  const result = (await new GLTFExporter().parseAsync(root, { binary: true, onlyVisible: true })) as ArrayBuffer;
  return result;
}

// ------------------------------------------------------------------ v6 front end

/** Smooth glass needs few triangles: simplify the inside, keep the exact outline. */
function simplifyKeepEdge(g: THREE.BufferGeometry, target: number) {
  const pos = g.getAttribute('position').array as Float32Array;
  const idx = new Uint32Array(g.getIndex()!.array);
  const [out] = MeshoptSimplifier.simplify(idx, pos, 3, Math.min(idx.length, target * 3), 0.0025, []);
  g.setIndex(Array.from(out));
  return g;
}

const LENS_LIFT = 0.010; // the clear lens sits 10 mm proud of the body, following its shape

/** A thin wall along the open edge of a surface, from the edge down (against its normals) by `drop`. */
function bezelFor(geo: THREE.BufferGeometry, drop: number) {
  const pos = geo.getAttribute('position'), nrm = geo.getAttribute('normal'), idx = geo.getIndex()!;
  const count = new Map<string, number>(), dir = new Map<string, [number, number]>();
  for (let t = 0; t < idx.count; t += 3) for (let k = 0; k < 3; k++) {
    const a = idx.getX(t + k), b = idx.getX(t + ((k + 1) % 3)), key = Math.min(a, b) + '_' + Math.max(a, b);
    count.set(key, (count.get(key) ?? 0) + 1); dir.set(key, [a, b]);
  }
  const P: number[] = [];
  const v = (i: number, down: number) => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i)).addScaledVector(new THREE.Vector3(nrm.getX(i), nrm.getY(i), nrm.getZ(i)), -down);
  for (const [key, c] of count) {
    if (c !== 1) continue;
    const [a, b] = dir.get(key)!; // boundary edge, in the lens triangle's winding: the wall faces outwards as a -> b reversed
    const A = v(a, 0), B = v(b, 0), A2 = v(a, drop), B2 = v(b, drop);
    for (const q of [B, A, A2, B, A2, B2, A, B, A2, A2, B, B2]) P.push(q.x, q.y, q.z); // both sides
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((P.length / 3) * 2).fill(0), 2));
  g.computeVertexNormals();
  return g;
}

/** First body surface hit travelling backwards (−Z) at (x, y), with its outward normal. */
function surfaceAlongZ(f: (x: number, y: number, z: number) => number, x: number, y: number) {
  let z = 3.0, prev = f(x, y, z);
  for (; z > 0.6; z -= 0.003) { const v = f(x, y, z); if (v < 0 && prev >= 0) break; prev = v; }
  if (z <= 0.6) return null;
  let a = z, b = z + 0.003;
  for (let i = 0; i < 24; i++) { const m = (a + b) / 2; if (f(x, y, m) < 0) a = m; else b = m; }
  const p = new THREE.Vector3(x, y, (a + b) / 2), e = 0.0015;
  const n = new THREE.Vector3(f(x + e, y, p.z) - f(x - e, y, p.z), f(x, y + e, p.z) - f(x, y - e, p.z), f(x, y, p.z + e) - f(x, y, p.z - e)).normalize();
  return { p, n };
}

/** Keeps the part of a surface where inside(x, y, z) < 0, cutting triangles exactly along the border. */
function clipSurface(m: { pos: ArrayLike<number>; nrm: ArrayLike<number>; idx: ArrayLike<number> }, inside: (x: number, y: number, z: number) => number, lift: number) {
  const P: number[] = [], N: number[] = [];
  const val = (i: number) => inside(m.pos[i * 3], m.pos[i * 3 + 1], m.pos[i * 3 + 2]);
  const vtx = (i: number, j: number, t: number) => {
    const p = [0, 1, 2].map((k) => m.pos[i * 3 + k] + (m.pos[j * 3 + k] - m.pos[i * 3 + k]) * t);
    const n = new THREE.Vector3(...[0, 1, 2].map((k) => m.nrm[i * 3 + k] + (m.nrm[j * 3 + k] - m.nrm[i * 3 + k]) * t) as [number, number, number]).normalize();
    return { p: new THREE.Vector3(p[0], p[1], p[2]).addScaledVector(n, lift), n };
  };
  for (let t = 0; t < m.idx.length; t += 3) {
    const ids = [m.idx[t], m.idx[t + 1], m.idx[t + 2]], vs = ids.map(val);
    const poly: { p: THREE.Vector3; n: THREE.Vector3 }[] = [];
    for (let k = 0; k < 3; k++) {
      const i = ids[k], j = ids[(k + 1) % 3], a = vs[k], b = vs[(k + 1) % 3];
      if (a < 0) poly.push(vtx(i, i, 0));
      if ((a < 0) !== (b < 0)) poly.push(vtx(i, j, a / (a - b)));
    }
    for (let k = 1; k + 1 < poly.length; k++) for (const q of [poly[0], poly[k], poly[k + 1]]) { P.push(q.p.x, q.p.y, q.p.z); N.push(q.n.x, q.n.y, q.n.z); }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(new Array((P.length / 3) * 2).fill(0), 2));
  return mergeVertices(g, 1e-5);
}

/**
 * Real headlight units in the recess cut by bodySDF: an LED daytime-running-light strip along the top of the
 * recess (turning down at the outer end), LED projector modules in polished chrome cups, and a clear lens that
 * sits flush with the original body surface.
 */
function buildHeadlights(d: Design, f: (x: number, y: number, z: number) => number, f0: (x: number, y: number, z: number) => number, mats: ReturnType<typeof materials>) {
  const L = d.lamps!;
  const g = new THREE.Group();
  g.name = 'Headlights';
  const up = new THREE.Vector3(0, 1, 0), fwd = new THREE.Vector3(0, 0, 1);
  for (const side of [1, -1]) {
    const tag = side > 0 ? 'L' : 'R';
    // Where the recess is, as seen from the front: per x column, the top and bottom of the opening (5 mm inset).
    const cols: { x: number; top: number; bot: number }[] = [];
    for (let x = L.box[0][0]; x <= L.box[1][0]; x += 0.006) {
      let top = -1, bot = 9;
      for (let y = L.box[0][1]; y <= L.box[1][1]; y += 0.002) {
        const h = surfaceAlongZ(f0, x, y);
        if (h && L.foot(x, y, h.p.z) < -0.005) { top = Math.max(top, y); bot = Math.min(bot, y); }
      }
      if (top - bot > 0.024) cols.push({ x, top, bot });
    }
    if (cols.length < 4) throw new Error('headlight recess not found for ' + d.id);
    const onFloor = (x: number, y: number, lift: number) => {
      const h = surfaceAlongZ(f0, side * x, y)!;
      return { p: h.p.clone().addScaledVector(h.n, lift), n: h.n };
    };
    // LED daytime-running-light strip.
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < cols.length; i += 2) pts.push(onFloor(cols[i].x, cols[i].top - 0.009, 0.0055).p);
    const outer = cols[cols.length - 1];
    if (L.hook) for (const t of [0.35, 0.7, 1]) pts.push(onFloor(outer.x - 0.004, outer.top - 0.009 - (outer.top - outer.bot) * 0.5 * t, 0.0055).p);
    const drl = new THREE.Mesh(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, false, 'centripetal'), 56, 0.0055, 6, false), mats.led);
    drl.name = 'Headlight_DRL_' + tag;
    g.add(drl);
    // LED projector modules.
    const chrome: THREE.BufferGeometry[] = [], lit: THREE.BufferGeometry[] = [];
    const inner = cols.slice(Math.floor(cols.length * 0.12), Math.floor(cols.length * 0.8));
    for (let k = 0; k < L.projectors; k++) {
      const c = inner[Math.floor(((k + 0.5) / L.projectors) * inner.length)];
      const r = Math.min(0.026, Math.max(0.012, (c.top - c.bot - 0.03) * 0.42));
      const { p, n } = onFloor(c.x, (c.top - 0.02 + c.bot) / 2, 0);
      const qUp = new THREE.Quaternion().setFromUnitVectors(up, n), qF = new THREE.Quaternion().setFromUnitVectors(fwd, n);
      const at = (geo: THREE.BufferGeometry, q: THREE.Quaternion, lift: number) => geo.applyQuaternion(q).translate(p.x + n.x * lift, p.y + n.y * lift, p.z + n.z * lift);
      chrome.push(at(new THREE.CylinderGeometry(r, r * 0.85, 0.008, 28, 1, true), qUp, 0.004));      // polished cup
      chrome.push(at(new THREE.CircleGeometry(r * 0.85, 28), qF, 0.0006));                           // reflector back
      chrome.push(at(new THREE.TorusGeometry(r * 0.97, 0.002, 6, 28), qF, 0.008));                   // bezel ring
      lit.push(at(new THREE.CircleGeometry(r * 0.5, 24), qF, 0.007));                                // LED lens face
      lit.push(at(new THREE.TorusGeometry(r * 0.66, 0.0016, 6, 28), qF, 0.0075));                   // LED halo
    }
    const strip = (geos: THREE.BufferGeometry[]) => mergeGeometries(geos.map((q) => { const n = q.index ? q.toNonIndexed() : q; for (const k of Object.keys(n.attributes)) if (!['position', 'normal', 'uv'].includes(k)) n.deleteAttribute(k); return n; }));
    const cups = new THREE.Mesh(strip(chrome), mats.rimLip);
    cups.name = 'Headlight_Projectors_' + tag;
    const leds = new THREE.Mesh(strip(lit), mats.led);
    leds.name = 'Headlight_LEDs_' + tag;
    g.add(cups, leds);
    // Clear lens, flush with the original body surface over the recess.
    const lo = L.box[0], hi = L.box[1];
    const patch = mesh(f0, [side > 0 ? lo[0] - 0.02 : -hi[0] - 0.02, lo[1] - 0.02, lo[2] - 0.05], [side > 0 ? hi[0] + 0.02 : -lo[0] + 0.02, hi[1] + 0.02, hi[2] + 0.1], 0.007);
    const lensGeo = simplifyKeepEdge(clipSurface(patch, (x, y, z) => L.foot(Math.abs(x), y, z), LENS_LIFT), 260);
    const lens = new THREE.Mesh(lensGeo, mats.lamp);
    lens.name = 'Headlight_Lens_' + tag;
    g.add(lens);
    // Gloss-black bezel closing the gap between the raised lens edge and the body.
    const bezel = new THREE.Mesh(bezelFor(lensGeo, LENS_LIFT + 0.002), mats.trim);
    bezel.name = 'Headlight_Bezel_' + tag;
    g.add(bezel);
  }
  return g;
}

/** Front splitter that follows the nose: the body outline just above it, offset outwards, with rounded edges. */
function buildSplitter(d: Design, mats: ReturnType<typeof materials>) {
  const S = d.splitter!;
  const fb = bodySDF(d, { cuts: false, pockets: false, flare: false });
  const yS = d.flare ? d.flare.ySample : S.y + 0.075;
  const right: [number, number][] = [];
  for (let z = S.zStart; z < d.z1 + 0.3; z += 0.01) {
    let x = 1.3;
    while (x > 0 && fb(x, yS, z) > 0) x -= 0.004;
    if (x <= 0.02) break;
    let a = x, b = x + 0.004;
    for (let i = 0; i < 16; i++) { const m = (a + b) / 2; if (fb(m, yS, z) < 0) a = m; else b = m; }
    right.push([a, z]);
  }
  // Outline (x, z): right edge front-wards, across the nose, left edge back; then offset outwards and smooth.
  let poly: [number, number][] = [...right, ...right.slice().reverse().map(([x, z]) => [-x, z] as [number, number])];
  const n = poly.length;
  const off: [number, number][] = poly.map(([x, z], i) => {
    const [px, pz] = poly[(i - 1 + n) % n], [nx, nz] = poly[(i + 1) % n];
    let tx = nx - px, tz = nz - pz; const l = Math.hypot(tx, tz) || 1; tx /= l; tz /= l;
    let ox = tz, oz = -tx; // outward for this winding
    if (z <= S.zStart + 1e-6) { ox = Math.sign(x); oz = 0; } // rear corners: only widen, never extend backwards
    return [x + ox * S.overhang, z + oz * S.overhang];
  });
  for (let it = 0; it < 6; it++) for (let i = 1; i < off.length - 1; i++) {
    if (off[i][1] <= S.zStart + 0.02) continue;
    off[i] = [(off[i - 1][0] + 2 * off[i][0] + off[i + 1][0]) / 4, (off[i - 1][1] + 2 * off[i][1] + off[i + 1][1]) / 4];
  }
  const shape = new THREE.Shape(off.map(([x, z]) => new THREE.Vector2(x, z)));
  const geo = new THREE.ExtrudeGeometry(shape, { depth: S.thick - 0.01, bevelEnabled: true, bevelThickness: 0.005, bevelSize: 0.006, bevelSegments: 3, curveSegments: 4 });
  geo.rotateX(Math.PI / 2);
  geo.translate(0, S.y - 0.005, 0);
  const sp = new THREE.Mesh(geo, mats.carbon);
  sp.name = 'Front_Splitter';
  const g = new THREE.Group();
  g.name = 'Front_Splitter_Assembly';
  g.add(sp);
  // v7 accent edge: a rounded bead along the front and side edges (body colour or the identity's calliper colour).
  const front = off.filter(([, z]) => z > S.zStart + 0.06);
  if (S.lip && front.length > 4) {
    const yMid = S.y - S.thick / 2;
    const curve = new THREE.CatmullRomCurve3(front.map(([x, z]) => new THREE.Vector3(x * 1.004, yMid, z + 0.002)), false, 'centripetal');
    const lip = new THREE.Mesh(new THREE.TubeGeometry(curve, 160, S.thick * 0.42, 8, false), S.lip === 'paint' ? mats.paint : mats.caliper);
    lip.name = 'Front_Splitter_Lip';
    g.add(lip);
  }
  // v7 end fins: small vertical carbon plates standing on the splitter's outer ends.
  if (S.endFins) for (const side of [1, -1]) {
    const pts = front.filter(([x]) => Math.sign(x) === side);
    const [ex, ez] = pts.reduce((a, b) => (Math.abs(b[0]) > Math.abs(a[0]) ? b : a));
    const fin = new THREE.Mesh(new THREE.ExtrudeGeometry(new THREE.Shape([new THREE.Vector2(-0.09, 0), new THREE.Vector2(0.09, 0), new THREE.Vector2(0.06, 0.06), new THREE.Vector2(-0.07, 0.035)]), { depth: 0.008, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 }), mats.carbon);
    fin.geometry.rotateY(Math.PI / 2).translate(ex - side * 0.012 - 0.004, S.y, ez - 0.03);
    fin.name = 'Front_Splitter_Fin';
    g.add(fin);
  }
  return g;
}

/** v7 dive planes: thin carbon blades fixed to the front corners, angled up towards the outside. */
function buildCanards(d: Design, mats: ReturnType<typeof materials>) {
  const fb = bodySDF(d, { cuts: false, pockets: false });
  const g = new THREE.Group();
  g.name = 'Front_Canards';
  for (const [y, z, span, chord, angle] of d.canards!) for (const side of [1, -1]) {
    let x = 1.3;
    while (x > 0 && fb(x, y, z) > 0) x -= 0.003;
    const sh = new THREE.Shape([new THREE.Vector2(0, -chord / 2), new THREE.Vector2(span, -chord * 0.25), new THREE.Vector2(span * 0.8, chord * 0.32), new THREE.Vector2(0, chord / 2)]);
    const geo = new THREE.ExtrudeGeometry(sh, { depth: 0.007, bevelEnabled: true, bevelThickness: 0.002, bevelSize: 0.002, bevelSegments: 1 });
    geo.rotateX(Math.PI / 2).rotateZ(angle);
    if (side < 0) { geo.scale(-1, 1, 1); const ix = geo.index; if (!ix) { const p = geo.getAttribute('position'); for (let i = 0; i < p.count; i += 3) { for (const a of [p, geo.getAttribute('normal'), geo.getAttribute('uv')]) for (let k = 0; k < a.itemSize; k++) { const t = a.getComponent(i + 1, k); a.setComponent(i + 1, k, a.getComponent(i + 2, k)); a.setComponent(i + 2, k, t); } } } }
    geo.translate(side * (x - 0.02), y, z);
    const m = new THREE.Mesh(geo, mats.carbon);
    m.name = 'Front_Canard_' + (side > 0 ? 'L' : 'R');
    g.add(m);
  }
  return g;
}
