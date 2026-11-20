// Version 4 of the two original prototype cars. Fits the game: wheels at x = ±0.84 (+X is the car's LEFT),
// front axle z = +1.32, rear axle z = -1.28, wheel radius 0.36, car faces +Z, ground at y = 0.
// Targets: ground clearance 10-15 cm, height <= 1.3 m, width <= 2.1 m.
import * as THREE from 'three';
import { Curve, sdEllipsoid as E, sdRoundBox } from './geo';
import { exhaust, mirror, plate, rearWing, type Finish, type Mats, type RimStyle } from './parts';

export type Tag = 'mesh' | 'carbon' | 'lamp' | 'led' | 'tail' | 'tailLed' | 'trim' | 'paint' | 'glass';
type F3 = (x: number, y: number, z: number) => number; // x is |x|: designs are symmetric
type N = THREE.Vector3;

export interface Design {
  id: string;
  title: string;
  style: { paint: number; accent: number; finish: Finish; rim: number; caliper: number };
  rimStyle: RimStyle;
  centreLock?: boolean;
  z0: number; z1: number; endK: number;
  hw: Curve; top: Curve; bot: Curve; rad: Curve; tumble: number;
  g: { z0: number; z1: number; belt: Curve; roof: Curve; wB: Curve; wT: Curve; r: number };
  fenders: [number, number, number, number, number, number, number][];
  unions?: { sd: F3; k: number }[];
  cuts: { sd: F3; tag: Tag; k?: number }[];
  zones: { test: (x: number, y: number, z: number, n: N) => boolean; tag: Tag }[];
  sideGlass: [number, number];
  rearGlass?: boolean;
  archR: number;
  parts: (g: THREE.Group, m: Mats) => void;
}

const B = (x: number, y: number, z: number, cx: number, cy: number, cz: number, bx: number, by: number, bz: number, r = 0.01) =>
  sdRoundBox(x - cx, y - cy, z - cz, bx, by, bz, r);
const inBox = (x: number, y: number, z: number, cx: number, cy: number, cz: number, bx: number, by: number, bz: number) =>
  Math.abs(x - cx) < bx && Math.abs(y - cy) < by && Math.abs(z - cz) < bz;
const lower = { test: (_x: number, y: number) => y < 0.135, tag: 'mesh' as Tag };
const sills = (z0: number, z1: number) => ({
  test: (_x: number, y: number, z: number, n: N) => y < 0.235 && Math.abs(n.x) > 0.55 && z > z0 && z < z1,
  tag: 'carbon' as Tag,
});

/** Diffuser: carbon panel with vertical fins, ending flush with the rear (`zEnd`). */
function diffuser(g: THREE.Group, m: Mats, zEnd: number, width: number, n: number) {
  const parts: THREE.Mesh[] = [];
  for (let i = 0; i < n; i++) {
    const x = -width + (2 * width * i) / (n - 1);
    const fin = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.11, 0.3), m.carbon);
    fin.position.set(x, 0.205, zEnd + 0.16);
    parts.push(fin);
  }
  const panel = new THREE.Mesh(new THREE.BoxGeometry(width * 2 + 0.08, 0.012, 0.32), m.carbon);
  panel.position.set(0, 0.262, zEnd + 0.17);
  panel.rotation.x = -0.12;
  parts.push(panel);
  parts.forEach((p) => (p.name = 'Rear_Diffuser'));
  g.add(...parts);
}

