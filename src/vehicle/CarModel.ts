import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { CAR } from '../config';

/**
 * A sports car built entirely from code (no downloaded art), so it is 100% original.
 * Later we can swap it for a detailed 3D model file.
 *
 * Model space: ground is y = 0, the car faces +Z, and wheel centres are at y = wheelRadius.
 *
 * Performance: all parts that share a material are merged into one mesh, so a whole car
 * is drawn in about 20 draw calls instead of about 70. That matters with six cars on an iPhone.
 */

export interface WheelModel {
  /** Positioned at the wheel centre; rotates for steering. */
  pivot: THREE.Group;
  /** Child of pivot; rotates as the wheel rolls. */
  spin: THREE.Group;
}

export interface CarModel {
  body: THREE.Group;
  wheels: WheelModel[];
}

/** How a car looks. Every opponent gets its own style. */
export interface CarStyle {
  paint: number;
  /** Mirrors and wing end plates. */
  accent: number;
  wing: 'gt' | 'ducktail' | 'none';
  rim: number;
  caliper: number;
  finish: 'metallic' | 'gloss' | 'matte';
  /** Race number shown on the roof and doors (none for the player's car). */
  number?: number;
}

/** The player's original car. */
export const PLAYER_STYLE: CarStyle = {
  paint: 0xe3262f,
  accent: 0xe3262f,
  wing: 'gt',
  rim: 0xb9bec6,
  caliper: 0xf5c400,
  finish: 'metallic',
};

/**
 * How far the physics body's origin sits above the ground when the car is at rest
 * (wheel radius + resting suspension length). Used to line the model up with the physics.
 */
export const MODEL_GROUND_OFFSET = CAR.wheelRadius + 0.215;

const BODY_WIDTH = 1.84;
const ARCH_RADIUS = 0.45;

type BodyPart = 'paint' | 'glass' | 'trim' | 'chrome' | 'headlight' | 'taillight' | 'accent';
type WheelPart = 'tyre' | 'rimDark' | 'rim';

export function createCarModel(style: CarStyle = PLAYER_STYLE): CarModel {
  const materials = createMaterials(style);
  const body = new THREE.Group();
  body.name = 'car-body';

  for (const [part, geometry] of Object.entries(getBodyGeometries(style.wing)) as [BodyPart, THREE.BufferGeometry][]) {
    const mesh = new THREE.Mesh(geometry, materials[part]);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
  }
  if (style.number !== undefined) body.add(createNumberDecals(style.number));

  // --- Wheels. ---
  const wheelGeometries = getWheelGeometries();
  const caliperGeometry = new THREE.BoxGeometry(0.08, 0.14, 0.2);
  const wheels: WheelModel[] = [];
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    const spin = new THREE.Group();
    pivot.add(spin);
    const isLeftSide = i % 2 === 0; // +X is the car's left side when it faces +Z
    const parts = isLeftSide ? wheelGeometries.left : wheelGeometries.right;
    for (const [part, geometry] of Object.entries(parts) as [WheelPart, THREE.BufferGeometry][]) {
      const mesh = new THREE.Mesh(geometry, materials[part]);
      mesh.castShadow = part !== 'rimDark';
      spin.add(mesh);
    }
    // Brake caliper: attached to the pivot so it steers but does not spin.
    const caliper = new THREE.Mesh(caliperGeometry, materials.caliper);
    caliper.position.set((isLeftSide ? 1 : -1) * 0.06, 0.13, -0.08);
    pivot.add(caliper);
    wheels.push({ pivot, spin });
  }

  return { body, wheels };
}

