import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { World } from '@dimforge/rapier3d-compat';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { TRACK } from '../config';
import { findRuns, ribbonGeometry, wallGeometry } from './track/geometry';
import { GREENFIELD_CIRCUIT, type TrackLayout } from './track/layout';
import { createGrandstand, createHills, createPitBuilding, createTrees } from './track/scenery';
import { TrackPath, type TrackSample } from './track/TrackPath';
import {
  createAsphaltTexture,
  createBarrierTexture,
  createCheckerTexture,
  createCurbTexture,
  createDistanceBoardTexture,
  createGrassTexture,
} from './textures';

/**
 * A complete racing circuit built from a track layout:
 * asphalt road, kerbs on the corners, safety barriers on both sides,
 * start/finish line with gantry and grid, braking boards, pit building,
 * grandstand, trees and distant hills.
 */
export class Circuit {
  readonly group = new THREE.Group();
  readonly path: TrackPath;
  readonly spawnPosition = new THREE.Vector3();
  /** Rotation around the vertical axis for a car on the grid. */
  spawnHeading = 0;
  /** Distance from the centre line to the track-facing side of the barriers. */
  readonly barrierOffset = TRACK.width / 2 + TRACK.curbWidth + TRACK.runoffWidth;

  /** Number of painted grid slots. */
  static readonly GRID_SLOTS = 6;
  /** The five red start lights on the gantry, left to right. */
  private readonly startLights: THREE.MeshStandardMaterial[] = [];
  private startLineSample!: TrackSample;

  /** Ground areas kept clear of trees (buildings next to the track). */
  private readonly keepClear: THREE.Box3[] = [];

  constructor(scene: THREE.Scene, private readonly world: World, layout: TrackLayout = GREENFIELD_CIRCUIT) {
    this.path = new TrackPath(layout);

    this.buildGround();
    this.buildRoad();
    this.buildCurbs();
    this.buildBarriers();
    this.buildStartFinish(layout);
    this.buildBrakingBoards();
    this.buildMainStraightBuildings();
    this.buildTreesAndHills();
    this.buildBoundaryWalls();

    // Nothing in the circuit moves, so skip recalculating its positions every frame.
    this.group.traverse((o) => {
      o.updateMatrix();
      o.matrixAutoUpdate = false;
    });
    scene.add(this.group);
  }

  // ---------------------------------------------------------------- Ground

  private buildGround() {
    const grass = createGrassTexture();
    grass.repeat.set(400, 400);
    const ground = new THREE.Mesh(
      // Split into tiles: one giant triangle pair can make the grass flicker through the road on some GPUs.
      new THREE.PlaneGeometry(4800, 4800, 48, 48).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({ map: grass, roughness: 1, metalness: 0 }),
    );
    // A few centimetres below the road surface so the road always draws on top.
    ground.position.copy(this.path.bounds().getCenter(new THREE.Vector3())).setY(-0.04);
    ground.receiveShadow = true;
    this.group.add(ground);

    // Physics: one big flat box. The road is flat too, so this handles all wheel contact.
    this.world.createCollider(RAPIER.ColliderDesc.cuboid(2400, 1, 2400).setTranslation(0, -1, 0).setFriction(1));
  }

  // ---------------------------------------------------------------- Road and kerbs

  private buildRoad() {
    const half = TRACK.width / 2;
    const road = new THREE.Mesh(
      ribbonGeometry(this.path.samples, -half, half, 0.02, 0.02, TRACK.width),
      new THREE.MeshStandardMaterial({
        map: createAsphaltTexture(),
        roughness: 0.88,
        metalness: 0,
        polygonOffset: true,
        polygonOffsetFactor: -2,
        polygonOffsetUnits: -2,
      }),
    );
    road.receiveShadow = true;
    this.group.add(road);
  }

