import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { DynamicRayCastVehicleController, RigidBody, World } from '@dimforge/rapier3d-compat';
import { CAR } from '../config';
import type { DriveControls } from '../input/Input';
import { clamp, lerp, moveTowards } from '../utils/math';
import { createCarModel, type CarModel, type CarStyle, MODEL_GROUND_OFFSET, PLAYER_STYLE } from './CarModel';
import { getCarTemplate } from './carAssets';
import { GlbCarModel } from './GlbCarModel';
import { createV1Car, disposeV1Car, type CarLook } from './playerCar';

/** Wheel order used everywhere: front-left, front-right, rear-left, rear-right. */
const WHEELS = [
  { x: CAR.wheelTrackHalf, z: CAR.frontAxleZ, front: true },
  { x: -CAR.wheelTrackHalf, z: CAR.frontAxleZ, front: true },
  { x: CAR.wheelTrackHalf, z: CAR.rearAxleZ, front: false },
  { x: -CAR.wheelTrackHalf, z: CAR.rearAxleZ, front: false },
];

/** The car's local forward direction (+Z). */
const FORWARD = new THREE.Vector3(0, 0, 1);

/**
 * A drivable car: a Rapier physics body with four ray-cast wheels,
 * plus the 3D model that follows it.
 *
 * "Arcade" helpers on top of the physics make it fun and easy to drive:
 * speed-sensitive steering, smooth steering input, downforce, auto-reverse and auto-reset.
 */
export class Car {
  /** Add this to the scene. Its position/rotation are smoothed between physics steps. */
  readonly object = new THREE.Group();
  readonly body: RigidBody;
  private readonly vehicle: DynamicRayCastVehicleController;
  /** A code-built car (the Original Car V1, or the built-in car used when the 3D model files are not loaded), or null. */
  private model: CarModel | null = null;
  /** The 3D model car with its three detail levels, or null. */
  private glb: GlbCarModel | null = null;
  /** Which car this is drawn as (only the player's car can be switched; the opponents are always 'sports'). */
  private currentLook: CarLook = 'sports';

  private steerAngle = 0;
  private upsideDownTime = 0;
  private readonly spawnPosition = new THREE.Vector3();
  private readonly spawnRotation = new THREE.Quaternion();

  // Previous and current physics poses, blended for smooth rendering.
  private readonly prevPos = new THREE.Vector3();
  private readonly currPos = new THREE.Vector3();
  private readonly prevQuat = new THREE.Quaternion();
  private readonly currQuat = new THREE.Quaternion();

  private readonly tmpVec = new THREE.Vector3();
  private readonly tmpQuat = new THREE.Quaternion();

  /**
   * If set, called instead of the normal reset when the car is stuck upside down
   * (a race uses this to put the car back on the track where it was, not on the grid).
   */
  onAutoReset: (() => void) | null = null;

  constructor(
    world: World,
    private readonly style: CarStyle = PLAYER_STYLE,
    look: CarLook = 'sports',
  ) {
    // Physics body. Mass and balance are set by hand so we control the centre of mass.
    const bodyDesc = RAPIER.RigidBodyDesc.dynamic()
      .setAdditionalMassProperties(
        CAR.mass,
        { x: 0, y: CAR.centerOfMassY, z: 0 },
        { x: 2200, y: 2400, z: 700 },
        { x: 0, y: 0, z: 0, w: 1 },
      )
      .setLinearDamping(0.05)
      .setAngularDamping(0.4)
      .setCanSleep(false);
    this.body = world.createRigidBody(bodyDesc);

    const h = CAR.chassisHalfExtents;
    world.createCollider(
      RAPIER.ColliderDesc.cuboid(h.x, h.y, h.z)
        .setTranslation(0, CAR.chassisColliderOffsetY, 0)
        .setDensity(0)
        .setFriction(0.3),
      this.body,
    );

    // Ray-cast wheels: each wheel is a spring that pushes the body up off the ground.
    this.vehicle = world.createVehicleController(this.body);
    this.vehicle.indexUpAxis = 1;
    // Rapier's setter for the forward axis has an unusual name; 2 = the Z axis.
    this.vehicle.setIndexForwardAxis = 2;
    WHEELS.forEach((w, i) => {
      this.vehicle.addWheel(
        { x: w.x, y: 0, z: w.z },
        { x: 0, y: -1, z: 0 },
        { x: -1, y: 0, z: 0 },
        CAR.suspensionRestLength,
        CAR.wheelRadius,
      );
      this.vehicle.setWheelSuspensionStiffness(i, CAR.suspensionStiffness);
      this.vehicle.setWheelSuspensionCompression(i, CAR.suspensionCompression);
      this.vehicle.setWheelSuspensionRelaxation(i, CAR.suspensionRelaxation);
      this.vehicle.setWheelMaxSuspensionTravel(i, CAR.maxSuspensionTravel);
      this.vehicle.setWheelMaxSuspensionForce(i, CAR.maxSuspensionForce);
      this.vehicle.setWheelFrictionSlip(i, w.front ? CAR.frontGrip : CAR.rearGrip);
    });

    this.showLook(look);
  }

