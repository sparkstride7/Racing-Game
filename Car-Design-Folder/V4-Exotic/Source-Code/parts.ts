// Crisp parts and materials shared by all car designs.
import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

export const WHEEL_R = 0.36; // must match the physics wheel radius
export const WHEEL_W = 0.3;

// ------------------------------------------------------------------ materials

function canvasTex(size: number, draw: (c: CanvasRenderingContext2D, s: number) => void, repeat = 1) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = size;
  draw(cv.getContext('2d')!, size);
  const t = new THREE.CanvasTexture(cv);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat, repeat);
  t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8;
  return t;
}

let carbonTex: THREE.Texture | null = null;
function carbon() {
  // 2x2 twill weave.
  carbonTex ??= canvasTex(128, (c, s) => {
    const q = s / 8;
    for (let y = 0; y < 8; y++)
      for (let x = 0; x < 8; x++) {
        const along = (x + y) % 4 < 2;
        const g = c.createLinearGradient(x * q, y * q, along ? (x + 1) * q : x * q, along ? y * q : (y + 1) * q);
        g.addColorStop(0, along ? '#1d2024' : '#141619');
        g.addColorStop(0.5, along ? '#34383e' : '#25282d');
        g.addColorStop(1, along ? '#1d2024' : '#141619');
        c.fillStyle = g;
        c.fillRect(x * q, y * q, q, q);
      }
  }, 6);
  return carbonTex;
}

export type Finish = 'metallic' | 'pearl' | 'gloss' | 'satin';
export function paint(color: number, finish: Finish) {
  const f = {
    metallic: { metalness: 0.65, roughness: 0.3, clearcoat: 1, clearcoatRoughness: 0.03 },
    pearl: { metalness: 0.55, roughness: 0.28, clearcoat: 1, clearcoatRoughness: 0.03, iridescence: 0.5, iridescenceIOR: 1.35 },
    gloss: { metalness: 0.05, roughness: 0.22, clearcoat: 1, clearcoatRoughness: 0.02 },
    satin: { metalness: 0.35, roughness: 0.5, clearcoat: 0.25, clearcoatRoughness: 0.45 },
  }[finish];
  return new THREE.MeshPhysicalMaterial({ color, ...f });
}

export function materials(p: { paint: number; accent: number; finish: Finish; rim: number; caliper: number; accentFinish?: Finish }) {
  return {
    paint: paint(p.paint, p.finish),
    accent: paint(p.accent, p.accentFinish ?? (p.finish === 'satin' ? 'metallic' : p.finish)),
    glass: new THREE.MeshPhysicalMaterial({ color: 0x0a0e14, metalness: 0.3, roughness: 0.04, clearcoat: 1, clearcoatRoughness: 0.01 }),
    trim: new THREE.MeshPhysicalMaterial({ color: 0x0c0d0f, metalness: 0.2, roughness: 0.25, clearcoat: 0.8 }),
    carbon: new THREE.MeshPhysicalMaterial({ map: carbon(), metalness: 0.3, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.05 }),
    mesh: new THREE.MeshStandardMaterial({ color: 0x050607, roughness: 0.75, metalness: 0.2 }),
    lamp: new THREE.MeshPhysicalMaterial({ color: 0x15181d, metalness: 0.9, roughness: 0.12, clearcoat: 1 }),
    led: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xeaf3ff, emissiveIntensity: 3 }),
    tail: new THREE.MeshPhysicalMaterial({ color: 0x3a0306, metalness: 0.3, roughness: 0.15, clearcoat: 1 }),
    tailLed: new THREE.MeshStandardMaterial({ color: 0x660000, emissive: 0xff1018, emissiveIntensity: 3.2 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xe6e8ea, metalness: 1, roughness: 0.12 }),
    titanium: new THREE.MeshStandardMaterial({ color: 0x8c8f96, metalness: 1, roughness: 0.28 }),
    liner: new THREE.MeshStandardMaterial({ color: 0x040405, roughness: 0.95, side: THREE.DoubleSide }),
    rim: new THREE.MeshStandardMaterial({ color: p.rim, metalness: 0.9, roughness: 0.25 }),
    rimLip: new THREE.MeshStandardMaterial({ color: 0xd8dade, metalness: 1, roughness: 0.15 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x18191b, roughness: 0.88 }),
    disc: new THREE.MeshStandardMaterial({ map: discTex(), color: 0xb9bcc2, metalness: 0.85, roughness: 0.38 }),
    caliper: new THREE.MeshPhysicalMaterial({ color: p.caliper, metalness: 0.2, roughness: 0.35, clearcoat: 1 }),
  };
}
export type Mats = ReturnType<typeof materials>;

