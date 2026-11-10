import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '@dimforge/rapier3d-compat';
import { TRACK } from '../config';
import { seededRandom } from '../utils/math';
import {
  createAsphaltTexture,
  createCheckerTexture,
  createCurbTexture,
  createGrassTexture,
} from './textures';

/**
 * The first test track: a closed circuit of about 1.4 km on flat grassland,
 * with kerbs, a start/finish gantry, a grandstand, trees and distant hills.
 *
 * Later, each real track will be its own file following the same pattern.
 */

/** The centre line of the circuit, as (x, z) points in metres. Driven in this order. */
const CENTER_LINE: [number, number][] = [
  [0, -120],
  [0, 120],
  [30, 190],
  [110, 210],
  [170, 160],
  [160, 80],
  [110, 40],
  [130, -30],
  [200, -60],
  [210, -150],
  [150, -210],
  [60, -220],
  [15, -180],
];

/** How far along the lap (0..1) the start line is. */
const START_LINE_U = 0.06;

interface TrackSample {
  point: THREE.Vector3;
  /** Unit vector pointing to the left of the driving direction. */
  left: THREE.Vector3;
  distance: number;
}

export class TestTrack {
  readonly group = new THREE.Group();
  readonly spawnPosition = new THREE.Vector3();
  /** Rotation around the vertical axis for a car on the grid. */
  spawnHeading = 0;
  readonly length: number;

  private readonly samples: TrackSample[];
  private readonly rand = seededRandom(2024);

  constructor(scene: THREE.Scene, private readonly world: World) {
    const curve = new THREE.CatmullRomCurve3(
      CENTER_LINE.map(([x, z]) => new THREE.Vector3(x, 0, z)),
      true,
      'centripetal',
    );
    this.length = curve.getLength();
    this.samples = sampleCurve(curve, Math.round(this.length / 2));

    this.buildGround();
    this.buildRoad();
    this.buildStartLine(curve);
    this.buildGrandstand();
    this.buildTrees();
    this.buildHills();
    this.buildBoundaryWalls();

    scene.add(this.group);
  }