  /** Red-and-white kerbs on both sides of every corner (not on the straights). */
  private buildCurbs() {
    const half = TRACK.width / 2;
    const minCurvature = 1 / TRACK.curbCornerRadius;
    const runs = findRuns(this.path.samples, (s) => Math.abs(s.curvature) > minCurvature, 6);

    const pieces: THREE.BufferGeometry[] = [];
    for (const run of runs) {
      for (const side of [-1, 1]) {
        const inner = side * half;
        const outer = side * (half + TRACK.curbWidth);
        // Slightly raised on the outer edge, like a real kerb.
        pieces.push(ribbonGeometry(run, inner, outer, 0.035, 0.08, 4));
      }
    }
    if (!pieces.length) return;
    const curbs = new THREE.Mesh(
      mergeGeometries(pieces),
      new THREE.MeshStandardMaterial({
        map: createCurbTexture(),
        roughness: 0.7,
        polygonOffset: true,
        polygonOffsetFactor: -3,
        polygonOffsetUnits: -3,
      }),
    );
    curbs.receiveShadow = true;
    this.group.add(curbs);
  }

  // ---------------------------------------------------------------- Safety barriers

  private buildBarriers() {
    const samples = this.path.samples;
    const pieces: THREE.BufferGeometry[] = [];
    for (const side of [-1, 1] as const) {
      pieces.push(
        ...wallGeometry(samples, side, this.barrierOffset, TRACK.barrierHeight, TRACK.barrierThickness, 8),
      );
      this.addBarrierColliders(side);
    }
    const barriers = new THREE.Mesh(
      mergeGeometries(pieces),
      new THREE.MeshStandardMaterial({ map: createBarrierTexture(), roughness: 0.8 }),
    );
    barriers.castShadow = true;
    barriers.receiveShadow = true;
    this.group.add(barriers);
  }