let discT: THREE.Texture | null = null;
function discTex() {
  // Cross-drilled, slotted brake disc face.
  discT ??= canvasTex(256, (c, s) => {
    c.fillStyle = '#c8cbd0';
    c.fillRect(0, 0, s, s);
    const cx = s / 2;
    c.fillStyle = '#3a3c40';
    c.beginPath(); c.arc(cx, cx, s * 0.24, 0, Math.PI * 2); c.fill(); // hat
    for (let i = 0; i < 36; i++) {
      const a = (i / 36) * Math.PI * 2;
      for (const rr of [0.33, 0.41]) {
        const r = s * (rr + ((i % 2) * 0.03));
        c.beginPath(); c.arc(cx + Math.cos(a) * r, cx + Math.sin(a) * r, s * 0.009, 0, Math.PI * 2); c.fill();
      }
      c.strokeStyle = 'rgba(60,60,64,0.6)';
      c.lineWidth = 2;
      c.beginPath();
      c.arc(cx, cx, s * 0.37, a, a + 0.12);
      c.stroke();
    }
  });
  discT.repeat.set(1, 1);
  return discT;
}

// ------------------------------------------------------------------ wheels

export type RimStyle = 'twin5' | 'ten' | 'y5' | 'forged7' | 'aero' | 'cross';

/** Spoke outline in (radial, tangential) coordinates. */
function spokeShape(r0: number, r1: number, w0: number, w1: number, curve = 0) {
  const s = new THREE.Shape();
  s.moveTo(r0, -w0 / 2);
  s.quadraticCurveTo((r0 + r1) / 2, -w1 / 2 + curve, r1, -w1 / 2 + curve * 1.4);
  s.lineTo(r1, w1 / 2 + curve * 1.4);
  s.quadraticCurveTo((r0 + r1) / 2, w0 / 2 + curve * 0.6, r0, w0 / 2);
  s.closePath();
  return s;
}

/** Turns a flat spoke (radial x, tangential y, depth z) into wheel space (axle = +X), at angle `a`, dished. */
function placeSpoke(g: THREE.BufferGeometry, a: number, face: number, dish = 0.16) {
  const m = new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1); // (sx,sy,sz) -> (sz, sx, sy)
  g.applyMatrix4(m);
  g.rotateZ(-dish); // outer end of the spoke sits further out: concave face
  g.translate(face, 0, 0);
  g.rotateX(a);
  return g;
}

function spokes(style: RimStyle, face: number) {
  const R = 0.262; // spokes end at the rim lip
  const parts: THREE.BufferGeometry[] = [];
  const ext = (shape: THREE.Shape) =>
    new THREE.ExtrudeGeometry(shape, { depth: 0.03, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.005, bevelSegments: 2, curveSegments: 6 });
  const n = { twin5: 5, ten: 10, y5: 5, forged7: 7, aero: 12, cross: 10 }[style];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    if (style === 'twin5') {
      for (const off of [-0.11, 0.11]) parts.push(placeSpoke(ext(spokeShape(0.075, R, 0.05, 0.03)), a + off, face));
    } else if (style === 'ten') {
      parts.push(placeSpoke(ext(spokeShape(0.075, R, 0.042, 0.03)), a, face));
    } else if (style === 'y5') {
      parts.push(placeSpoke(ext(spokeShape(0.075, 0.17, 0.06, 0.05)), a, face));
      for (const off of [-0.14, 0.14]) parts.push(placeSpoke(ext(spokeShape(0.155, R, 0.035, 0.03, off * 0.08)), a + off * 0.55, face));
    } else if (style === 'forged7') {
      parts.push(placeSpoke(ext(spokeShape(0.075, R, 0.065, 0.026, 0.035)), a, face, 0.22));
      parts.push(placeSpoke(ext(spokeShape(0.12, R, 0.016, 0.016, 0.03)), a + 0.22, face, 0.22));
    } else if (style === 'aero') {
      parts.push(placeSpoke(ext(spokeShape(0.08, R, 0.05, 0.05, 0.05)), a, face, 0.1));
    } else {
      for (const off of [-0.18, 0.18]) parts.push(placeSpoke(ext(spokeShape(0.08, R, 0.026, 0.022, off * 0.25)), a + off * 0.3, face, 0.12));
    }
  }
  return mergeGeometries(parts.map((g) => g.toNonIndexed()));
}

