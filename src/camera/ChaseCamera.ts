import * as THREE from 'three';
import { CAMERA, CAR } from '../config';
import { clamp, damp, dampAngle } from '../utils/math';

/**
 * Third-person camera.
 * - "showcase": slowly circles the car (start screen).
 * - "chase": follows behind the car, swinging round smoothly in corners,
 *   pulling back and widening the view as speed builds.
 */
export class ChaseCamera {
  readonly camera: THREE.PerspectiveCamera;

  private mode: 'showcase' | 'chase' = 'showcase';
  private transition = 1;
  private yaw = 0;
  private height = 0;
  private speedEffect = 0;
  private showcaseAngle = 0.9;
  private initialized = false;

  private readonly forward = new THREE.Vector3();
  private readonly chasePos = new THREE.Vector3();
  private readonly chaseLook = new THREE.Vector3();
  private readonly showcasePos = new THREE.Vector3();
  private readonly showcaseLook = new THREE.Vector3();
  private readonly lookAt = new THREE.Vector3();

  constructor(aspect: number) {
    this.camera = new THREE.PerspectiveCamera(CAMERA.fov, aspect, CAMERA.near, CAMERA.far);
  }

  /** Switch from the start-screen orbit to following the car. */
  startChase() {
    this.mode = 'chase';
    this.transition = 0;
  }

  setAspect(aspect: number) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  update(target: THREE.Object3D, speed: number, dt: number) {
    const carPos = target.position;
    this.forward.set(0, 0, 1).applyQuaternion(target.quaternion);
    const carYaw = Math.atan2(this.forward.x, this.forward.z);

    if (!this.initialized) {
      this.yaw = carYaw;
      this.height = carPos.y;
      this.initialized = true;
    }

    // Phones held upright show less sideways, so pull back and widen the view.
    const portrait = this.camera.aspect < 1;
    const speedRatio = clamp(Math.abs(speed) / CAR.topSpeed, 0, 1);
    this.speedEffect = damp(this.speedEffect, speedRatio * speedRatio, 3, dt);

    // --- Chase position: behind the car, using a smoothed heading so corners feel fluid. ---
    this.yaw = dampAngle(this.yaw, carYaw, CAMERA.rotationSmoothing, dt);
    this.height = damp(this.height, carPos.y, CAMERA.heightSmoothing, dt);
    const distance = (CAMERA.distance + CAMERA.distanceBoost * this.speedEffect) * (portrait ? 1.25 : 1);
    const sin = Math.sin(this.yaw);
    const cos = Math.cos(this.yaw);
    this.chasePos.set(
      carPos.x - sin * distance,
      this.height + CAMERA.height * (portrait ? 1.2 : 1),
      carPos.z - cos * distance,
    );
    this.chaseLook.set(
      carPos.x + sin * CAMERA.lookAhead,
      this.height + CAMERA.lookHeight,
      carPos.z + cos * CAMERA.lookAhead,
    );

    // --- Showcase orbit for the start screen. ---
    this.showcaseAngle += dt * 0.22;
    this.showcasePos.set(
      carPos.x + Math.sin(carYaw + this.showcaseAngle) * 7.5,
      carPos.y + 1.4,
      carPos.z + Math.cos(carYaw + this.showcaseAngle) * 7.5,
    );
    this.showcaseLook.set(carPos.x, carPos.y + 0.2, carPos.z);

    // --- Blend between the two (only during the start transition). ---
    if (this.mode === 'chase') this.transition = Math.min(1, this.transition + dt / 1.4);
    const t = this.mode === 'chase' ? easeInOut(this.transition) : 0;
    this.camera.position.lerpVectors(this.showcasePos, this.chasePos, t);
    this.lookAt.lerpVectors(this.showcaseLook, this.chaseLook, t);
    this.camera.position.y = Math.max(this.camera.position.y, 0.4); // never go under the ground
    this.camera.lookAt(this.lookAt);

    const fov = (CAMERA.fov + CAMERA.fovBoost * this.speedEffect * t) * (portrait ? 1.35 : 1);
    if (Math.abs(fov - this.camera.fov) > 0.01) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }
  }
}

const easeInOut = (t: number) => t * t * (3 - 2 * t);
