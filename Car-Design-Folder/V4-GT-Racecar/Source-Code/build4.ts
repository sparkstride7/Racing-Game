// Builds a version-4 car from a design and exports it as a game-ready GLB.
import * as THREE from 'three';
import { mergeGeometries, mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { MeshoptSimplifier } from 'three/addons/libs/meshopt_simplifier.module.js';
import { GLTFExporter } from 'three/addons/exporters/GLTFExporter.js';
import { clamp, mesh, mix, sdEllipsoid, sdRoundTrap, smax, smin } from './geo';
import type { Design, Tag } from './designs4';
import { materials, wheel, WHEEL_R } from './parts';

export const WHEELS = { x: 0.84, front: 1.32, rear: -1.28 };

function bodySDF(d: Design) {
  return (X: number, y: number, z: number) => {
    const x = Math.abs(X);
    const zc = clamp(z, d.z0, d.z1);
    const top = d.top.at(zc), bot = d.bot.at(zc), hw = d.hw.at(zc);
    let s = sdRoundTrap(x, y - (top + bot) / 2, hw, hw * d.tumble, (top - bot) / 2, d.rad.at(zc));
    s = smax(s, Math.max(d.z0 - z, z - d.z1), d.endK);
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
      s = smax(s, -smax(cyl, 0.6 - x, 0.02), 0.03);
    }
    for (const c of d.cuts) s = smax(s, -c.sd(x, y, z), c.k ?? 0.015);
    return s;
  };
}

function classifier(d: Design) {
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
      if (r > -0.012 && r < 0.02 && x < 0.97 && Math.abs(n.x) < 0.75) return 'mesh';
    }
    for (const cut of d.cuts) {
      const v = cut.sd(x, c.y, c.z);
      if (v > -0.004 && v < 0.012) return cut.tag;
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
  paint: 'Body_Paint', glass: 'Body_Glass', trim: 'Window_Trim', carbon: 'Body_Carbon', mesh: 'Intakes_And_Vents',
  lamp: 'Headlight_Housings', led: 'Headlight_LEDs', tail: 'Taillight_Lenses', tailLed: 'Taillight_LEDs',
};

export async function buildCar(d: Design, opts = { resolution: 0.015, bodyTriangles: 32000 }) {
  await MeshoptSimplifier.ready;
  const mats = materials(d.style);
  // Clear names for every material (they show up in the GLB).
  const names: Record<string, string> = {
    paint: 'Recolourable_Paint', accent: 'Accent', glass: 'Glass', trim: 'Trim_Black', carbon: 'Carbon_Fibre', mesh: 'Intake_Mesh',
    lamp: 'Headlight_Lens', led: 'LED_White', tail: 'Taillight_Lens', tailLed: 'LED_Red', chrome: 'Chrome', titanium: 'Exhaust_Titanium',
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
  // 1) Decide each fine triangle's material first (clean, detailed borders)...
  const classify = classifier(d);
  const buckets = new Map<Tag, number[]>();
  const c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < m.idx.length; t += 3) {
    c.set(0, 0, 0); n.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      const v = m.idx[t + k] * 3;
      c.x += m.pos[v] / 3; c.y += m.pos[v + 1] / 3; c.z += m.pos[v + 2] / 3;
      n.x += m.nrm[v]; n.y += m.nrm[v + 1]; n.z += m.nrm[v + 2];
    }
    n.normalize();
    const tag = classify(c, n);
    if (!buckets.has(tag)) buckets.set(tag, []);
    buckets.get(tag)!.push(m.idx[t], m.idx[t + 1], m.idx[t + 2]);
  }
  // 2) ...then simplify each material area on its own, with its border locked so edges stay clean.
  const total = m.idx.length / 3;
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
        pos.push(m.pos[v * 3], m.pos[v * 3 + 1], m.pos[v * 3 + 2]);
        nrm.push(m.nrm[v * 3], m.nrm[v * 3 + 1], m.nrm[v * 3 + 2]);
      }
      local[i] = r;
    });
    const p32 = new Float32Array(pos);
    const target = Math.max(60, Math.round((opts.bodyTriangles * idx.length) / 3 / total)) * 3;
    const [out, e] = MeshoptSimplifier.simplify(local, p32, 3, Math.min(target, local.length), 0.002, ['LockBorder']);
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
        // UVs: side projection (length, height) across the whole car.
        uv.push((pz - d.z0) / (d.z1 - d.z0), py / 1.4);
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