/** A complete performance wheel whose face points to +X. */
export function wheel(style: RimStyle, mats: Mats, centreLock = false) {
  const g = new THREE.Group();
  const R = WHEEL_R, W = WHEEL_W;
  // Tyre: low-profile with rounded shoulders.
  const tp = [
    [0.255, -W / 2 + 0.01], [0.3, -W / 2], [0.345, -W / 2 + 0.012], [R, -W / 2 + 0.04], [R, W / 2 - 0.04],
    [0.345, W / 2 - 0.012], [0.3, W / 2], [0.255, W / 2 - 0.01],
  ].map(([r, y]) => new THREE.Vector2(r, y));
  const tyre = new THREE.Mesh(new THREE.LatheGeometry(tp, 48).rotateZ(-Math.PI / 2), mats.tyre);
  tyre.name = 'Tyre';
  g.add(tyre);
  // Rim barrel + polished lip.
  const rp = [[0.262, W / 2 - 0.005], [0.25, W / 2 - 0.02], [0.245, -W / 2 + 0.03], [0.26, -W / 2 + 0.012]].map(([r, y]) => new THREE.Vector2(r, y));
  const barrel = new THREE.Mesh(new THREE.LatheGeometry(rp, 40).rotateZ(-Math.PI / 2), mats.rim);
  barrel.name = 'Rim_Barrel';
  g.add(barrel);
  const lip = new THREE.Mesh(new THREE.TorusGeometry(0.262, 0.009, 8, 48).rotateY(Math.PI / 2).translate(W / 2 - 0.006, 0, 0), mats.rimLip);
  lip.name = 'Rim_Lip';
  g.add(lip);
  const inner = new THREE.Mesh(new THREE.CircleGeometry(0.245, 40).rotateY(Math.PI / 2).translate(-W / 2 + 0.04, 0, 0), mats.liner);
  inner.name = 'Rim_Inner';
  g.add(inner);
  // Spokes and hub.
  const face = W / 2 - 0.085;
  const spk = new THREE.Mesh(spokes(style, face), mats.rim);
  spk.name = 'Rim_Spokes';
  g.add(spk);
  const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.08, 0.085, 0.05, 24).rotateZ(Math.PI / 2).translate(face + 0.01, 0, 0), mats.rim);
  hub.name = 'Hub';
  g.add(hub);
  const nut = centreLock
    ? new THREE.Mesh(new THREE.CylinderGeometry(0.042, 0.045, 0.05, 6).rotateZ(Math.PI / 2).translate(face + 0.045, 0, 0), mats.rimLip)
    : new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.03, 16).rotateZ(Math.PI / 2).translate(face + 0.035, 0, 0), mats.trim);
  nut.name = 'Centre_Nut';
  g.add(nut);
  if (!centreLock)
    for (let i = 0; i < 5; i++) {
      const a = (i / 5) * Math.PI * 2;
      const bolt = new THREE.Mesh(new THREE.CylinderGeometry(0.011, 0.011, 0.03, 8).rotateZ(Math.PI / 2).translate(face + 0.03, Math.cos(a) * 0.055, Math.sin(a) * 0.055), mats.rimLip);
      bolt.name = 'Wheel_Bolt';
      g.add(bolt);
    }
  // Brake disc behind the spokes, and the calliper gripping it (does not spin in the game).
  const disc = new THREE.Mesh(new THREE.CylinderGeometry(0.205, 0.205, 0.032, 48).rotateZ(Math.PI / 2).translate(face - 0.07, 0, 0), mats.disc);
  disc.name = 'Brake_Disc';
  // Put the drilled texture on the outer face.
  const cap = new THREE.Mesh(new THREE.CircleGeometry(0.205, 48).rotateY(Math.PI / 2).translate(face - 0.053, 0, 0), mats.disc);
  cap.name = 'Brake_Disc_Face';
  g.add(disc, cap);
  const cs = new THREE.Shape();
  const a0 = 0.55, a1 = 1.55, ri = 0.15, ro = 0.232;
  cs.absarc(0, 0, ro, a0, a1, false);
  cs.absarc(0, 0, ri, a1, a0, true);
  const cal = new THREE.Mesh(
    new THREE.ExtrudeGeometry(cs, { depth: 0.075, bevelEnabled: true, bevelThickness: 0.012, bevelSize: 0.012, bevelSegments: 3, curveSegments: 12 })
      .applyMatrix4(new THREE.Matrix4().set(0, 0, 1, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 1))
      .translate(face - 0.11, 0, 0),
    mats.caliper,
  );
  cal.name = 'Caliper';
  cal.userData.caliper = true; // steers with the wheel but does not spin
  g.add(cal);
  g.traverse((o) => ((o as THREE.Mesh).castShadow = true));
  return g;
}

