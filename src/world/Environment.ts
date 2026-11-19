import * as THREE from 'three';
import { Sky } from 'three/addons/objects/Sky.js';
import { LAYERS } from '../config';

export interface EnvironmentOptions {
  shadowMapSize: number;
}

/**
 * Sky, sunlight, fog and reflections.
 * The sun's shadow follows the car, so shadows stay sharp wherever you drive.
 */
export class Environment {
  readonly sun: THREE.DirectionalLight;
  private readonly sunDirection: THREE.Vector3;

  constructor(scene: THREE.Scene, renderer: THREE.WebGLRenderer, options: EnvironmentOptions) {
    // Late-afternoon sun: low enough for long shadows and warm light.
    const elevation = THREE.MathUtils.degToRad(28);
    const azimuth = THREE.MathUtils.degToRad(215);
    this.sunDirection = new THREE.Vector3().setFromSphericalCoords(1, Math.PI / 2 - elevation, azimuth);

    // Physically based sky.
    const sky = createSky(this.sunDirection);
    scene.add(sky);

    // Reflections on the car paint come from a blurred copy of the sky.
    const pmrem = new THREE.PMREMGenerator(renderer);
    const envScene = new THREE.Scene();
    envScene.add(createSky(this.sunDirection));
    const ground = new THREE.Mesh(
      new THREE.CircleGeometry(900, 32).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x4d5a3a }),
    );
    ground.position.y = -1;
    envScene.add(ground);
    scene.environment = pmrem.fromScene(envScene, 0.02).texture;
    scene.environmentIntensity = 0.7;
    pmrem.dispose();

    // Haze in the distance, matching the sky near the horizon.
    scene.fog = new THREE.Fog(0xbfd2df, 180, 1300);

    // Soft fill light from the sky and ground.
    scene.add(new THREE.HemisphereLight(0xd6e8ff, 0x55603f, 0.55));

    // The sun.
    this.sun = new THREE.DirectionalLight(0xfff0dc, 2.5);
    this.sun.castShadow = true;
    this.sun.shadow.camera.layers.enable(LAYERS.shadowOnly); // shadow-only copies of the cars
    this.sun.shadow.mapSize.set(options.shadowMapSize, options.shadowMapSize);
    const c = this.sun.shadow.camera;
    c.left = -40;
    c.right = 40;
    c.top = 40;
    c.bottom = -40;
    c.near = 1;
    c.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.03;
    scene.add(this.sun);
    scene.add(this.sun.target);
  }

  /** Keeps the area with sharp shadows centred on `focus` (the player's car). */
  update(focus: THREE.Vector3) {
    // Snap to whole metres so shadow edges don't shimmer while moving.
    const fx = Math.round(focus.x);
    const fz = Math.round(focus.z);
    this.sun.target.position.set(fx, 0, fz);
    this.sun.position.set(fx, 0, fz).addScaledVector(this.sunDirection, 200);
  }
}

function createSky(sunDirection: THREE.Vector3) {
  const sky = new Sky();
  sky.scale.setScalar(2500);
  const u = sky.material.uniforms;
  u.turbidity.value = 6;
  u.rayleigh.value = 1.6;
  u.mieCoefficient.value = 0.004;
  u.mieDirectionalG.value = 0.85;
  u.sunPosition.value.copy(sunDirection);
  return sky;
}
