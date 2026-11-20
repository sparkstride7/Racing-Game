import * as THREE from 'three';
import { EXOTIC, GT } from './designs4';
import { buildCar, exportGLB } from './build4';

const W = 1600, H = 900;
const renderer = new THREE.WebGLRenderer({ canvas: document.getElementById('c') as HTMLCanvasElement, antialias: true, preserveDrawingBuffer: true });
renderer.setSize(W, H); renderer.toneMapping = THREE.ACESFilmicToneMapping; renderer.shadowMap.enabled = true;
const scene = new THREE.Scene();
const bg = document.createElement('canvas'); bg.width = 4; bg.height = 256;
const bc = bg.getContext('2d')!; const gr = bc.createLinearGradient(0, 0, 0, 256);
gr.addColorStop(0, '#5d6670'); gr.addColorStop(0.55, '#9aa3ad'); gr.addColorStop(1, '#3a3f46'); bc.fillStyle = gr; bc.fillRect(0, 0, 4, 256);
const bgt = new THREE.CanvasTexture(bg); bgt.colorSpace = THREE.SRGBColorSpace; scene.background = bgt;
{
  const env = new THREE.Scene();
  env.add(new THREE.Mesh(new THREE.SphereGeometry(20, 32, 16), new THREE.ShaderMaterial({ side: THREE.BackSide,
    vertexShader: 'varying vec3 p; void main(){ p = normalize(position); gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: 'varying vec3 p; void main(){ float h=p.y; vec3 sky=mix(vec3(0.55,0.6,0.66),vec3(0.85,0.9,0.96),smoothstep(0.0,0.6,h)); vec3 gr=mix(vec3(0.16,0.17,0.19),vec3(0.32,0.33,0.35),smoothstep(-0.6,0.0,h)); gl_FragColor=vec4(h>0.0?sky:gr,1.0); }' })));
  for (const [x, z, w] of [[0, 0, 14], [-6, 4, 6], [6, -4, 6]]) {
    const strip = new THREE.Mesh(new THREE.PlaneGeometry(w, 1.2), new THREE.MeshBasicMaterial({ color: 0xffffff }));
    strip.material.color.multiplyScalar(2.2); strip.position.set(x, 9, z); strip.rotation.x = Math.PI / 2; env.add(strip);
  }
  scene.environment = new THREE.PMREMGenerator(renderer).fromScene(env, 0.02).texture;
}
const key = new THREE.DirectionalLight(0xfff4e8, 2.6); key.position.set(4, 8, 5); key.castShadow = true; key.shadow.mapSize.set(2048, 2048);
Object.assign(key.shadow.camera, { left: -4, right: 4, top: 4, bottom: -4, near: 1, far: 30 }); key.shadow.bias = -0.0003; scene.add(key);
scene.add(new THREE.HemisphereLight(0xe0ebff, 0x30343a, 0.5));
const floor = new THREE.Mesh(new THREE.CircleGeometry(30, 64).rotateX(-Math.PI / 2), new THREE.MeshStandardMaterial({ color: 0x4a4f56, roughness: 0.55 }));
floor.receiveShadow = true; scene.add(floor);
const cam = (p: number[], l: number[], fov: number) => { const c = new THREE.PerspectiveCamera(fov, 16 / 9, 0.1, 100); c.position.set(p[0], p[1], p[2]); c.lookAt(l[0], l[1], l[2]); return c; };
const views = [
  { rect: [0, H / 2, W / 2, H / 2], cam: cam([5.6, 1.55, 6.6], [0, 0.5, 0.1], 26) },
  { rect: [W / 2, H / 2, W / 2, H / 2], cam: cam([-5.6, 1.75, -6.6], [0, 0.55, -0.1], 26) },
  { rect: [0, 0, W / 2, H / 2], cam: cam([11.5, 0.75, 0], [0, 0.6, 0], 25) },
  { rect: [W / 2, 0, W / 2, H / 2], cam: cam([0, 2.87, -6.4], [0, 1.57, 4], 62) },
];
let current: THREE.Object3D | null = null;
const toB64 = (buf: ArrayBuffer) => { let s = ''; const b = new Uint8Array(buf); for (let i = 0; i < b.length; i += 0x8000) s += String.fromCharCode(...b.subarray(i, i + 0x8000)); return btoa(s); };
(window as any).make = async (which: string) => {
  if (current) scene.remove(current);
  const d = which === 'gt' ? GT : EXOTIC;
  const t0 = performance.now();
  const { root, stats } = await buildCar(d);
  const buildMs = Math.round(performance.now() - t0);
  current = root; scene.add(root);
  renderer.setScissorTest(true);
  for (const v of views) { const [x, y, w, h] = v.rect; renderer.setViewport(x, y, w, h); renderer.setScissor(x, y, w, h); renderer.render(scene, v.cam); }
  const glb = await exportGLB(root);
  return { id: d.id, buildMs, stats, glbBytes: glb.byteLength, glb: toB64(glb) };
};
(window as any).ready = true;