function createMaterials(style: CarStyle) {
  const finish = {
    metallic: { metalness: 0.55, roughness: 0.32, clearcoat: 1, clearcoatRoughness: 0.06 },
    gloss: { metalness: 0.1, roughness: 0.25, clearcoat: 1, clearcoatRoughness: 0.04 },
    matte: { metalness: 0.2, roughness: 0.62, clearcoat: 0.2, clearcoatRoughness: 0.5 },
  }[style.finish];
  return {
    paint: new THREE.MeshPhysicalMaterial({ color: style.paint, ...finish }),
    accent: new THREE.MeshPhysicalMaterial({ color: style.accent, ...finish }),
    glass: new THREE.MeshPhysicalMaterial({
      color: 0x0d141c,
      metalness: 0.4,
      roughness: 0.05,
      clearcoat: 1,
      clearcoatRoughness: 0.02,
    }),
    trim: new THREE.MeshStandardMaterial({ color: 0x15171a, metalness: 0.3, roughness: 0.55 }),
    chrome: new THREE.MeshStandardMaterial({ color: 0xdddddd, metalness: 1, roughness: 0.15 }),
    headlight: new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f4ff, emissiveIntensity: 2.2 }),
    taillight: new THREE.MeshStandardMaterial({ color: 0x550000, emissive: 0xff1a1a, emissiveIntensity: 2.0 }),
    tyre: new THREE.MeshStandardMaterial({ color: 0x1a1a1a, roughness: 0.92, metalness: 0 }),
    rim: new THREE.MeshStandardMaterial({ color: style.rim, metalness: 0.95, roughness: 0.22 }),
    rimDark: new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.6, roughness: 0.4 }),
    caliper: new THREE.MeshStandardMaterial({ color: style.caliper, metalness: 0.3, roughness: 0.4 }),
  };
}

// ------------------------------------------------------------------ Body (built once per wing type, shared by all cars)

const bodyCache = new Map<CarStyle['wing'], Record<BodyPart, THREE.BufferGeometry>>();

function getBodyGeometries(wing: CarStyle['wing']) {
  const cached = bodyCache.get(wing);
  if (cached) return cached;

  const parts: Record<BodyPart, THREE.BufferGeometry[]> = {
    paint: [],
    glass: [],
    trim: [],
    chrome: [],
    headlight: [],
    taillight: [],
    accent: [],
  };
  const add = (part: BodyPart, geometry: THREE.BufferGeometry, x = 0, y = 0, z = 0, rotateX = 0) => {
    if (rotateX) geometry.rotateX(rotateX);
    parts[part].push(geometry.translate(x, y, z));
  };

  // Main body: a side profile with wheel arches, extruded across the car's width.
  add('paint', createBodyGeometry());
  add('glass', createCabinGeometry());

  // Dark lower trim: splitter, side skirts, diffuser.
  add('trim', new THREE.BoxGeometry(1.7, 0.05, 0.35), 0, 0.2, 2.05);
  for (const side of [-1, 1]) {
    add('trim', new THREE.BoxGeometry(0.06, 0.12, 1.55), side * (BODY_WIDTH / 2 + 0.01), 0.3, 0.02);
  }
  add('trim', new THREE.BoxGeometry(1.5, 0.16, 0.3), 0, 0.3, -2.22);

  // Rear wing.
  if (wing === 'gt') {
    add('trim', new THREE.BoxGeometry(1.76, 0.05, 0.34), 0, 1.13, -1.95);
    for (const side of [-1, 1]) {
      add('trim', new THREE.BoxGeometry(0.05, 0.22, 0.14), side * 0.55, 1.0, -1.93);
      add('accent', new THREE.BoxGeometry(0.03, 0.18, 0.42), side * 0.89, 1.15, -1.95);
    }
  } else if (wing === 'ducktail') {
    add('accent', new THREE.BoxGeometry(1.7, 0.06, 0.3), 0, 0.96, -2.1, -0.25);
  }

  // Lights.
  for (const side of [-1, 1]) {
    add('headlight', new THREE.BoxGeometry(0.42, 0.08, 0.24), side * 0.6, 0.6, 2.15, 0.45);
    add('taillight', new THREE.BoxGeometry(0.5, 0.09, 0.04), side * 0.55, 0.74, -2.34);
  }
  add('taillight', new THREE.BoxGeometry(0.6, 0.04, 0.03), 0, 0.74, -2.34);
  // Black rear panel between the lights and the diffuser.
  add('trim', new THREE.BoxGeometry(1.4, 0.16, 0.03), 0, 0.55, -2.34);

  // Grille, exhausts, mirrors.
  add('trim', new THREE.BoxGeometry(0.9, 0.14, 0.05), 0, 0.38, 2.33);
  for (const side of [-1, 1]) {
    add('chrome', new THREE.CylinderGeometry(0.06, 0.06, 0.16, 16), side * 0.42, 0.3, -2.36, Math.PI / 2);
    add('accent', new THREE.BoxGeometry(0.16, 0.08, 0.12), side * 0.86, 0.98, 0.72);
  }

  const merged = {} as Record<BodyPart, THREE.BufferGeometry>;
  for (const part of Object.keys(parts) as BodyPart[]) {
    if (parts[part].length) merged[part] = mergeAll(parts[part]);
  }
  bodyCache.set(wing, merged);
  return merged;
}

