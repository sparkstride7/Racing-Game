import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { seededRandom } from '../../utils/math';
import { createPitBuildingTexture } from '../textures';

/**
 * Trackside scenery. Everything here is decoration behind the barriers, so it has no physics.
 * Similar objects are merged or instanced so each kind costs only one draw call.
 */

/** A covered grandstand full of spectators. Faces +X in its own space; place and rotate it as needed. */
export function createGrandstand(length: number, tiers = 6) {
  const group = new THREE.Group();
  const stepDepth = 2.2;
  const stepRise = 0.9;

  const steps: THREE.BufferGeometry[] = [];
  const people: THREE.BufferGeometry[] = [];
  for (let i = 0; i < tiers; i++) {
    const h = 1 + i * stepRise;
    steps.push(new THREE.BoxGeometry(stepDepth, h, length).translate(-i * stepDepth, h / 2, 0));
    people.push(
      new THREE.PlaneGeometry(length, 1.1)
        .rotateY(Math.PI / 2)
        .translate(-i * stepDepth + 0.4, h + 0.55, 0),
    );
  }
  const concrete = new THREE.Mesh(
    mergeGeometries(steps),
    new THREE.MeshStandardMaterial({ color: 0xb8b4ac, roughness: 0.9 }),
  );
  concrete.castShadow = true;
  concrete.receiveShadow = true;
  group.add(concrete);

  const crowd = new THREE.Mesh(
    mergeGeometries(people),
    new THREE.MeshStandardMaterial({ map: createCrowdTexture(length), roughness: 0.9, alphaTest: 0.5 }),
  );
  group.add(crowd);

  const roofHeight = 1 + tiers * stepRise + 3.6;
  const roof = new THREE.Mesh(
    new THREE.BoxGeometry(tiers * stepDepth + 3, 0.4, length + 4),
    new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.2, roughness: 0.5 }),
  );
  roof.position.set(-(tiers - 1) * (stepDepth / 2) + 0.5, roofHeight, 0);
  roof.rotation.z = -0.08;
  roof.castShadow = true;
  group.add(roof);

  // Roof supports at the back.
  const pillars: THREE.BufferGeometry[] = [];
  for (let z = -length / 2; z <= length / 2; z += length / 6) {
    pillars.push(new THREE.BoxGeometry(0.35, roofHeight, 0.35).translate(-(tiers - 1) * stepDepth - 0.8, roofHeight / 2, z));
  }
  const pillarMesh = new THREE.Mesh(
    mergeGeometries(pillars),
    new THREE.MeshStandardMaterial({ color: 0x8a8f98, metalness: 0.5, roughness: 0.5 }),
  );
  pillarMesh.castShadow = true;
  group.add(pillarMesh);
  return group;
}

/** Pit building with garages. Faces +X in its own space. */
export function createPitBuilding(length: number) {
  const depth = 12;
  const height = 7;
  const front = createPitBuildingTexture();
  front.repeat.set(length / 10, 1);
  const plain = new THREE.MeshStandardMaterial({ color: 0xe4e6ea, roughness: 0.7 });
  const facade = new THREE.MeshStandardMaterial({ map: front, roughness: 0.6 });
  // Box faces: +x, -x, +y, -y, +z, -z. Only the track-facing side gets the garage texture.
  const building = new THREE.Mesh(new THREE.BoxGeometry(depth, height, length), [facade, plain, plain, plain, plain, plain]);
  building.position.set(-depth / 2, height / 2, 0);
  building.castShadow = true;
  building.receiveShadow = true;

  const canopy = new THREE.Mesh(
    new THREE.BoxGeometry(3, 0.3, length),
    new THREE.MeshStandardMaterial({ color: 0x1b1f27, roughness: 0.5 }),
  );
  canopy.position.set(1.5, height * 0.52, 0);
  canopy.castShadow = true;

  const group = new THREE.Group();
  group.add(building, canopy);
  return group;
}

/**
 * Forest of low-poly trees (pines and round trees), drawn with instancing.
 * `isFree` decides whether a tree may stand at a spot.
 */
