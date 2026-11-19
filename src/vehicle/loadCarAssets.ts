import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { DecalGeometry } from 'three/addons/geometries/DecalGeometry.js';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { clearCarTemplates, setCarTemplate, type CarBody } from './carAssets';

/**
 * Model files in public/models/cars/ (compressed with Meshopt, so the Meshopt decoder is required).
 * All six cars currently use the Exotic body (design exotic-v10dd). The GT body will return in a later update.
 */
const FILES: Partial<Record<CarBody, string>> = {
  exotic: 'optimized_exotic_supercar_v10dd',
};

/** Every model must have these nodes: steering pivots, rolling wheels and brake calipers. */
/** Give up on the car downloads after this long (a stalled mobile connection must not leave the game on "Loading…"). */
export const CAR_LOAD_TIMEOUT_MS = 15000;

const RIG = ['FL', 'FR', 'RL', 'RR'].flatMap((c) => [`Wheel_${c}`, `Wheel_${c}_Spin`, `Caliper_${c}`]);

/**
 * Where the race-number roundels go on each body (car space, metres): one on the roof, one on each door.
 * Chosen on painted areas, clear of windows, vents and the GT's roof scoop.
 */
const NUMBER_SPOTS: Record<CarBody, { roof: [number, number]; door: [number, number]; doorZ: [number, number]; roofSize: number; doorSize: number }> = {
  // Door roundels go on the flattest part of the door within doorZ (clear of the side intake and wheel arches).
  exotic: { roof: [0, 0.05], door: [0.5, 0.35], doorZ: [0.1, 0.45], roofSize: 0.42, doorSize: 0.34 },
  gt: { roof: [0, 0.32], door: [0.5, 0.1], doorZ: [-0.25, 0.1], roofSize: 0.38, doorSize: 0.34 },
};

/**
 * Loads both car models (all three detail levels) once at start-up.
 * Returns false, and leaves the built-in car in use, if anything is missing, fails to load,
 * or takes longer than `timeoutMs` (a late download is then ignored).
 */
export async function loadCarAssets(
  baseUrl = `${import.meta.env.BASE_URL}models/cars/`,
  timeoutMs = CAR_LOAD_TIMEOUT_MS,
): Promise<boolean> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    const downloads = Promise.all(
      (Object.keys(FILES) as CarBody[]).map(async (body) => {
        const levels = await Promise.all([0, 1, 2].map((l) => loader.loadAsync(`${baseUrl}${FILES[body]!}_LOD${l}.glb`).then((g) => g.scene)));
        for (const level of levels) checkModel(level, body);
        return { body, levels };
      }),
    );
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error(`car models took longer than ${timeoutMs / 1000} s to download`)), timeoutMs);
    });
    downloads.catch(() => undefined); // a download that fails after the time limit is simply ignored
    const loaded = await Promise.race([downloads, timeout]);
    for (const { body, levels } of loaded) {
      let numberGeometry: THREE.BufferGeometry | null = null;
      try {
        numberGeometry = buildNumberGeometry(levels[0], body);
      } catch (error) {
        console.warn(`Race numbers could not be fitted to the ${body} model.`, error);
      }
      setCarTemplate(body, { levels, numberGeometry });
    }
    return true;
  } catch (error) {
    console.warn('Car models could not be loaded; using the built-in cars.', error);
    clearCarTemplates();
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function checkModel(scene: THREE.Object3D, body: CarBody) {
  for (const name of RIG) if (!scene.getObjectByName(name)) throw new Error(`${body} model is missing ${name}`);
  let paint = false;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && (m.material as THREE.Material).name === 'Recolourable_Paint') paint = true;
  });
  if (!paint) throw new Error(`${body} model has no Recolourable_Paint material`);
}

/**
 * Makes roundel-shaped patches that follow the body's real (curved) surface on the roof and both doors.
 * The paint mesh is copied in its resting shape, then each roundel is projected onto it.
 */