/** Side profile of the car (x = forward, y = up), with cut-outs for the wheels. */
function createBodyGeometry() {
  const s = new THREE.Shape();
  const fz = CAR.frontAxleZ;
  const rz = CAR.rearAxleZ;
  const wy = CAR.wheelRadius;

  // Start at the bottom of the nose and go round the car anticlockwise (rearwards along the bottom).
  s.moveTo(2.2, 0.26);
  s.lineTo(fz + ARCH_RADIUS, 0.24);
  s.absarc(fz, wy, ARCH_RADIUS, -0.27, Math.PI + 0.27, false); // front wheel arch
  s.lineTo(rz + ARCH_RADIUS, 0.24);
  s.absarc(rz, wy, ARCH_RADIUS, -0.27, Math.PI + 0.27, false); // rear wheel arch
  s.lineTo(-2.2, 0.26);
  // Rear end.
  s.lineTo(-2.28, 0.48);
  s.lineTo(-2.27, 0.8);
  s.lineTo(-2.12, 0.9);
  // Top line: rear deck, under the cabin, bonnet, nose.
  s.lineTo(-1.25, 0.93);
  s.lineTo(0.95, 0.9);
  s.quadraticCurveTo(1.7, 0.82, 2.18, 0.6);
  s.quadraticCurveTo(2.32, 0.52, 2.3, 0.4);
  s.lineTo(2.2, 0.26);

  return extrudeProfile(s, BODY_WIDTH, 0.07);
}

function createCabinGeometry() {
  const s = new THREE.Shape();
  s.moveTo(-1.35, 0.88);
  s.quadraticCurveTo(-0.9, 1.18, -0.45, 1.27);
  s.lineTo(0.2, 1.28);
  s.quadraticCurveTo(0.6, 1.2, 1.05, 0.88);
  s.lineTo(-1.35, 0.88);
  return extrudeProfile(s, 1.42, 0.1);
}

/** Extrudes a side profile across the car's width and turns it to face +Z. */
function extrudeProfile(shape: THREE.Shape, width: number, bevel: number) {
  const geometry = new THREE.ExtrudeGeometry(shape, {
    depth: width - bevel * 2,
    bevelEnabled: true,
    bevelThickness: bevel,
    bevelSize: bevel * 0.8,
    bevelSegments: 4,
    curveSegments: 24,
  });
  geometry.translate(0, 0, -(width - bevel * 2) / 2);
  geometry.rotateY(-Math.PI / 2); // profile's x → world z, extrusion → world x
  geometry.computeVertexNormals();
  return geometry;
}

// ------------------------------------------------------------------ Wheels (built once, shared by all cars)

let wheelCache: { left: Record<WheelPart, THREE.BufferGeometry>; right: Record<WheelPart, THREE.BufferGeometry> } | null = null;

function getWheelGeometries() {
  if (wheelCache) return wheelCache;
  const left = createWheelGeometries();
  // Wheels on the other side are mirrored so their face points outwards.
  const right = {} as Record<WheelPart, THREE.BufferGeometry>;
  for (const part of Object.keys(left) as WheelPart[]) right[part] = left[part].clone().rotateY(Math.PI);
  wheelCache = { left, right };
  return wheelCache;
}

