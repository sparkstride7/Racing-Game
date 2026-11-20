import * as THREE from 'three';
import { CAR } from '../config';

/**
 * A placeholder sports car built entirely from code (no downloaded art),
 * so it is 100% original. Later we can swap it for a detailed 3D model file.
 *
 * Model space: ground is y = 0, the car faces +Z, and wheel centres are at y = wheelRadius.
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

/**
 * How far the physics body's origin sits above the ground when the car is at rest
 * (wheel radius + resting suspension length). Used to line the model up with the physics.
 */
export const MODEL_GROUND_OFFSET = CAR.wheelRadius + 0.215;

const BODY_WIDTH = 1.84;
const ARCH_RADIUS = 0.45;

export function createCarModel(paintColor: number): CarModel {
  const materials = createMaterials(paintColor);
  const body = new THREE.Group();
  body.name = 'car-body';

  const add = (geometry: THREE.BufferGeometry, material: THREE.Material, x = 0, y = 0, z = 0) => {
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    body.add(mesh);
    return mesh;
  };

  // --- Main body: a side profile with wheel arches, extruded across the car's width. ---
  add(createBodyGeometry(), materials.paint);

  // --- Glass cabin. ---
  add(createCabinGeometry(), materials.glass);

  // --- Dark lower trim: splitter, side skirts, diffuser. ---
  add(new THREE.BoxGeometry(1.7, 0.05, 0.35), materials.trim, 0, 0.2, 2.05);
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.06, 0.12, 1.55), materials.trim, side * (BODY_WIDTH / 2 + 0.01), 0.3, 0.02);
  }
  add(new THREE.BoxGeometry(1.5, 0.16, 0.3), materials.trim, 0, 0.3, -2.22);

  // --- Rear wing. ---
  add(new THREE.BoxGeometry(1.76, 0.05, 0.34), materials.trim, 0, 1.13, -1.95);
  for (const side of [-1, 1]) {
    add(new THREE.BoxGeometry(0.05, 0.22, 0.14), materials.trim, side * 0.55, 1.0, -1.93);
    add(new THREE.BoxGeometry(0.03, 0.18, 0.42), materials.paint, side * 0.89, 1.15, -1.95);
  }

  // --- Lights. ---
  for (const side of [-1, 1]) {
    const head = add(new THREE.BoxGeometry(0.42, 0.08, 0.24), materials.headlight, side * 0.6, 0.6, 2.15);
    head.rotation.x = 0.45;
    add(new THREE.BoxGeometry(0.5, 0.09, 0.04), materials.taillight, side * 0.55, 0.74, -2.34);
  }
  add(new THREE.BoxGeometry(0.6, 0.04, 0.03), materials.taillight, 0, 0.74, -2.34);
  // Black rear panel between the lights and the diffuser.
  add(new THREE.BoxGeometry(1.4, 0.16, 0.03), materials.trim, 0, 0.55, -2.34);

  // --- Grille, exhausts, mirrors. ---
  add(new THREE.BoxGeometry(0.9, 0.14, 0.05), materials.trim, 0, 0.38, 2.33);
  for (const side of [-1, 1]) {
    const exhaust = add(new THREE.CylinderGeometry(0.06, 0.06, 0.16, 16), materials.chrome, side * 0.42, 0.3, -2.36);
    exhaust.rotation.x = Math.PI / 2;
    add(new THREE.BoxGeometry(0.16, 0.08, 0.12), materials.paint, side * 0.86, 0.98, 0.72);
  }

  // --- Wheels. ---
  const wheels: WheelModel[] = [];
  for (let i = 0; i < 4; i++) {
    const pivot = new THREE.Group();
    const spin = new THREE.Group();
    pivot.add(spin);
    const isLeftSide = i % 2 === 0; // +X is the car's left side when it faces +Z
    const wheel = createWheel(materials);
    // Each wheel is built with its face pointing +X; flip the ones on the other side.
    if (!isLeftSide) wheel.rotation.y = Math.PI;
    spin.add(wheel);

    // Brake caliper: attached to the pivot so it steers but does not spin.
    const caliper = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.14, 0.2), materials.caliper);
    caliper.position.set((isLeftSide ? 1 : -1) * 0.06, 0.13, -0.08);
    pivot.add(caliper);

    wheels.push({ pivot, spin });
  }

  return { body, wheels };
}

function createMaterials(paintColor: number) {
  return {
    paint: new THREE.MeshPhysicalMaterial({
      color: paintColor,
      metalness: 0.55,
      roughness: 0.32,
      clearcoat: 1,
      clearcoatRoughness: 0.06,
    }),
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
    rim: new THREE.MeshStandardMaterial({ color: 0xb9bec6, metalness: 0.95, roughness: 0.22 }),
    rimDark: new THREE.MeshStandardMaterial({ color: 0x2a2d31, metalness: 0.6, roughness: 0.4 }),
    caliper: new THREE.MeshStandardMaterial({ color: 0xf5c400, metalness: 0.3, roughness: 0.4 }),
  };
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

/** A wheel whose outer face points towards +X. */
function createWheel(materials: ReturnType<typeof createMaterials>) {
  const wheel = new THREE.Group();
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
  const tyreGeometry = new THREE.LatheGeometry(profile, 36);
  tyreGeometry.rotateZ(-Math.PI / 2); // spin axis Y → X
  const tyre = new THREE.Mesh(tyreGeometry, materials.tyre);
  tyre.castShadow = true;
  wheel.add(tyre);

  // Rim: dark inner barrel + five metal spokes + centre cap, on the outer face.
  const barrel = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.69, r * 0.69, w * 0.9, 28, 1, true), materials.rimDark);
  barrel.rotation.z = Math.PI / 2;
  wheel.add(barrel);
  const back = new THREE.Mesh(new THREE.CircleGeometry(r * 0.69, 28), materials.rimDark);
  back.rotation.y = Math.PI / 2;
  back.position.x = -0.02;
  wheel.add(back);

  const lip = new THREE.Mesh(new THREE.TorusGeometry(r * 0.66, 0.018, 8, 36), materials.rim);
  lip.rotation.y = Math.PI / 2;
  lip.position.x = w / 2 - 0.02;
  wheel.add(lip);

  for (let i = 0; i < 5; i++) {
    const spoke = new THREE.Mesh(new THREE.BoxGeometry(0.04, r * 0.62, 0.06), materials.rim);
    spoke.position.set(w / 2 - 0.05, 0, 0);
    spoke.geometry.translate(0, r * 0.31, 0);
    spoke.rotation.x = (i / 5) * Math.PI * 2;
    spoke.castShadow = true;
    wheel.add(spoke);
  }
  const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.06, 0.05, 16), materials.rim);
  cap.rotation.z = Math.PI / 2;
  cap.position.x = w / 2 - 0.04;
  wheel.add(cap);

  return wheel;
}