  private buildGround() {
    const grass = createGrassTexture();
    grass.repeat.set(400, 400);
    const ground = new THREE.Mesh(
      new THREE.PlaneGeometry(4800, 4800).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: grass, roughness: 1, metalness: 0 }),
    );
    ground.receiveShadow = true;
    this.group.add(ground);

    // Physics: one big flat box. The road is flat too, so the ground handles all wheel contact.
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(2400, 1, 2400).setTranslation(0, -1, 0).setFriction(1),
    );
  }

  private buildRoad() {
    const half = TRACK.width / 2;

    const asphalt = createAsphaltTexture();
    const road = new THREE.Mesh(
      buildRibbon(this.samples, -half, half, 0.02, TRACK.width),
      new THREE.MeshStandardMaterial({
        map: asphalt,
        roughness: 0.88,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    road.receiveShadow = true;
    this.group.add(road);

    const curbMaterial = new THREE.MeshStandardMaterial({
      map: createCurbTexture(),
      roughness: 0.7,
      polygonOffset: true,
      polygonOffsetFactor: -3,
      polygonOffsetUnits: -3,
    });
    for (const side of [-1, 1]) {
      const inner = side * half;
      const outer = side * (half + TRACK.curbWidth);
      const curb = new THREE.Mesh(
        buildRibbon(this.samples, Math.min(inner, outer), Math.max(inner, outer), 0.04, 4),
        curbMaterial,
      );
      curb.receiveShadow = true;
      this.group.add(curb);
    }
  }

  private buildStartLine(curve: THREE.CatmullRomCurve3) {
    const point = curve.getPointAt(START_LINE_U);
    const tangent = curve.getTangentAt(START_LINE_U).setY(0).normalize();
    const heading = Math.atan2(tangent.x, tangent.z);

    // Cars start 12 m behind the line.
    this.spawnPosition.copy(point).addScaledVector(tangent, -12);
    this.spawnHeading = heading;

    const start = new THREE.Group();
    start.position.copy(point);
    start.rotation.y = heading;
    this.group.add(start);

    // Chequered line painted on the road.
    const lineTexture = createCheckerTexture(14, 2);
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(TRACK.width, 1.6).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({
        map: lineTexture,
        roughness: 0.8,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    );
    line.position.y = 0.03;
    line.receiveShadow = true;
    start.add(line);

    // Gantry over the line.
    const metal = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.7, roughness: 0.35 });
    const postX = TRACK.width / 2 + TRACK.curbWidth + 1.2;
    for (const side of [-1, 1]) {
      const post = new THREE.Mesh(new THREE.BoxGeometry(0.6, 7.5, 0.6), metal);
      post.position.set(side * postX, 3.75, 0);
      post.castShadow = true;
      start.add(post);
      this.addFixedBox(start, post.position, new THREE.Vector3(0.3, 3.75, 0.3));
    }
    const beam = new THREE.Mesh(new THREE.BoxGeometry(postX * 2 + 0.6, 1.6, 0.5), [
      metal,
      metal,
      metal,
      metal,
      new THREE.MeshStandardMaterial({ map: createCheckerTexture(16, 2), roughness: 0.6 }),
      new THREE.MeshStandardMaterial({ map: createCheckerTexture(16, 2), roughness: 0.6 }),
    ]);
    beam.position.y = 7.2;
    beam.castShadow = true;
    start.add(beam);

    // Start lights.
    const lightMat = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2020, emissiveIntensity: 1.5 });
    for (let i = 0; i < 5; i++) {
      const lamp = new THREE.Mesh(new THREE.SphereGeometry(0.22, 16, 12), lightMat);
      lamp.position.set((i - 2) * 0.8, 6.1, -0.2);
      start.add(lamp);
    }
  }

  private buildGrandstand() {
    // Alongside the main straight, on the outside of the circuit.
    const stand = new THREE.Group();
    stand.position.set(-24, 0, 0);
    this.group.add(stand);

    const concrete = new THREE.MeshStandardMaterial({ color: 0xb8b4ac, roughness: 0.9 });
    const crowd = new THREE.MeshStandardMaterial({ map: createCrowdTexture(), roughness: 0.9, transparent: true, alphaTest: 0.5 });
    const length = 110;
    const tiers = 6;
    for (let i = 0; i < tiers; i++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(2.2, 1 + i * 0.9, length), concrete);
      step.position.set(-i * 2.2, (1 + i * 0.9) / 2, 0);
      step.castShadow = true;
      step.receiveShadow = true;
      stand.add(step);
      const people = new THREE.Mesh(new THREE.PlaneGeometry(length, 1.1), crowd);
      people.rotation.y = Math.PI / 2;
      people.position.set(-i * 2.2 + 0.4, 1 + i * 0.9 + 0.55, 0);
      stand.add(people);
    }
    const roof = new THREE.Mesh(
      new THREE.BoxGeometry(tiers * 2.2 + 3, 0.4, length + 4),
      new THREE.MeshStandardMaterial({ color: 0xeeeeee, metalness: 0.2, roughness: 0.5 }),
    );
    roof.position.set(-(tiers - 1) * 1.1 + 0.5, 1 + tiers * 0.9 + 3.6, 0);
    roof.rotation.z = -0.08;
    roof.castShadow = true;
    stand.add(roof);

    const backWidth = tiers * 2.2;
    this.addFixedBox(
      stand,
      new THREE.Vector3(-(tiers - 1) * 1.1, 3, 0),
      new THREE.Vector3(backWidth / 2, 3, length / 2),
    );
  }

  private buildTrees() {
    const rand = this.rand;
    const box = new THREE.Box3().setFromPoints(this.samples.map((s) => s.point)).expandByScalar(220);
    const clearance = TRACK.width / 2 + TRACK.curbWidth + 7;

    const positions: THREE.Vector3[] = [];
    let attempts = 0;
    while (positions.length < 700 && attempts < 20000) {
      attempts++;
      const p = new THREE.Vector3(
        THREE.MathUtils.lerp(box.min.x, box.max.x, rand()),
        0,
        THREE.MathUtils.lerp(box.min.z, box.max.z, rand()),
      );
      if (this.distanceToCenterLine(p) < clearance) continue;
      if (p.x < -5 && p.x > -50 && Math.abs(p.z) < 70) continue; // keep the grandstand area clear
      positions.push(p);
    }

    // Two kinds of tree, drawn with instancing (one draw call per part, very fast on phones).
    const trunkGeo = new THREE.CylinderGeometry(0.18, 0.28, 2.4, 6).translate(0, 1.2, 0);
    const pineGeo = mergeCones();
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
      const scale = 0.8 + rand() * 0.9;
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, rand() * Math.PI * 2);
      s.setScalar(scale);
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
      // Physics: you can't drive through tree trunks.
      this.world.createCollider(
        RAPIER.ColliderDesc.cylinder(1.5, 0.35 * scale).setTranslation(p.x, 1.5, p.z),
      );
    });
    pines.count = pineCount;
    rounds.count = roundCount;
    for (const mesh of [trunks, pines, rounds]) {
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      this.group.add(mesh);
    }
  }

  private buildHills() {
    const rand = this.rand;
    const material = new THREE.MeshStandardMaterial({ color: 0x5d7552, roughness: 1, flatShading: true });
    const center = new THREE.Box3().setFromPoints(this.samples.map((s) => s.point)).getCenter(new THREE.Vector3());
    for (let i = 0; i < 26; i++) {
      const angle = (i / 26) * Math.PI * 2 + rand() * 0.2;
      const distance = 950 + rand() * 350;
      const radius = 180 + rand() * 220;
      const hill = new THREE.Mesh(new THREE.ConeGeometry(radius, 90 + rand() * 170, 7, 1), material);
      hill.position.set(center.x + Math.cos(angle) * distance, 0, center.z + Math.sin(angle) * distance);
      hill.position.y = (hill.geometry as THREE.ConeGeometry).parameters.height / 2 - 10;
      hill.rotation.y = rand() * Math.PI;
      this.group.add(hill);
    }
  }

  /** Invisible walls far from the track so the car can't drive off forever. */
  private buildBoundaryWalls() {
    const box = new THREE.Box3().setFromPoints(this.samples.map((s) => s.point)).expandByScalar(240);
    const size = box.getSize(new THREE.Vector3());
    const center = box.getCenter(new THREE.Vector3());
    const t = 2;
    const walls: [number, number, number, number][] = [
      [center.x, box.min.z - t, size.x / 2 + t, t],
      [center.x, box.max.z + t, size.x / 2 + t, t],
      [box.min.x - t, center.z, t, size.z / 2 + t],
      [box.max.x + t, center.z, t, size.z / 2 + t],
    ];
    for (const [x, z, hx, hz] of walls) {
      this.world.createCollider(RAPIER.ColliderDesc.cuboid(hx, 10, hz).setTranslation(x, 10, z));
    }
  }

  /** Adds a fixed physics box; `center` is in `parent`'s local space. */
  private addFixedBox(parent: THREE.Object3D, center: THREE.Vector3, halfExtents: THREE.Vector3) {
    parent.updateMatrixWorld(true);
    const worldCenter = center.clone().applyMatrix4(parent.matrixWorld);
    const q = parent.getWorldQuaternion(new THREE.Quaternion());
    this.world.createCollider(
      RAPIER.ColliderDesc.cuboid(halfExtents.x, halfExtents.y, halfExtents.z)
        .setTranslation(worldCenter.x, worldCenter.y, worldCenter.z)
        .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }),
    );
  }

  /** Horizontal distance from a point to the track's centre line. */
  distanceToCenterLine(p: THREE.Vector3) {
    let best = Infinity;
    for (const s of this.samples) {
      const dx = s.point.x - p.x;
      const dz = s.point.z - p.z;
      best = Math.min(best, dx * dx + dz * dz);
    }
    return Math.sqrt(best);
  }
}

