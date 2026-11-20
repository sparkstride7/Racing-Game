// Version 4 of the two original prototype cars. Fits the game: wheels at x = ±0.84 (+X is the car's LEFT),
// front axle z = +1.32, rear axle z = -1.28, wheel radius 0.36, car faces +Z, ground at y = 0.
// Targets: ground clearance 10-15 cm, height <= 1.3 m, width <= 2.1 m.
import * as THREE from 'three';
import { Curve, sdEllipsoid as E, sdRoundBox, sdRoundTrap } from './geo';
import { exhaust, mirror, plate, rearWing, type Finish, type Mats, type RimStyle } from './parts';

export type Tag = 'mesh' | 'carbon' | 'lamp' | 'led' | 'tail' | 'tailLed' | 'trim' | 'paint' | 'glass' | 'housing' | 'liner';
type F3 = (x: number, y: number, z: number) => number; // x is |x|: designs are symmetric
type N = THREE.Vector3;

/** Smooth raise of the body's own surface (see Design.wings). */
export interface Wing { h: number; x0: number; x1: number; x2: number; x3: number; y0: number; y1: number; zc: number; zr0: number; zr1: number;
  /** v10b: the raise falls gradually from z = slope[0] (full height) to z = slope[1] (none) towards the front. */
  slope?: [number, number] }

export interface Design {
  id: string;
  title: string;
  style: { paint: number; accent: number; finish: Finish; rim: number; caliper: number };
  rimStyle: RimStyle;
  centreLock?: boolean;
  z0: number; z1: number; endK: number;
  hw: Curve; top: Curve; bot: Curve; rad: Curve; tumble: number | Curve;
  g: { z0: number; z1: number; belt: Curve; roof: Curve; wB: Curve; wT: Curve; r: number };
  fenders: [number, number, number, number, number, number, number][];
  unions?: { sd: F3; k: number }[];
  /** wall: tag for the inner side walls of a deep opening (surfaces not facing along +Z), e.g. gloss black. */
  /**
   * scoop (v8r1): a shallow, softly blended dip in the body around the opening (grow metres wide, depth metres deep,
   * following the surface) so the bumper flows into it. wall: tag for the opening's inner side walls.
   */
  cuts: { sd: F3; tag: Tag; k?: number; wall?: Tag; scoop?: { grow: number; depth: number; k: number } }[];
  zones: { test: (x: number, y: number, z: number, n: N) => boolean; tag: Tag }[];
  sideGlass: [number, number];
  rearGlass?: boolean;
  archR: number;
  parts: (g: THREE.Group, m: Mats) => void;
  /**
   * v6 headlights: a recess `depth` deep that follows the body surface inside the footprint `foot` (< 0 inside),
   * filled with a graphite housing, LED projector modules and an LED daytime-running-light strip, under a clear lens.
   * hook: the DRL turns down at the outer end (each car's light signature).
   */
  lamps?: { foot: F3; depth: number; box: [number[], number[]]; projectors: number; hook: number };
  /** v6 front splitter that follows the nose outline (offset outwards by `overhang`), instead of a flat board. */
  splitter?: { zStart: number; y: number; thick: number; overhang: number; lip?: 'paint' | 'caliper'; endFins?: boolean };
  /** v7 small carbon dive planes on the front corners, attached to the body surface: [height, z, span, chord, angle]. */
  canards?: [number, number, number, number, number][];
  /**
   * v8 lower-bumper flare: from z = zStart forwards, the body widens smoothly by up to `grow` towards its bottom
   * (between yBottom and yBottom + height), measured from the bumper outline at ySample, blended in with radius k.
   */
  /**
   * v9b front wings: the body's own top surface rises smoothly by up to h over each front wheel (no separate shape,
   * so no join or crease). Full height between x1..x2 (fading to nothing at x0 and x3), above y1 (none below y0),
   * and within zr0 of zc along the car (fading to nothing at zr1).
   */
  wings?: Wing | Wing[];
  flare?: { zStart: number; yBottom: number; height: number; grow: number; ySample: number; k: number };
}

/**
 * v7 sculpted opening: a rounded trapezoid (half-width rBot at the bottom, rTop at the top, half-height he) seen
 * from the front, tilted by `tilt` radians (outer edge up when > 0 for side intakes), carved `depth` deep around z = cz.
 */
const intake = (cx: number, cy: number, cz: number, rBot: number, rTop: number, he: number, depth: number, tilt: number, round: number): F3 =>
  (x, y, z) => {
    const c = Math.cos(tilt), sn = Math.sin(tilt), px = x - cx, py = y - cy;
    const d2 = sdRoundTrap(c * px + sn * py, -sn * px + c * py, rBot, rTop, he, round);
    return Math.max(d2, Math.abs(z - cz) - depth);
  };