// ------------------------------------------------------------------ Exotic supercar: low, wide, mid-engine
export const EXOTIC: Design = {
  id: 'original_exotic_supercar_v4',
  title: 'Exotic supercar v4',
  style: { paint: 0xb80d18, accent: 0x111214, finish: 'metallic', rim: 0x1a1b1e, caliper: 0xf5c400 },
  rimStyle: 'forged7',
  centreLock: true,
  z0: -2.3, z1: 2.3, endK: 0.12,
  hw: new Curve([[-2.3, 0.86], [-2.05, 0.97], [-1.3, 0.99], [-0.55, 0.9], [0.4, 0.88], [1.3, 0.97], [1.9, 0.9], [2.2, 0.72], [2.3, 0.5]]),
  top: new Curve([[-2.3, 0.76], [-2.05, 0.9], [-1.6, 0.93], [-1.1, 0.92], [-0.8, 0.9], [1.0, 0.72], [1.6, 0.66], [2.0, 0.56], [2.3, 0.38]]),
  bot: new Curve([[-2.3, 0.26], [-2.0, 0.16], [-1.6, 0.12], [1.8, 0.12], [2.3, 0.17]]),
  rad: new Curve([[-2.3, 0.08], [2.3, 0.07]]),
  tumble: 0.8,
  g: {
    z0: -1.05, z1: 1.02, r: 0.12,
    belt: new Curve([[-1.05, 0.9], [1.02, 0.72]]),
    roof: new Curve([[-1.05, 0.9], [-0.7, 1.02], [-0.3, 1.115], [0.1, 1.125], [0.5, 1.04], [0.85, 0.85], [1.02, 0.72]]),
    wB: new Curve([[-1.05, 0.55], [-0.2, 0.74], [0.6, 0.72], [1.02, 0.6]]),
    wT: new Curve([[-1.05, 0.35], [-0.2, 0.52], [0.6, 0.5], [1.02, 0.42]]),
  },
  fenders: [[0.8, 0.68, 1.32, 0.2, 0.185, 0.72, 0.06], [0.88, 0.64, -1.3, 0.12, 0.27, 0.92, 0.08]],
  cuts: [
    { sd: (x, y, z) => E(x - 0.98, y - 0.56, z + 0.55, 0.2, 0.17, 0.45), tag: 'mesh', k: 0.03 }, // side intakes
    { sd: (x, y, z) => B(x, y, z, 0.48, 0.27, 2.2, 0.28, 0.09, 0.2, 0.04), tag: 'mesh' }, // front intakes
    { sd: (x, y, z) => B(x, y, z, 0, 0.52, -2.32, 0.78, 0.16, 0.12, 0.05), tag: 'mesh' }, // open rear mesh
    { sd: (x, y, z) => B(x, y, z, 0, 0.15, -2.28, 0.7, 0.09, 0.3, 0.03), tag: 'carbon' }, // diffuser recess
    { sd: (x, y, z) => B(x, y, z, 0, 0.62, 1.75, 0.25, 0.04, 0.12, 0.03), tag: 'mesh' }, // bonnet duct
  ],
  zones: [
    { test: (x, y, z) => inBox(x, y, z, 0.6, 0.57, 2.0, 0.15, 0.009, 0.16) || inBox(x, y, z, 0.76, 0.54, 1.96, 0.012, 0.035, 0.14), tag: 'led' },
    { test: (x, y, z) => E(x - 0.66, y - 0.56, z - 1.98, 0.2, 0.05, 0.18) < 0, tag: 'lamp' },
    { test: (x, y, z, n) => n.z < -0.2 && (inBox(x, y, z, 0.45, 0.705, -2.26, 0.34, 0.01, 0.12) || inBox(x, y, z, 0.8, 0.6, -2.15, 0.012, 0.11, 0.2)), tag: 'tailLed' },
    { test: (x, _y, z, n) => z > -1.95 && z < -1.1 && x < 0.55 && n.y > 0.6 && Math.floor(z * 14) % 2 === 0, tag: 'mesh' }, // louvres
    lower,
    sills(-0.4, 0.95),
  ],
  sideGlass: [-0.75, 0.82],
  archR: 0.42,
  parts: (g, m) => {
    const wing = rearWing({ span: 1.6, chord: 0.3, y: 1.02, z: -2.0, deckY: 0.93, mountX: 0.4, angle: 0.06, plateMat: m.carbon, bladeMat: m.carbon, mountMat: m.carbon, plateH: 0.14 });
    wing.name = 'Active_Rear_Wing';
    g.add(wing);
    for (const s of [-1, 1]) {
      const mr = mirror(s * 0.72, 0.75, 0.72, m.paint, m.carbon);
      mr.name = s > 0 ? 'Mirror_L' : 'Mirror_R';
      g.add(mr);
    }
    const ex = exhaust(0, 0.5, -2.31, 0.065, m.titanium, m.mesh, 6);
    ex.name = 'Exhaust_Centre';
    g.add(ex);
    const sp = plate([[-0.84, 1.95], [0.84, 1.95], [0.74, 2.34], [-0.74, 2.34]], 0.125, 0.018, m.carbon);
    sp.name = 'Front_Splitter';
    g.add(sp);
    diffuser(g, m, -2.3, 0.55, 6);
  },
};