function sampleCurve(curve: THREE.CatmullRomCurve3, count: number): TrackSample[] {
  const points = curve.getSpacedPoints(count);
  const samples: TrackSample[] = [];
  let distance = 0;
  for (let i = 0; i < points.length; i++) {
    const tangent = curve.getTangentAt(Math.min(i / count, 1)).setY(0).normalize();
    if (i > 0) distance += points[i].distanceTo(points[i - 1]);
    samples.push({ point: points[i], left: new THREE.Vector3(tangent.z, 0, -tangent.x), distance });
  }
  return samples;
}

/**
 * Builds a flat strip that follows the track, between two sideways offsets from the centre line.
 * U goes across the strip (0..1), V along it (one texture repeat every `repeatLength` metres).
 */
function buildRibbon(samples: TrackSample[], fromOffset: number, toOffset: number, y: number, repeatLength: number) {
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];
  samples.forEach((s, i) => {
    for (const [offset, u] of [
      [fromOffset, 0],
      [toOffset, 1],
    ]) {
      positions.push(s.point.x + s.left.x * offset, y, s.point.z + s.left.z * offset);
      uvs.push(u, s.distance / repeatLength);
    }
    if (i < samples.length - 1) {
      const a = i * 2;
      indices.push(a, a + 2, a + 1, a + 1, a + 2, a + 3);
    }
  });
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  // Make sure normals point up whichever way the strip winds.
  const normals = geometry.getAttribute('normal');
  for (let i = 0; i < normals.count; i++) normals.setXYZ(i, 0, 1, 0);
  return geometry;
}

function mergeCones() {
  const parts = [
    new THREE.ConeGeometry(1.9, 3.2, 7).translate(0, 3.2, 0),
    new THREE.ConeGeometry(1.5, 2.8, 7).translate(0, 4.6, 0),
    new THREE.ConeGeometry(1.0, 2.2, 7).translate(0, 5.9, 0),
  ];
  const positions: number[] = [];
  const normals: number[] = [];
  for (const part of parts) {
    const g = part.toNonIndexed();
    positions.push(...(g.getAttribute('position').array as Float32Array));
    normals.push(...(g.getAttribute('normal').array as Float32Array));
  }
  const merged = new THREE.BufferGeometry();
  merged.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  merged.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
  return merged;
}

function createCrowdTexture() {
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
    // Shoulders and body.
    ctx.fillStyle = shirts[Math.floor(rand() * shirts.length)];
    ctx.beginPath();
    ctx.roundRect(cx - 5, top + 11, 10, 64 - top, 4);
    ctx.fill();
    // Head and hair.
    ctx.fillStyle = skins[Math.floor(rand() * skins.length)];
    ctx.beginPath();
    ctx.arc(cx, top + 5, 4.5, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = hair[Math.floor(rand() * hair.length)];
    ctx.beginPath();
    ctx.arc(cx, top + 3.5, 4.6, Math.PI, 0);
    ctx.fill();
    // Some fans wave their arms.
    if (rand() < 0.15) {
      ctx.fillStyle = ctx.fillStyle;
      ctx.fillRect(cx + 4, top - 6, 2.5, 18);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.repeat.set(4, 1);
  return texture;
}