  /**
   * Switches what the car looks like (the player's car on the car-selection screen).
   * Only the 3D model is swapped: the physics body, its position and its speed are not touched.
   */
  setLook(look: CarLook) {
    if (look === this.currentLook) return;
    this.removeLook();
    this.showLook(look);
  }

  get look() {
    return this.currentLook;
  }

  /** Builds the 3D model. It sits lower than the physics origin (which is at axle height + suspension). */
  private showLook(look: CarLook) {
    this.currentLook = look;
    if (look === 'v1') {
      this.showCodeBuiltCar(createV1Car());
      return;
    }
    // The New Sports Car: the loaded model file if there is one, otherwise the built-in car.
    const template = getCarTemplate(this.style.body ?? 'exotic');
    if (template) {
      this.glb = new GlbCarModel(template, this.style);
      this.glb.root.position.y = -MODEL_GROUND_OFFSET;
      this.object.add(this.glb.root);
    } else {
      this.showCodeBuiltCar(createCarModel(this.style));
    }
  }

  private showCodeBuiltCar(model: CarModel) {
    this.model = model;
    model.body.position.y = -MODEL_GROUND_OFFSET;
    this.object.add(model.body);
    model.wheels.forEach((wheel) => this.object.add(wheel.pivot));
  }

  private removeLook() {
    if (this.glb) {
      this.object.remove(this.glb.root);
      this.glb.dispose();
      this.glb = null;
    }
    if (this.model) {
      this.object.remove(this.model.body, ...this.model.wheels.map((w) => w.pivot));
      if (this.currentLook === 'v1') disposeV1Car(this.model);
      else disposeMaterials(this.model); // the built-in car's shapes are shared by all cars, so only its colours are freed
      this.model = null;
    }
  }

  /**
   * What this car shows: 'v1' = the Original Car, 'model' = the sports car model file, 'built-in' = the simple
   * code-built car (when the model files are not loaded); its detail level; and whether race numbers are shown.
   */
  get visualInfo() {
    const kind = this.glb ? ('model' as const) : this.currentLook === 'v1' ? ('v1' as const) : ('built-in' as const);
    return { kind, level: this.glb ? this.glb.currentLevel : 0, numbers: !!this.object.getObjectByName('Race_Numbers') };
  }