// ------------------------------------------------------------------ aero and details

/** Aerofoil cross-section (chord along -Z from the leading edge at 0). */
function aerofoil(chord: number, thick: number) {
  const s = new THREE.Shape();
  const N = 16;
  const pts: [number, number][] = [];
  for (let i = 0; i <= N; i++) {
    const t = i / N;
    const yt = 5 * thick * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4);
    const camber = 0.06 * Math.sin(Math.PI * t);
    pts.push([t, camber + yt]);
  }
  for (let i = N; i >= 0; i--) {
    const t = i / N;
    const yt = 5 * thick * (0.2969 * Math.sqrt(t) - 0.126 * t - 0.3516 * t * t + 0.2843 * t ** 3 - 0.1036 * t ** 4);
    const camber = 0.06 * Math.sin(Math.PI * t);
    pts.push([t, camber - yt]);
  }
  s.moveTo(-pts[0][0] * chord, pts[0][1] * chord);
  for (const [x, y] of pts) s.lineTo(-x * chord, y * chord);
  return s;
}

/** Rear wing: aerofoil blade, end plates and swan-neck mounts (hang from the top of the blade). */
export function rearWing(o: { span: number; chord: number; y: number; z: number; deckY: number; mountX: number; angle: number; plateMat: THREE.Material; bladeMat: THREE.Material; mountMat: THREE.Material; plateH?: number }) {
  const g = new THREE.Group();
  const blade = new THREE.ExtrudeGeometry(aerofoil(o.chord, 0.1), { depth: o.span, bevelEnabled: false, curveSegments: 4, steps: 1 });
  blade.translate(0, 0, -o.span / 2);
  blade.rotateY(Math.PI / 2); // span along X, chord along -Z
  blade.rotateX(o.angle);
  blade.translate(0, o.y, o.z);
  g.add(new THREE.Mesh(blade, o.bladeMat));
  // End plates.
  const ph = o.plateH ?? 0.2;
  const ps = new THREE.Shape();
  ps.moveTo(0.05, -ph * 0.65); ps.lineTo(-o.chord - 0.06, -ph * 0.4); ps.lineTo(-o.chord - 0.04, ph * 0.55); ps.lineTo(0.02, ph * 0.25); ps.closePath();
  for (const side of [-1, 1]) {
    const plate = new THREE.ExtrudeGeometry(ps, { depth: 0.012, bevelEnabled: false });
    plate.rotateY(Math.PI / 2);
    plate.translate(side * (o.span / 2) - (side > 0 ? 0 : 0.012), o.y, o.z);
    g.add(new THREE.Mesh(plate, o.plateMat));
  }
  // Swan-neck mounts: rise from the deck behind the blade and curve over to its top.
  for (const side of [-1, 1]) {
    const path = new THREE.CatmullRomCurve3([
      new THREE.Vector3(0, o.deckY - 0.02, o.z + 0.14),
      new THREE.Vector3(0, (o.deckY + o.y) / 2 + 0.06, o.z + 0.1),
      new THREE.Vector3(0, o.y + 0.07, o.z - o.chord * 0.25),
      new THREE.Vector3(0, o.y + 0.03, o.z - o.chord * 0.55),
    ]);
    const mount = new THREE.Mesh(new THREE.TubeGeometry(path, 24, 0.016, 8, false), o.mountMat);
    mount.scale.x = 1.6; // flattened blade-like strut
    mount.position.x = side * o.mountX;
    g.add(mount);
  }
  return g;
}