/** A wheel whose outer face points towards +X, split by material. */
function createWheelGeometries(): Record<WheelPart, THREE.BufferGeometry> {
  const r = CAR.wheelRadius;
  const w = CAR.wheelWidth;

  // Tyre: a rounded profile spun around the axle.
  const profile = [
    new THREE.Vector2(r * 0.68, -w / 2),
    new THREE.Vector2(r * 0.9, -w / 2),
    new THREE.Vector2(r * 0.98, -w / 2 + 0.03),
    new THREE.Vector2(r, -w / 2 + 0.07),
    new THREE.Vector2(r, w / 2 - 0.07),
    new THREE.Vector2(r * 0.98, w / 2 - 0.03),
    new THREE.Vector2(r * 0.9, w / 2),
    new THREE.Vector2(r * 0.68, w / 2),
  ];
  const tyre = new THREE.LatheGeometry(profile, 36).rotateZ(-Math.PI / 2); // spin axis Y → X

  // Rim: dark inner barrel + five metal spokes + centre cap, on the outer face.
  const rimDark = mergeAll([
    new THREE.CylinderGeometry(r * 0.69, r * 0.69, w * 0.9, 28, 1, true).rotateZ(Math.PI / 2),
    new THREE.CircleGeometry(r * 0.69, 28).rotateY(Math.PI / 2).translate(-0.02, 0, 0),
  ]);
  const rimParts: THREE.BufferGeometry[] = [new THREE.TorusGeometry(r * 0.66, 0.018, 8, 36).rotateY(Math.PI / 2).translate(w / 2 - 0.02, 0, 0)];
  for (let i = 0; i < 5; i++) {
    rimParts.push(
      new THREE.BoxGeometry(0.04, r * 0.62, 0.06)
        .translate(0, r * 0.31, 0)
        .rotateX((i / 5) * Math.PI * 2)
        .translate(w / 2 - 0.05, 0, 0),
    );
  }
  rimParts.push(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16).rotateZ(Math.PI / 2).translate(w / 2 - 0.04, 0, 0));

  return { tyre, rimDark, rim: mergeAll(rimParts) };
}

// ------------------------------------------------------------------ Race numbers

/** White roundels with the car's number on the roof and both doors (one mesh). */
function createNumberDecals(number: number) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.arc(64, 64, 60, 0, Math.PI * 2);
  ctx.fill();
  ctx.fillStyle = '#111111';
  ctx.font = 'bold 76px Arial, Helvetica, sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(String(number), 64, 70);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;

  const geometry = mergeAll([
    new THREE.PlaneGeometry(0.62, 0.62).rotateX(-Math.PI / 2).rotateY(Math.PI / 2).translate(0, 1.372, -0.15),
    new THREE.PlaneGeometry(0.5, 0.5).rotateY(Math.PI / 2).translate(BODY_WIDTH / 2 + 0.012, 0.6, -0.05),
    new THREE.PlaneGeometry(0.5, 0.5).rotateY(-Math.PI / 2).translate(-BODY_WIDTH / 2 - 0.012, 0.6, -0.05),
  ]);
  const decals = new THREE.Mesh(
    geometry,
    new THREE.MeshStandardMaterial({
      map: texture,
      alphaTest: 0.5,
      roughness: 0.4,
      polygonOffset: true,
      polygonOffsetFactor: -2,
      polygonOffsetUnits: -2,
    }),
  );
  return decals;
}

/** Merges geometries, converting them all to the same (non-indexed) layout first. */
function mergeAll(geometries: THREE.BufferGeometry[]) {
  const prepared = geometries.map((g) => {
    const flat = g.index ? g.toNonIndexed() : g;
    for (const name of Object.keys(flat.attributes)) {
      if (name !== 'position' && name !== 'normal' && name !== 'uv') flat.deleteAttribute(name);
    }
    return flat;
  });
  return mergeGeometries(prepared);
}
