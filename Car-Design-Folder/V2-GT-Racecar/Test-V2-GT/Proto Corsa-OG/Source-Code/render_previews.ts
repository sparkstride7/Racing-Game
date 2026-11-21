// Renders the preview images in ../Preview-Images from the .glb files (three.js 0.187, run in a browser page).
// A studio with a reflective room environment; the same studio and cameras are used for the earlier
// revision 3 (lowered bumpers and rockers) in the before/after comparisons.
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
  'rear': { p: [0, 1.0, -7.4], t: [0, 0.6, 0], fov: 30 },
  'side': { p: [8.2, 1.0, 0], t: [0, 0.6, 0], fov: 32 },
  'front-left-three-quarter': { p: [4.6, 1.6, 5.6], t: [0, 0.55, 0.2], fov: 32 },
  'front-right-three-quarter': { p: [-4.6, 1.6, 5.6], t: [0, 0.55, 0.2], fov: 32 },
  'rear-left-three-quarter': { p: [4.6, 1.7, -5.6], t: [0, 0.55, -0.2], fov: 32 },
  'rear-right-three-quarter': { p: [-4.6, 1.7, -5.6], t: [0, 0.55, -0.2], fov: 32 },
  'closeup-front-fender': { p: [2.7, 0.9, 2.9], t: [0.85, 0.45, 1.3], fov: 30 },
  'closeup-rear-quarter-panel': { p: [2.8, 1.0, -3.0], t: [0.85, 0.45, -1.3], fov: 30 },
  'closeup-front-fender-wheels-steered-35deg': { p: [2.7, 0.9, 2.9], t: [0.85, 0.45, 1.3], fov: 30, steer: 35 },
  'closeup-rocker-panel': { p: [3.3, 0.55, 0.15], t: [0.8, 0.42, 0.0], fov: 34 },
  'closeup-rocker-panel-low-angle': { p: [3.0, 0.12, 1.9], t: [0.85, 0.36, 0.0], fov: 34 },
  'closeup-front-bumper': { p: [2.2, 0.55, 4.0], t: [0.25, 0.42, 2.05], fov: 34 },
  'closeup-rear-bumper': { p: [2.3, 0.6, -4.1], t: [0.25, 0.45, -2.05], fov: 34 },
  'side-low-angle': { p: [7.6, 0.32, 0], t: [0, 0.5, 0], fov: 32 },
  'closeup-splitter-corner-right-side': { p: [1.9, 0.75, 3.1], t: [0.85, 0.33, 2.25], fov: 30 },
  'closeup-splitter-corner-left-side': { p: [-1.9, 0.75, 3.1], t: [-0.85, 0.33, 2.25], fov: 30 },
  'closeup-splitter-corner-from-above': { p: [1.0, 2.4, 2.9], t: [0.75, 0.33, 2.15], fov: 34 },
  'front-low-angle': { p: [0, 0.3, 6.5], t: [0, 0.45, 0], fov: 30 },
  'top': { p: [0.001, 9.5, 0], t: [0, 0, 0], fov: 32 },
};
const loader = new GLTFLoader();
(async () => {
  const out: Record<string, string> = {}; const info: any = {};
  const models: [string, string][] = [['new', '/home/user/Racing-Game/Car-Design-Folder/V2-GT-Racecar/Test-V2-GT/Fenders-and-Quarter-Panels-Version/Revision-4-Rounded-Splitter-Corners/Model/gt_racecar_v2_fenders_rev4.glb'], ['before', '/home/user/Racing-Game/Car-Design-Folder/V2-GT-Racecar/Test-V2-GT/Fenders-and-Quarter-Panels-Version/Revision-3-Lowered-Bumpers-and-Rockers/Model/gt_racecar_v2_fenders_rev3.glb']];
  for (const [label, file] of models) {
    for (const [name, v] of Object.entries(VIEWS)) {
      if (label === 'before' && !['front', 'front-low-angle', 'side', 'top', 'front-left-three-quarter', 'front-right-three-quarter', 'closeup-front-bumper', 'closeup-splitter-corner-right-side', 'closeup-splitter-corner-left-side', 'closeup-splitter-corner-from-above'].includes(name)) continue;
      const car = (await loader.loadAsync('/@fs' + file)).scene;
      if (!info[label]) { let tris = 0; const names: string[] = []; car.traverse((o: any) => { if (o.isMesh) { tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3; names.push(o.name); } }); info[label] = { triangles: tris, liners: names.filter((n) => n.startsWith('Wheel_Well')), rockerBlades: names.filter((n) => n.startsWith('Rocker_Blade')), sideSkirts: names.filter((n) => n.endsWith('Side_Skirt')) }; }
      if (v.steer) steer(car, v.steer);
      const s = studio(car);
      const cam = new THREE.PerspectiveCamera(v.fov, W / H, 0.05, 100); cam.position.set(...(v.p as [number, number, number])); cam.lookAt(...(v.t as [number, number, number]));
      r.render(s, cam); out[label + '__' + name] = r.domElement.toDataURL('image/png');
    }
  }
  (window as any).__info = info; (window as any).__out = out;
})().catch((e) => ((window as any).__err = String(e)));