  /**
   * The barrier's physics: a chain of boxes. Each box is much thicker than the visible wall
   * (it extends away from the track), so even a car at top speed can't pass through.
   */
  private addBarrierColliders(side: 1 | -1) {
    const samples = this.path.samples;
    const stride = 3; // one box per ~6 m
    const halfThickness = 1.5;
    const halfHeight = 1.2;
    const a = new THREE.Vector3();
    const b = new THREE.Vector3();
    const mid = new THREE.Vector3();
    const out = new THREE.Vector3();
    const q = new THREE.Quaternion();
    for (let i = 0; i < samples.length - 1; i += stride) {
      const s0 = samples[i];
      const s1 = samples[Math.min(i + stride, samples.length - 1)];
      a.copy(s0.point).addScaledVector(s0.left, side * this.barrierOffset);
      b.copy(s1.point).addScaledVector(s1.left, side * this.barrierOffset);
      const length = a.distanceTo(b);
      if (length < 0.01) continue;
      out.copy(s0.left).add(s1.left).normalize().multiplyScalar(side);
      mid.copy(a).add(b).multiplyScalar(0.5).addScaledVector(out, halfThickness);
      q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, Math.atan2(b.x - a.x, b.z - a.z));
      this.world.createCollider(
        RAPIER.ColliderDesc.cuboid(halfThickness, halfHeight, length / 2 + 0.3)
          .setTranslation(mid.x, halfHeight, mid.z)
          .setRotation({ x: q.x, y: q.y, z: q.z, w: q.w })
          .setFriction(0.15)
          .setRestitution(0.2),
      );
    }
  }

  // ---------------------------------------------------------------- Start / finish

  private buildStartFinish(layout: TrackLayout) {
    const samples = this.path.samples;
    const index = this.path.nearestIndex(new THREE.Vector3(layout.startLine[0], 0, layout.startLine[1]));
    const sample = samples[index];
    this.startLineSample = sample;
    const heading = Math.atan2(sample.tangent.x, sample.tangent.z);

    // Free-drive spawn: pole position on the grid.
    const pole = this.gridSlot(0);
    this.spawnPosition.copy(pole.position);
    this.spawnHeading = pole.heading;

    const start = new THREE.Group();
    start.position.copy(sample.point);
    start.rotation.y = heading;
    this.group.add(start);

    // Chequered line across the road.
    const line = new THREE.Mesh(
      new THREE.PlaneGeometry(TRACK.width, 3).rotateX(-Math.PI / 2),
      new THREE.MeshStandardMaterial({
        map: createCheckerTexture(14, 3),
        roughness: 0.8,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    );
    line.position.y = 0.03;
    line.receiveShadow = true;
    start.add(line);

    // Painted grid slots behind the line (staggered, two lanes).
    const slots: THREE.BufferGeometry[] = [];
    for (let i = 0; i < Circuit.GRID_SLOTS; i++) {
      const { along, lane } = gridSlotOffset(i);
      const z = along + 2.6;
      slots.push(new THREE.PlaneGeometry(2.6, 0.25).rotateX(-Math.PI / 2).translate(lane, 0.03, z));
      slots.push(new THREE.PlaneGeometry(0.25, 1.4).rotateX(-Math.PI / 2).translate(lane - 1.18, 0.03, z - 0.7));
      slots.push(new THREE.PlaneGeometry(0.25, 1.4).rotateX(-Math.PI / 2).translate(lane + 1.18, 0.03, z - 0.7));
    }
    const grid = new THREE.Mesh(
      mergeGeometries(slots),
      new THREE.MeshStandardMaterial({
        color: 0xf0f0ea,
        roughness: 0.7,
        polygonOffset: true,
        polygonOffsetFactor: -4,
        polygonOffsetUnits: -4,
      }),
    );
    start.add(grid);

    // Gantry spanning the whole track, with its posts safely behind the barriers.
    const metal = new THREE.MeshStandardMaterial({ color: 0x2b2f36, metalness: 0.7, roughness: 0.35 });
    const postX = this.barrierOffset + TRACK.barrierThickness + 0.8;
    const posts = new THREE.Mesh(
      mergeGeometries([-1, 1].map((side) => new THREE.BoxGeometry(0.7, 8, 0.7).translate(side * postX, 4, 0))),
      metal,
    );
    posts.castShadow = true;
    start.add(posts);

    const checker = new THREE.MeshStandardMaterial({ map: createCheckerTexture(12, 2), roughness: 0.6 });
    const beam = new THREE.Mesh(new THREE.BoxGeometry(postX * 2 + 0.7, 1.6, 0.5), [metal, metal, metal, metal, checker, checker]);
    beam.position.y = 7.6;
    beam.castShadow = true;
    start.add(beam);

    // Five start lights (separate so a race countdown can switch them on one by one).
    const lampGeometry = new THREE.SphereGeometry(0.22, 12, 8);
    for (let i = 0; i < 5; i++) {
      const material = new THREE.MeshStandardMaterial({ color: 0x220000, emissive: 0xff2020, emissiveIntensity: 1.5 });
      const lamp = new THREE.Mesh(lampGeometry, material);
      lamp.position.set((i - 2) * 0.8, 6.5, -0.2);
      start.add(lamp);
      this.startLights.push(material);
    }
  }

  /** Lights the first `count` start lights (0 = all off, 5 = all on). */
  setStartLights(count: number) {
    this.startLights.forEach((m, i) => (m.emissiveIntensity = i < count ? 1.5 : 0));
  }

  /** Position and heading of grid slot `index` (0 = pole position). */
  gridSlot(index: number) {
    const s = this.startLineSample;
    const { along, lane } = gridSlotOffset(index);
    return {
      position: s.point.clone().addScaledVector(s.tangent, along).addScaledVector(s.left, lane),
      heading: Math.atan2(s.tangent.x, s.tangent.z),
    };
  }

  /** Index of the track sample at the start/finish line. */
  get startLineDistance() {
    return this.startLineSample.distance;
  }

  // ---------------------------------------------------------------- Braking boards

  /** "300 / 200 / 100" boards before the first corner, on the outside of the straight. */
  private buildBrakingBoards() {
    const samples = this.path.samples;
    // The end of the main straight is the first sample where kerbs (corners) begin after the start line.
    const minCurvature = 1 / TRACK.curbCornerRadius;
    const startIndex = this.path.nearestIndex(this.spawnPosition);
    let corner = startIndex;
    while (Math.abs(samples[corner].curvature) <= minCurvature && corner < samples.length - 1) corner++;
    const step = this.path.length / (samples.length - 1);

    const labels = ['300', '200', '100'];
    const boardGeos: THREE.BufferGeometry[] = [];
    const postGeos: THREE.BufferGeometry[] = [];
    labels.forEach((_, i) => {
      const metres = 300 - i * 100;
      const s = samples[Math.max(0, corner - Math.round(metres / step))];
      // Driver's right-hand side, just in front of the barrier, facing oncoming cars.
      const pos = s.point.clone().addScaledVector(s.left, -(this.barrierOffset - 1.2));
      const yaw = Math.atan2(s.tangent.x, s.tangent.z) + Math.PI;
      const board = new THREE.PlaneGeometry(2.4, 1.2);
      // Pick this board's label out of the shared texture strip.
      const uv = board.getAttribute('uv');
      for (let k = 0; k < uv.count; k++) uv.setX(k, (uv.getX(k) + i) / labels.length);
      board.translate(0, 2.2, 0).rotateY(yaw).translate(pos.x, 0, pos.z);
      boardGeos.push(board);
      postGeos.push(new THREE.BoxGeometry(0.12, 2.2, 0.12).translate(pos.x, 1.1, pos.z));
    });
    const boards = new THREE.Mesh(
      mergeGeometries(boardGeos),
      new THREE.MeshStandardMaterial({ map: createDistanceBoardTexture(labels), roughness: 0.6, side: THREE.DoubleSide }),
    );
    boards.castShadow = true;
    const posts = new THREE.Mesh(mergeGeometries(postGeos), new THREE.MeshStandardMaterial({ color: 0x777b82, metalness: 0.6, roughness: 0.4 }));
    this.group.add(boards, posts);
  }

  // ---------------------------------------------------------------- Grandstand and pits

  /** Grandstand on the outside of the main straight, pit building on the inside, both facing the start line. */
  private buildMainStraightBuildings() {
    const s = this.path.samples[this.path.nearestIndex(this.spawnPosition)];
    const heading = Math.atan2(s.tangent.x, s.tangent.z);
    const behindBarrier = this.barrierOffset + TRACK.barrierThickness + 4;

    const place = (object: THREE.Object3D, side: 1 | -1, along: number) => {
      object.position.copy(s.point).addScaledVector(s.left, side * behindBarrier).addScaledVector(s.tangent, along);
      // Objects are built facing +X; turn them so they face the track.
      object.rotation.y = side === -1 ? heading : heading + Math.PI;
      this.group.add(object);
      // Keep trees out of the building's footprint.
      object.updateMatrixWorld(true);
      this.keepClear.push(new THREE.Box3().setFromObject(object).expandByScalar(6));
    };

    // Driver's right side of the straight (outside of the circuit).
    place(createGrandstand(140), -1, 10);
    // Driver's left side (infield).
    place(createPitBuilding(110), 1, 0);
  }

  // ---------------------------------------------------------------- Trees, hills, limits

  private buildTreesAndHills() {
    const bounds = this.path.bounds();
    const area = bounds.clone().expandByScalar(230);
    const clearance = this.barrierOffset + TRACK.barrierThickness + 5;
    const clearanceSq = clearance * clearance;
    const isFree = (p: THREE.Vector3) =>
      this.path.distanceToCenterSq(p) > clearanceSq && !this.keepClear.some((box) => box.containsPoint(p.clone().setY(1)));

    this.group.add(createTrees(area, 1000, isFree));
    this.group.add(createHills(bounds.getCenter(new THREE.Vector3()), 1000));
  }

  /** Last-resort invisible walls far outside the circuit, in case a car ever gets over a barrier. */
  private buildBoundaryWalls() {
    const box = this.path.bounds().expandByScalar(240);
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
}

/**
 * Grid slot layout: staggered two-by-two, 8 m apart.
 * Slot 0 (pole) is 12 m behind the line on the left lane (the inside of Turn 1).
 */
function gridSlotOffset(index: number) {
  return { along: -12 - index * 8, lane: (index % 2 === 0 ? 1 : -1) * 3.2 };
}