export function mirror(x: number, y: number, z: number, capMat: THREE.Material, armMat: THREE.Material) {
  const g = new THREE.Group();
  const cap = new THREE.Mesh(new THREE.SphereGeometry(1, 20, 14).scale(0.075, 0.055, 0.12), capMat);
  cap.position.set(x + Math.sign(x) * 0.17, y + 0.05, z - 0.02);
  const glass = new THREE.Mesh(new THREE.CircleGeometry(1, 20).scale(0.065, 0.045, 1).rotateY(Math.PI), armMat);
  glass.position.set(cap.position.x, cap.position.y, cap.position.z - 0.105);
  const arm = new THREE.Mesh(new THREE.BoxGeometry(0.17, 0.018, 0.05), armMat);
  arm.position.set(x + Math.sign(x) * 0.085, y + 0.025, z);
  arm.rotation.z = Math.sign(x) * 0.3;
  g.add(cap, glass, arm);
  return g;
}

export function exhaust(x: number, y: number, z: number, r: number, mat: THREE.Material, inner: THREE.Material, sides = 24, len = 0.12) {
  const g = new THREE.Group();
  const tube = new THREE.Mesh(new THREE.CylinderGeometry(r, r * 0.95, len, sides, 1, true).rotateX(Math.PI / 2), mat);
  (tube.material as THREE.Material).side = THREE.DoubleSide;
  const back = new THREE.Mesh(new THREE.CircleGeometry(r * 0.96, sides).rotateY(Math.PI), inner);
  back.position.z = 0.03;
  g.add(tube, back);
  g.position.set(x, y, z);
  return g;
}

/** A flat plate from a plan-view outline (x,z points), given thickness, at height y. */
export function plate(outline: [number, number][], y: number, thick: number, mat: THREE.Material) {
  const s = new THREE.Shape(outline.map(([x, z]) => new THREE.Vector2(x, z)));
  const geo = new THREE.ExtrudeGeometry(s, { depth: thick, bevelEnabled: true, bevelThickness: 0.004, bevelSize: 0.004, bevelSegments: 1 });
  geo.rotateX(Math.PI / 2); // outline (x, z) lies flat; thickness goes downwards from y
  geo.translate(0, y, 0);
  const m = new THREE.Mesh(geo, mat);
  m.castShadow = true;
  return m;
}

/** White race-number roundel texture. */
export function numberTex(n: number) {
  const cv = document.createElement('canvas');
  cv.width = cv.height = 128;
  const c = cv.getContext('2d')!;
  c.fillStyle = '#f4f5f6';
  c.beginPath(); c.arc(64, 64, 58, 0, Math.PI * 2); c.fill();
  c.fillStyle = '#121314';
  c.font = 'bold 74px Arial, Helvetica, sans-serif';
  c.textAlign = 'center'; c.textBaseline = 'middle';
  c.fillText(String(n), 64, 70);
  const t = new THREE.CanvasTexture(cv);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}