export function createTrees(area: THREE.Box3, count: number, isFree: (p: THREE.Vector3) => boolean, seed = 2024) {
  const rand = seededRandom(seed);
  const positions: THREE.Vector3[] = [];

  // Trees grow in clumps: pick clump centres, then scatter trees around them.
  let attempts = 0;
  while (positions.length < count && attempts < count * 30) {
    attempts++;
    const centre = new THREE.Vector3(
      THREE.MathUtils.lerp(area.min.x, area.max.x, rand()),
      0,
      THREE.MathUtils.lerp(area.min.z, area.max.z, rand()),
    );
    const clump = 1 + Math.floor(rand() * 7);
    for (let k = 0; k < clump && positions.length < count; k++) {
      const angle = rand() * Math.PI * 2;
      const r = rand() * 22;
      const p = centre.clone().add(new THREE.Vector3(Math.cos(angle) * r, 0, Math.sin(angle) * r));
      if (isFree(p)) positions.push(p);
    }
  }

  const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6).translate(0, 1.2, 0);
  const pineGeo = mergeGeometries([
    new THREE.ConeGeometry(1.9, 3.2, 7).translate(0, 3.2, 0),
    new THREE.ConeGeometry(1.5, 2.8, 7).translate(0, 4.6, 0),
    new THREE.ConeGeometry(1.0, 2.2, 7).translate(0, 5.9, 0),
  ]);
  const roundGeo = new THREE.IcosahedronGeometry(2.2, 1).translate(0, 4, 0);
  const trunkMat = new THREE.MeshStandardMaterial({ color: 0x5a4030, roughness: 1 });
  const leafMat = new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.9, flatShading: true });

  const trunks = new THREE.InstancedMesh(trunkGeo, trunkMat, positions.length);
  const pines = new THREE.InstancedMesh(pineGeo, leafMat, positions.length);
  const rounds = new THREE.InstancedMesh(roundGeo, leafMat, positions.length);
  let pineCount = 0;
  let roundCount = 0;

  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const color = new THREE.Color();
  positions.forEach((p, i) => {
    s.setScalar(0.8 + rand() * 0.9);
    q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rand() * Math.PI * 2);
    m.compose(p, q, s);
    trunks.setMatrixAt(i, m);
    if (rand() < 0.55) {
      color.setHSL(0.3 + rand() * 0.05, 0.45, 0.2 + rand() * 0.08, THREE.SRGBColorSpace);
      pines.setMatrixAt(pineCount, m);
      pines.setColorAt(pineCount++, color);
    } else {
      color.setHSL(0.22 + rand() * 0.08, 0.5, 0.28 + rand() * 0.1, THREE.SRGBColorSpace);
      rounds.setMatrixAt(roundCount, m);
      rounds.setColorAt(roundCount++, color);
    }
  });
  pines.count = pineCount;
  rounds.count = roundCount;

  const group = new THREE.Group();
  for (const mesh of [trunks, pines, rounds]) {
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    // Instances are spread over the whole map; skip per-mesh culling (the bounds would always be visible anyway).
    mesh.frustumCulled = false;
    group.add(mesh);
  }
  return group;
}

/** A ring of distant hills on the horizon (one merged mesh). */
export function createHills(center: THREE.Vector3, minDistance: number, seed = 77) {
  const rand = seededRandom(seed);
  const hills: THREE.BufferGeometry[] = [];
  const count = 28;
  for (let i = 0; i < count; i++) {
    const angle = (i / count) * Math.PI * 2 + rand() * 0.2;
    const distance = minDistance + rand() * 350;
    const radius = 180 + rand() * 220;
    const height = 90 + rand() * 170;
    hills.push(
      new THREE.ConeGeometry(radius, height, 7, 1)
        .rotateY(rand() * Math.PI)
        .translate(center.x + Math.cos(angle) * distance, height / 2 - 10, center.z + Math.sin(angle) * distance),
    );
  }
  return new THREE.Mesh(
    mergeGeometries(hills),
    new THREE.MeshStandardMaterial({ color: 0x5d7552, roughness: 1, flatShading: true }),
  );
}

function createCrowdTexture(length: number) {
  const canvas = document.createElement('canvas');
  canvas.width = 1024;
  canvas.height = 64;
  const ctx = canvas.getContext('2d')!;
  const rand = seededRandom(5);
  const shirts = ['#e94b3c', '#f4d35e', '#3a86ff', '#ffffff', '#2ec4b6', '#ff9f1c', '#9b5de5', '#1d3557', '#e3262f'];
  const skins = ['#f1c7a5', '#d9a07b', '#a86f4c', '#6b4429', '#f6d7c3'];
  const hair = ['#2b1d14', '#5a3a22', '#111111', '#c49a5a', '#7a7a7a'];
  for (let x = 4; x < canvas.width; x += 11 + rand() * 4) {
    const cx = x + rand() * 3;
    const top = 18 + rand() * 8;
    const shirt = shirts[Math.floor(rand() * shirts.length)];
    ctx.fillStyle = shirt;
    ctx.beginPath();
    ctx.roundRect(cx - 5, top + 11, 10, 64 - top, 4);
    ctx.fill();
    ctx.fillStyle = skins[Math.floor(rand() * skins.length)];
    ctx.beginPath();
    ctx.arc(cx, top + 5, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hair[Math.floor(rand() * hair.length)];
    ctx.beginPath();
    ctx.arc(cx, top + 3.5, 4.6, Math.PI, 0);
    ctx.fill();
    if (rand() < 0.15) {
      ctx.fillStyle = shirt; // a waving arm
      ctx.fillRect(cx + 4, top - 6, 2.5, 18);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(Math.max(1, Math.round(length / 28)), 1);
  return texture;
}