// ------------------------------------------------------------------ GT racing car: endurance-racer proportions, big aero
export const GT: Design = {
  id: 'original_gt_racecar_v4',
  title: 'GT racing car v4',
  style: { paint: 0xeef2f6, accent: 0x1f6fd1, finish: 'gloss', rim: 0x2a2d31, caliper: 0xe3262f },
  rimStyle: 'ten',
  centreLock: true,
  z0: -2.38, z1: 2.24, endK: 0.12,
  hw: new Curve([[-2.38, 0.88], [-2.1, 0.96], [-1.3, 1.0], [-0.5, 0.88], [0.5, 0.87], [1.3, 0.99], [1.85, 0.95], [2.15, 0.83], [2.24, 0.62]]),
  top: new Curve([[-2.38, 0.8], [-2.15, 0.86], [-1.2, 0.88], [-0.95, 0.87], [0.95, 0.7], [1.4, 0.55], [1.9, 0.47], [2.24, 0.36]]),
  bot: new Curve([[-2.38, 0.24], [-2.1, 0.15], [-1.6, 0.12], [1.9, 0.12], [2.24, 0.16]]),
  rad: new Curve([[-2.38, 0.07], [2.24, 0.07]]),
  tumble: 0.82,
  g: {
    z0: -0.95, z1: 0.98, r: 0.12,
    belt: new Curve([[-0.95, 0.87], [0.98, 0.7]]),
    roof: new Curve([[-0.95, 0.87], [-0.6, 1.03], [-0.15, 1.14], [0.3, 1.13], [0.7, 0.98], [0.98, 0.7]]),
    wB: new Curve([[-0.95, 0.55], [0, 0.7], [0.98, 0.58]]),
    wT: new Curve([[-0.95, 0.35], [0, 0.48], [0.98, 0.4]]),
  },
  fenders: [[0.78, 0.68, 1.32, 0.24, 0.19, 0.98, 0.06], [0.87, 0.64, -1.3, 0.12, 0.25, 1.0, 0.08]],
  unions: [{ sd: (x, y, z) => B(x, y, z, 0, 1.15, -0.15, 0.13, 0.06, 0.24, 0.04), k: 0.03 }], // roof air scoop
  cuts: [
    { sd: (x, y, z) => B(x, y, z, 0, 0.27, 2.15, 0.36, 0.08, 0.15, 0.04), tag: 'mesh' }, // front intake
    { sd: (x, y, z) => B(x, y, z, 0, 1.16, 0.09, 0.1, 0.035, 0.05, 0.02), tag: 'mesh' }, // scoop mouth
    { sd: (x, y, z) => B(x, y, z, 0.74, 0.79, 1.55, 0.13, 0.02, 0.16, 0.01), tag: 'mesh', k: 0.01 }, // fender louvres
    { sd: (x, y, z) => E(x - 0.97, y - 0.5, z - 0.72, 0.07, 0.12, 0.22), tag: 'mesh' }, // side vents
    { sd: (x, y, z) => B(x, y, z, 0, 0.17, -2.36, 0.75, 0.1, 0.32, 0.03), tag: 'carbon' }, // diffuser recess
    { sd: (x, y, z) => B(x, y, z, 0, 0.58, -2.4, 0.7, 0.1, 0.08, 0.03), tag: 'mesh' }, // rear mesh
  ],
  zones: [
    { test: (x, y, z) => inBox(x, y, z, 0.74, 0.635, 2.08, 0.18, 0.01, 0.14) || inBox(x, y, z, 0.9, 0.6, 2.0, 0.012, 0.05, 0.12), tag: 'led' },
    { test: (x, y, z) => B(x, y, z, 0.74, 0.62, 2.06, 0.2, 0.045, 0.14, 0.02) < 0, tag: 'lamp' },
    { test: (x, y, z, n) => n.z < -0.2 && inBox(x, y, z, 0, 0.82, -2.36, 0.85, 0.012, 0.12), tag: 'tailLed' },
    { test: (x, y, z, n) => n.z < -0.2 && inBox(x, y, z, 0, 0.8, -2.36, 0.88, 0.04, 0.12), tag: 'tail' },
    lower,
    sills(-0.4, 0.95),
  ],
  sideGlass: [-0.7, 0.8],
  archR: 0.42,
  parts: (g, m) => {
    const wing = rearWing({ span: 1.8, chord: 0.34, y: 1.12, z: -2.1, deckY: 0.88, mountX: 0.3, angle: 0.1, plateMat: m.carbon, bladeMat: m.carbon, mountMat: m.carbon, plateH: 0.26 });
    wing.name = 'GT_Rear_Wing';
    g.add(wing);
    const fin = new THREE.Mesh(
      new THREE.ExtrudeGeometry(
        new THREE.Shape([new THREE.Vector2(-0.45, 1.08), new THREE.Vector2(-2.0, 1.12), new THREE.Vector2(-2.0, 0.9), new THREE.Vector2(-1.1, 0.9)]),
        { depth: 0.012, bevelEnabled: false },
      ).applyMatrix4(new THREE.Matrix4().set(0, 0, 1, -0.006, 0, 1, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1)),
      m.paint,
    );
    fin.name = 'Shark_Fin';
    g.add(fin);
    for (const s of [-1, 1]) {
      const mr = mirror(s * 0.7, 0.73, 0.76, m.paint, m.carbon);
      mr.name = s > 0 ? 'Mirror_L' : 'Mirror_R';
      g.add(mr);
      const ex = exhaust(s * 0.12, 0.56, -2.37, 0.05, m.titanium, m.mesh);
      ex.name = s > 0 ? 'Exhaust_L' : 'Exhaust_R';
      g.add(ex);
      for (const [cy, w] of [[0.36, 0.16], [0.46, 0.12]] as const) {
        const canard = plate([[0, 0], [w, 0.0], [w * 0.75, 0.14], [0, 0.1]], cy, 0.008, m.carbon);
        canard.position.set(s > 0 ? 0.8 : -0.8 - w, 0, 1.9);
        canard.name = s > 0 ? 'Front_Canard_L' : 'Front_Canard_R';
        g.add(canard);
      }
    }
    const sp = plate([[-0.95, 1.85], [0.95, 1.85], [0.88, 2.3], [-0.88, 2.3]], 0.125, 0.02, m.carbon);
    sp.name = 'Front_Splitter';
    g.add(sp);
    diffuser(g, m, -2.38, 0.6, 6);
  },
};