const B = (x: number, y: number, z: number, cx: number, cy: number, cz: number, bx: number, by: number, bz: number, r = 0.01) =>
  sdRoundBox(x - cx, y - cy, z - cz, bx, by, bz, r);
const inBox = (x: number, y: number, z: number, cx: number, cy: number, cz: number, bx: number, by: number, bz: number) =>
  Math.abs(x - cx) < bx && Math.abs(y - cy) < by && Math.abs(z - cz) < bz;
/** v8: the flared lower bumper is body colour all the way down to the splitter (not dark trim). */
const flarePaint = (zStart: number) => ({ test: (_x: number, y: number, z: number, n: N) => z > zStart - 0.3 && y < 0.215 && n.y > -0.6, tag: 'paint' as Tag });
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
// ------------------------------------------------------------------ Exotic supercar v10: an original mid-engine design.
// Proportions guided by the reference sheet (4.57 m long, 1.21 m high), adapted to the game's fixed wheels:
// axles at z = +1.32 / -1.28 (2.60 m wheelbase), wheel centres at x = +/-0.84 with 0.30 m tyres, so the body is
// about 2.0 m wide at the wheels. Every shape here is drawn for this car; nothing is traced from the reference.
const V10_Z0 = -2.24, V10_Z1 = 2.37; // v10c: nose 4 cm longer
// Cab-forward glasshouse: windscreen base just behind the front wheels, roof peak 1.213 m, long buttresses.
const V10_G = {
  z0: -1.1, z1: 0.66, r: 0.13,
  belt: new Curve([[-1.1, 0.9], [-0.5, 0.82], [0.66, 0.77]]),
  roof: new Curve([[-1.1, 0.9], [-0.85, 1.04], [-0.55, 1.165], [-0.25, 1.213], [0.05, 1.2], [0.3, 1.1], [0.5, 0.95], [0.66, 0.77]]),
  wB: new Curve([[-1.1, 0.62], [-0.4, 0.8], [0.3, 0.8], [0.66, 0.68]]),
  wT: new Curve([[-1.1, 0.4], [-0.4, 0.58], [0.3, 0.56], [0.66, 0.46]]),
};
export const EXOTIC: Design = {
  id: 'original_exotic_supercar_v10',
  title: 'Exotic supercar v10',
  style: { paint: 0xb80d18, accent: 0x111214, finish: 'metallic', rim: 0x1a1b1e, caliper: 0xf5c400 },
  rimStyle: 'forged7',
  centreLock: true,
  z0: V10_Z0, z1: V10_Z1, endK: 0.1,
  // Plan view: narrow nose, full front wings, slim waist at the doors, widest over the rear wheels, tapered tail.
  // (Over the wheels the body must cover the game's tyres, which reach x = +/-0.99 m.)
  hw: new Curve([[V10_Z0, 0.83], [-2.05, 0.95], [-1.6, 0.99], [-1.28, 1.0], [-0.9, 0.96], [-0.4, 0.915], [0.3, 0.915], [0.9, 0.975], [1.32, 0.99], [1.75, 0.955], [2.1, 0.845], [V10_Z1, 0.56]]), // v10c: longer, gentler taper to the nose
  // Centre-line deck: short high tail, flat engine cover, low cowl, long bonnet falling to a low nose.
  top: new Curve([[V10_Z0, 0.84], [-2.05, 0.9], [-1.6, 0.92], [-1.1, 0.91], [-0.85, 0.88], [0.0, 0.8], [0.62, 0.77], [1.0, 0.73], [1.4, 0.68], [1.75, 0.6], [2.05, 0.5], [2.25, 0.42], [V10_Z1, 0.34]]), // v10c: lower bonnet falling steadily to a low nose
  bot: new Curve([[V10_Z0, 0.32], [-2.0, 0.18], [-1.7, 0.11], [1.85, 0.11], [V10_Z1, 0.13]]),
  rad: new Curve([[V10_Z0, 0.13], [-1.9, 0.1], [1.5, 0.08], [2.05, 0.05], [V10_Z1, 0.04]]),
  // Sides lean in more at the doors than over the wheels.
  tumble: new Curve([[V10_Z0, 0.86], [-1.3, 0.87], [-0.6, 0.81], [0.6, 0.82], [1.32, 0.88], [V10_Z1, 0.86]]),
  g: V10_G,
  fenders: [], // no separate shapes: the wings below shape the body itself
  wings: [
    // Front wings rise smoothly over the front wheels and fade out before the doors and at the nose.
    // v10b: from the top of the wheel the wing slopes gently down to the front bumper (no blunt rounded drop at the nose).
    { h: 0.14, x0: 0.3, x1: 0.66, x2: 0.9, x3: 1.06, y0: 0.3, y1: 0.56, zc: 1.32, zr0: 0.35, zr1: 0.95, slope: [1.3, 2.37] }, // v10c: wing falls from the arch top all the way to the bumper
    // Rear hips: a gentle swell over the rear wheels.
    { h: 0.07, x0: 0.45, x1: 0.78, x2: 0.92, x3: 1.08, y0: 0.3, y1: 0.62, zc: -1.28, zr0: 0.3, zr1: 0.95 },
  ],
  cuts: [
    // Side intake on the rear quarter, swept up towards the front, softly rounded lip and dark walls.
    { sd: (x, y, z) => E(x - 1.0, y - (0.56 + 0.16 * (z + 0.62)), z + 0.62, 0.2, 0.13, 0.36), tag: 'mesh', k: 0.05, wall: 'liner' },
    { sd: intake(0, 0.25, 2.3, 0.36, 0.3, 0.07, 0.3, 0, 0.055), tag: 'mesh', k: 0.035 }, // wide centre grille
    { sd: intake(0.6, 0.27, 2.24, 0.12, 0.085, 0.06, 0.3, 0.3, 0.04), tag: 'mesh', k: 0.06, wall: 'liner' }, // side intakes
    { sd: (x, y, z) => B(x, y, z, 0, 0.6, 1.72, 0.24, 0.04, 0.11, 0.03), tag: 'mesh' }, // bonnet vent (v10c: same vent, follows the lower bonnet)
    { sd: (x, y, z) => B(x, y, z, 0, 0.5, V10_Z0 - 0.02, 0.58, 0.1, 0.1, 0.05), tag: 'mesh', k: 0.03 }, // rear grille
    { sd: (x, y, z) => B(x, y, z, 0, 0.16, V10_Z0 + 0.02, 0.7, 0.09, 0.3, 0.03), tag: 'carbon' }, // diffuser recess
  ],
  zones: [
    flarePaint(1.95),
    // Full-width LED tail-light bar.
    { test: (x, y, z, n) => n.z < -0.2 && inBox(x, y, z, 0, 0.74, V10_Z0, 0.8, 0.02, 0.14), tag: 'tailLed' },
    // Windscreen glass and its dark surround (defined directly for this cab shape).
    { test: (x, y, z, n) => z > 0.12 && z < 0.62 && n.z > 0.2 && n.y > 0.25 && y > 0.8 && x < V10_G.wT.at(z) - 0.07, tag: 'glass' },
    { test: (x, y, z, n) => z > 0.08 && z < 0.66 && n.z > 0.15 && n.y > 0.2 && y > 0.78 && x < V10_G.wT.at(z) - 0.035, tag: 'trim' },
    { test: (x, _y, z, n) => z > -1.95 && z < -1.15 && x < 0.5 && n.y > 0.6 && Math.floor(z * 14) % 2 === 0, tag: 'mesh' }, // engine-cover louvres
    lower,
    sills(-0.85, 0.9),
  ],
  sideGlass: [-0.85, 0.55],
  archR: 0.42,
  parts: (g, m) => {
    const wing = rearWing({ span: 1.55, chord: 0.3, y: 1.03, z: -1.95, deckY: 0.9, mountX: 0.42, angle: 0.07, plateMat: m.carbon, bladeMat: m.carbon, mountMat: m.carbon, plateH: 0.15 });
    wing.name = 'Rear_Wing';
    g.add(wing);
    for (const s of [-1, 1]) {
      const mr = mirror(s * 0.76, 0.82, 0.46, m.paint, m.carbon);
      mr.name = s > 0 ? 'Mirror_L' : 'Mirror_R';
      g.add(mr);
    }
    const ex = exhaust(0, 0.47, V10_Z0 - 0.01, 0.06, m.titanium, m.mesh, 6);
    ex.name = 'Exhaust_Centre';
    g.add(ex);
    diffuser(g, m, V10_Z0, 0.55, 6);
  },
  // Slim swept headlights on the front corners, outer end higher.
  lamps: {
    foot: (x, y, z) => { const dx = x - 0.63, dy = y - 0.52, c = Math.cos(0.28), s = Math.sin(0.28); return Math.max(E(c * dx + s * dy, -s * dx + c * dy, 0, 0.2, 0.045, 1), 1.75 - z); },
    depth: 0.03, box: [[0.38, 0.42, 1.75], [0.9, 0.66, 2.4]], projectors: 2, hook: 1,
  },
  splitter: { zStart: 1.95, y: 0.125, thick: 0.018, overhang: 0.04 },
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
  bot: new Curve([[-2.38, 0.24], [-2.1, 0.15], [-1.6, 0.12], [1.9, 0.12], [2.24, 0.125]]), // v8: bumper runs down to the splitter (was 0.16)
  rad: new Curve([[-2.38, 0.07], [1.5, 0.07], [2.0, 0.04], [2.24, 0.04]]), // v8: tighter lower edge at the front
  tumble: 0.82,
  g: {
    z0: -0.95, z1: 0.98, r: 0.12,
    belt: new Curve([[-0.95, 0.87], [0.98, 0.7]]),
    roof: new Curve([[-0.95, 0.87], [-0.6, 1.03], [-0.15, 1.14], [0.3, 1.13], [0.7, 0.98], [0.98, 0.7]]),
    wB: new Curve([[-0.95, 0.55], [0, 0.7], [0.98, 0.58]]),
    wT: new Curve([[-0.95, 0.35], [0, 0.48], [0.98, 0.4]]),
  },
  // v9: the protruding front fender pods [0.78, 0.68, 1.32, 0.24, 0.19, 0.98] are removed completely; the body rises
  // into a broad, low, heavily blended wheel crown instead (same treatment as the Exotic). Rear haunch unchanged.
  // v9b: the v9 crown (a separate rounded shape) is replaced by `wings` below, which raise the body itself.
  fenders: [
    [0.87, 0.64, -1.3, 0.12, 0.25, 1.0, 0.08]],
  unions: [{ sd: (x, y, z) => B(x, y, z, 0, 1.15, -0.15, 0.13, 0.06, 0.24, 0.04), k: 0.03 }], // roof air scoop
  cuts: [
    { sd: intake(0, 0.285, 2.2, 0.42, 0.35, 0.085, 0.3, 0, 0.06), tag: 'mesh', k: 0.035 }, // v8 wide centre grille
    { sd: intake(0.69, 0.3, 2.15, 0.095, 0.065, 0.05, 0.3, 0.3, 0.038), tag: 'mesh', k: 0.065, wall: 'liner' }, // v8r1 blended side intakes
    { sd: (x, y, z) => B(x, y, z, 0, 1.16, 0.09, 0.1, 0.035, 0.05, 0.02), tag: 'mesh' }, // scoop mouth
    // v9: the fender louvres were cut into the top of the removed front pods, so they are removed with them.
    // v9b side vents: a swept exit vent behind the front wheel, rising towards the front like the crown above it,
    // set clear of the wheel arch, with a softly rounded lip and dark walls (no longer an oval joined to the arch).
    { sd: (x, y, z) => E(x - 0.92, y - (0.47 + 0.22 * (z - 0.5)), z - 0.5, 0.14, 0.055, 0.2), tag: 'mesh', k: 0.03, wall: 'liner' },
    { sd: (x, y, z) => B(x, y, z, 0, 0.17, -2.36, 0.75, 0.1, 0.32, 0.03), tag: 'carbon' }, // diffuser recess
    { sd: (x, y, z) => B(x, y, z, 0, 0.58, -2.4, 0.7, 0.1, 0.08, 0.03), tag: 'mesh' }, // rear mesh
  ],
  zones: [
    flarePaint(1.85),
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
      // v8: floating front canards removed (they looked detached from the bumper).
    }
    diffuser(g, m, -2.38, 0.6, 6);
  },
  // v9: same hooked lamp outline (0.4 m x 0.09 m) as seen from the front, moved down from the removed pods onto the new
  // front surface, limited to the front of the car.
  lamps: { foot: (x, y, z) => Math.max(B(x, y, 0, 0.72, 0.5, 0, 0.19, 0.045, 1, 0.02), 1.65 - z), depth: 0.03, box: [[0.48, 0.42, 1.65], [0.96, 0.58, 2.4]], projectors: 2, hook: 1 },
  splitter: { zStart: 1.85, y: 0.125, thick: 0.02, overhang: 0.04 },
  wings: { h: 0.27, x0: 0.15, x1: 0.6, x2: 0.88, x3: 1.04, y0: 0.32, y1: 0.58, zc: 1.3, zr0: 0.45, zr1: 1.25 },
};