function buildNumberGeometry(scene: THREE.Object3D, body: CarBody) {
  scene.updateMatrixWorld(true);
  let paint: THREE.Mesh | null = null;
  scene.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.isMesh && (m.material as THREE.Material).name === 'Recolourable_Paint') paint = m;
  });
  const source = paint! as THREE.Mesh;
  const g = source.geometry;
  const count = g.attributes.position.count;
  const pos = new Float32Array(count * 3);
  const nrm = new Float32Array(count * 3);
  const v = new THREE.Vector3();
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(source.matrixWorld);
  for (let i = 0; i < count; i++) {
    source.getVertexPosition(i, v); // includes the skinning, so this is the body's true resting shape
    v.applyMatrix4(source.matrixWorld).toArray(pos, i * 3);
    v.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(normalMatrix).normalize().toArray(nrm, i * 3);
  }
  const rest = new THREE.BufferGeometry();
  rest.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  rest.setAttribute('normal', new THREE.BufferAttribute(nrm, 3));
  if (g.index) rest.setIndex(g.index.clone());
  const surface = new THREE.Mesh(rest, new THREE.MeshBasicMaterial({ side: THREE.DoubleSide }));
  surface.updateMatrixWorld(true);

  const spot = NUMBER_SPOTS[body];
  const ray = new THREE.Raycaster();
  const hit = (origin: THREE.Vector3, dir: THREE.Vector3) => {
    ray.set(origin, dir);
    const h = ray.intersectObject(surface, false)[0];
    if (!h || !h.face) throw new Error('no paint surface for a race number');
    return h.point;
  };
  // Each roundel: text "up" along `up`, projected straight along the surface normal direction `n`.
  const decal = (point: THREE.Vector3, n: THREE.Vector3, up: THREE.Vector3, size: number) => {
    const x = new THREE.Vector3().crossVectors(up, n).normalize();
    const y = new THREE.Vector3().crossVectors(n, x).normalize();
    const orientation = new THREE.Euler().setFromRotationMatrix(new THREE.Matrix4().makeBasis(x, y, n));
    const d = new DecalGeometry(surface, point, orientation, new THREE.Vector3(size, size, 0.12));
    if (d.attributes.position.count === 0) throw new Error('empty race number patch');
    return d;
  };
  const roof = hit(new THREE.Vector3(spot.roof[0], 3, spot.roof[1]), new THREE.Vector3(0, -1, 0));
  // The door's real surface direction, from nearby surface points, so the roundel is projected straight onto
  // the panel (no stretching on a curved door); the flattest spot in range is chosen.
  const doorAt = (side: number, y: number, z: number) => {
    const at = (yy: number, zz: number) => hit(new THREE.Vector3(3 * side, yy, zz), new THREE.Vector3(-side, 0, 0));
    const d = spot.doorSize / 2;
    const ty = at(y + d, z).sub(at(y - d, z)), tz = at(y, z + d).sub(at(y, z - d));
    const n = new THREE.Vector3().crossVectors(ty, tz).normalize();
    if (n.x * side < 0) n.negate();
    return { point: at(y, z), n };
  };
  const door = (side: number) => {
    let best = doorAt(side, spot.door[0], spot.door[1]);
    for (let z = spot.doorZ[0]; z <= spot.doorZ[1] + 1e-6; z += 0.05) {
      const c = doorAt(side, spot.door[0], z);
      if (Math.abs(c.n.x) > Math.abs(best.n.x)) best = c;
    }
    return best;
  };
  const left = door(1), right = door(-1);
  const parts = [
    // Roof: reads correctly from the chase camera behind the car (text "up" points forward).
    decal(roof, new THREE.Vector3(0, 1, 0), new THREE.Vector3(0, 0, 1), spot.roofSize),
    decal(left.point, left.n, new THREE.Vector3(0, 1, 0), spot.doorSize),
    decal(right.point, right.n, new THREE.Vector3(0, 1, 0), spot.doorSize),
  ];
  const merged = mergeGeometries(parts);
  rest.dispose();
  parts.forEach((p) => p.dispose());
  if (!merged) throw new Error('race number patches could not be merged');
  return merged;
}