  /** Places the car (used at the start and when resetting). */
  setSpawn(position: THREE.Vector3, heading: number) {
    this.spawnPosition.copy(position);
    this.spawnRotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, heading);
    this.reset();
  }

  /** Moves the car to a spot (stopped), without changing where it resets to. */
  placeAt(position: THREE.Vector3, heading: number) {
    const savedPosition = this.spawnPosition.clone();
    const savedRotation = this.spawnRotation.clone();
    this.setSpawn(position, heading);
    this.spawnPosition.copy(savedPosition);
    this.spawnRotation.copy(savedRotation);
  }

  reset() {
    const p = this.spawnPosition;
    const q = this.spawnRotation;
    this.body.setTranslation({ x: p.x, y: p.y + CAR.spawnHeight, z: p.z }, true);
    this.body.setRotation({ x: q.x, y: q.y, z: q.z, w: q.w }, true);
    this.body.setLinvel({ x: 0, y: 0, z: 0 }, true);
    this.body.setAngvel({ x: 0, y: 0, z: 0 }, true);
    this.steerAngle = 0;
    this.upsideDownTime = 0;
    this.storePose();
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);
  }

  /** Speed along the direction the car is facing, in metres per second (negative when reversing). */
  get forwardSpeed(): number {
    const v = this.body.linvel();
    const r = this.body.rotation();
    this.tmpQuat.set(r.x, r.y, r.z, r.w);
    this.tmpVec.copy(FORWARD).applyQuaternion(this.tmpQuat);
    return this.tmpVec.x * v.x + this.tmpVec.y * v.y + this.tmpVec.z * v.z;
  }

  get speedKmh(): number {
    return Math.abs(this.forwardSpeed) * 3.6;
  }

  /** Called once per physics step, before the world steps. */
  fixedUpdate(controls: DriveControls, dt: number) {
    this.prevPos.copy(this.currPos);
    this.prevQuat.copy(this.currQuat);

    const speed = this.forwardSpeed;
    const speedRatio = clamp(Math.abs(speed) / CAR.topSpeed, 0, 1);

    // --- Steering: smooth, and less sensitive at high speed. ---
    const maxAngle = lerp(CAR.maxSteerAngle, CAR.minSteerAngleAtTopSpeed, speedRatio);
    // Positive physics steering turns left, while controls use +1 for right.
    const targetAngle = -controls.steer * maxAngle;
    const rate = controls.steer !== 0 ? CAR.steerSpeed : CAR.steerReturnSpeed;
    this.steerAngle = moveTowards(this.steerAngle, targetAngle, rate * dt);

    // --- Pedals: accelerate, brake, and reverse once stopped. ---
    let engine = 0;
    let brake = CAR.coastBrake;
    if (controls.throttle > 0) {
      if (speed < -1) {
        brake = CAR.brakeForce * controls.throttle; // rolling backwards: gas pedal brakes first
      } else {
        const power = 1 - Math.pow(clamp(speed / CAR.topSpeed, 0, 1), 2);
        engine = CAR.engineForce * controls.throttle * power;
        brake = 0;
      }
    }
    if (controls.brake > 0) {
      if (speed > 1) {
        brake = CAR.brakeForce * controls.brake;
        engine = 0;
      } else if (controls.throttle === 0) {
        const power = speed > -CAR.topReverseSpeed ? 1 : 0;
        engine = -CAR.reverseForce * controls.brake * power;
        brake = 0;
      }
    }

    WHEELS.forEach((w, i) => {
      this.vehicle.setWheelSteering(i, w.front ? this.steerAngle : 0);
      this.vehicle.setWheelEngineForce(i, engine);
      let wheelBrake = brake;
      let grip = w.front ? CAR.frontGrip : CAR.rearGrip;
      if (controls.handbrake && !w.front) {
        wheelBrake = CAR.handbrakeForce;
        grip = CAR.handbrakeRearGrip;
      }
      this.vehicle.setWheelBrake(i, wheelBrake);
      this.vehicle.setWheelFrictionSlip(i, grip);
    });

    // --- Downforce: pushes the car into the road at speed for grip and stability. ---
    const r = this.body.rotation();
    this.tmpQuat.set(r.x, r.y, r.z, r.w);
    this.tmpVec.set(0, -1, 0).applyQuaternion(this.tmpQuat);
    const down = CAR.downforce * speed * speed * dt;
    this.body.applyImpulse({ x: this.tmpVec.x * down, y: this.tmpVec.y * down, z: this.tmpVec.z * down }, true);

    // Wheels only touch the ground and track, never other cars.
    this.vehicle.updateVehicle(dt, RAPIER.QueryFilterFlags.EXCLUDE_DYNAMIC);

    // --- Auto-reset if the car stays on its side or roof. ---
    this.tmpVec.set(0, 1, 0).applyQuaternion(this.tmpQuat);
    this.upsideDownTime = this.tmpVec.y < 0.3 ? this.upsideDownTime + dt : 0;
    if (this.upsideDownTime > 2 || this.body.translation().y < -20) {
      if (this.onAutoReset) {
        this.upsideDownTime = 0;
        this.onAutoReset();
      } else this.reset();
    }
  }

  /** Removes the car from the physics world (its 3D object must be removed from the scene separately). */
  dispose(world: World) {
    world.removeVehicleController(this.vehicle);
    world.removeRigidBody(this.body);
    this.removeLook();
  }

  /** Called after each physics step. */
  postStep() {
    this.storePose();
  }

  /** Called once per rendered frame. `alpha` blends between the last two physics steps. */
  render(alpha: number) {
    this.object.position.lerpVectors(this.prevPos, this.currPos, alpha);
    this.object.quaternion.slerpQuaternions(this.prevQuat, this.currQuat, alpha);

    // Wheels follow the suspension, steering and spin from the physics.
    for (let i = 0; i < 4; i++) {
      const suspension = this.vehicle.wheelSuspensionLength(i) ?? CAR.suspensionRestLength;
      const steering = this.vehicle.wheelSteering(i) ?? 0;
      const rotation = this.vehicle.wheelRotation(i) ?? 0;
      if (this.model) {
        const wheel = this.model.wheels[i];
        wheel.pivot.position.set(WHEELS[i].x, -suspension, WHEELS[i].z);
        wheel.pivot.rotation.y = steering;
        wheel.spin.rotation.x = rotation;
      }
      if (this.glb) {
        // The model's wheel pivots live inside the model, which is lowered by MODEL_GROUND_OFFSET; add it back.
        // All three detail levels are updated so whichever one the renderer shows is correct.
        for (const wheels of this.glb.levelWheels) {
          const wheel = wheels[i];
          wheel.pivot.position.set(WHEELS[i].x, MODEL_GROUND_OFFSET - suspension, WHEELS[i].z);
          wheel.pivot.rotation.y = steering;
          wheel.spin.rotation.x = rotation;
        }
      }
    }
  }

  private storePose() {
    const p = this.body.translation();
    const r = this.body.rotation();
    this.currPos.set(p.x, p.y, p.z);
    this.currQuat.set(r.x, r.y, r.z, r.w);
  }
}

/** Frees a code-built car's materials (not its shapes, which are shared). */
function disposeMaterials(model: CarModel) {
  for (const root of [model.body, ...model.wheels.map((w) => w.pivot)]) {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.map?.dispose();
      material.dispose();
    });
  }
}
