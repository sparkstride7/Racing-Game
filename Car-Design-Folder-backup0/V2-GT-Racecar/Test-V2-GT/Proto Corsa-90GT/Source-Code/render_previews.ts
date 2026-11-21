// Renders the preview images in ../Preview-Images from the .glb files (three.js 0.187, run in a browser page).
// A studio with a reflective room environment; the same studio and cameras are used for the earlier
// Proto Corsa-OG (diamond-mesh grille) in the before/after comparisons.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
const W = 1600, H = 980;
const r = new THREE.WebGLRenderer({ antialias: true, preserveDrawingBuffer: true });
r.setSize(W, H); r.toneMapping = THREE.ACESFilmicToneMapping; r.toneMappingExposure = 0.95; r.shadowMap.enabled = true; r.shadowMap.type = THREE.PCFSoftShadowMap;
const env = new THREE.PMREMGenerator(r).fromScene(new RoomEnvironment(), 0.03).texture;
function studio(car: THREE.Object3D) {
  const s = new THREE.Scene(); s.background = new THREE.Color(0x8e98a6); s.environment = env; s.environmentIntensity = 0.85;
  s.add(new THREE.HemisphereLight(0xe8eefc, 0x40464f, 0.5));
  const sun = new THREE.DirectionalLight(0xffffff, 2.0); sun.position.set(-4, 9, 7); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 30 }); sun.shadow.bias = -0.0004; s.add(sun);
  const ground = new THREE.Mesh(new THREE.CircleGeometry(40, 64), new THREE.MeshStandardMaterial({ color: 0x6e7581, roughness: 0.95 }));
  ground.rotation.x = -Math.PI / 2; ground.receiveShadow = true; s.add(ground);
  car.traverse((o: any) => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } }); s.add(car); return s;
}
// Wheels steered (front) to show the arch clearance: turns each front wheel's parts about its own vertical axis.
function steer(car: THREE.Object3D, deg: number) {
  for (const side of ['FL', 'FR']) {
    const parts: THREE.Mesh[] = []; car.traverse((o: any) => { if (o.isMesh && new RegExp('^(Wheel|Rim|Disc|Caliper|Spoke)_' + side + '(_|$)').test(o.name)) parts.push(o); });
    const box = new THREE.Box3(); parts.forEach((p) => box.expandByObject(p)); const c = box.getCenter(new THREE.Vector3());
    const pivot = new THREE.Group(); pivot.position.copy(c); car.add(pivot); pivot.updateMatrixWorld();
    parts.forEach((p) => pivot.attach(p)); pivot.rotation.y = THREE.MathUtils.degToRad(deg);
  }
}
const VIEWS: Record<string, { p: number[]; t: number[]; fov: number; steer?: number }> = {
  'front': { p: [0, 0.8, 7.4], t: [0, 0.6, 0], fov: 30 },
  'front-low-angle': { p: [0, 0.3, 6.5], t: [0, 0.45, 0], fov: 30 },
  'front-left-three-quarter': { p: [4.6, 1.6, 5.6], t: [0, 0.55, 0.2], fov: 32 },
  'front-right-three-quarter': { p: [-4.6, 1.6, 5.6], t: [0, 0.55, 0.2], fov: 32 },
  'side': { p: [8.2, 1.0, 0], t: [0, 0.6, 0], fov: 32 },
  'rear-left-three-quarter': { p: [4.6, 1.7, -5.6], t: [0, 0.55, -0.2], fov: 32 },
  'closeup-grille-front': { p: [0, 0.62, 4.45], t: [0, 0.59, 2.25], fov: 30 },
  'closeup-grille-three-quarter-left': { p: [1.25, 0.78, 3.35], t: [0.08, 0.58, 2.25], fov: 30 },
  'closeup-grille-three-quarter-right': { p: [-1.25, 0.78, 3.35], t: [-0.08, 0.58, 2.25], fov: 30 },
  'closeup-grille-corner-detail': { p: [0.95, 0.72, 2.78], t: [0.45, 0.62, 2.25], fov: 28 },
  'closeup-grille-from-above': { p: [0.25, 1.35, 3.0], t: [0.05, 0.6, 2.25], fov: 30 },
};
const loader = new GLTFLoader();
(async () => {
  const out: Record<string, string> = {}; const info: any = {};
  const models: [string, string][] = [['new', '/home/user/Racing-Game/Car-Design-Folder/V2-GT-Racecar/Test-V2-GT/Proto Corsa-90GT/Model/proto_corsa_90gt.glb'], ['before', '/home/user/Racing-Game/Car-Design-Folder/V2-GT-Racecar/Test-V2-GT/Proto Corsa-OG/Model/gt_racecar_v2_fenders_rev4.glb']];
  for (const [label, file] of models) {
    for (const [name, v] of Object.entries(VIEWS)) {
      if (label === 'before' && !['front', 'front-left-three-quarter', 'front-right-three-quarter', 'closeup-grille-front', 'closeup-grille-three-quarter-left', 'closeup-grille-corner-detail'].includes(name)) continue;
      const car = (await loader.loadAsync('/@fs' + file)).scene;
      if (!info[label]) { let tris = 0; const names: string[] = []; car.traverse((o: any) => { if (o.isMesh) { tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; names.push(o.name); } }); info[label] = { triangles: tris, liners: names.filter((n) => n.startsWith('Wheel_Well')), grilleParts: names.filter((n) => n.startsWith('Front_Grille')) }; }
      if (v.steer) steer(car, v.steer);
      const s = studio(car);
      const cam = new THREE.PerspectiveCamera(v.fov, W / H, 0.05, 100); cam.position.set(...(v.p as [number, number, number])); cam.lookAt(...(v.t as [number, number, number]));
      r.render(s, cam); out[label + '__' + name] = r.domElement.toDataURL('image/png');
    }
  }
  (window as any).__info = info; (window as any).__out = out;
})().catch((e) => ((window as any).__err = String(e)));
