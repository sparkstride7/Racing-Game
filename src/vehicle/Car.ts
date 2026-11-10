import * as THREE from 'three';
import RAPIER from '@dimforge/rapier3d-compat';
import type { DynamicRayCastVehicleController, RigidBody, World } from '@dimforge/rapier3d-compat';
import { CAR } from '../config';
import type { DriveControls } from '../input/Input';
import { clamp, lerp, moveTowards } from '../utils/math';
import { createCarModel, type CarModel, MODEL_GROUND_OFFSET } from './CarModel';

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
  private readonly model: CarModel;

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

  constructor(world: World, paintColor = 0xe3262f) {
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

    // 3D model. The body model sits lower than the physics origin (which is at axle height + suspension).
    this.model = createCarModel(paintColor);
    this.model.body.position.y = -MODEL_GROUND_OFFSET;
    this.object.add(this.model.body);
    this.model.wheels.forEach((wheel) => this.object.add(wheel.pivot));
  }

  /** Places the car (used at the start and when resetting). */
  setSpawn(position: THREE.Vector3, heading: number) {
    this.spawnPosition.copy(position);
    this.spawnRotation.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, heading);
    this.reset();
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

    this.vehicle.updateVehicle(dt);

    // --- Auto-reset if the car stays on its side or roof. ---
    this.tmpVec.set(0, 1, 0).applyQuaternion(this.tmpQuat);
    this.upsideDownTime = this.tmpVec.y < 0.3 ? this.upsideDownTime + dt : 0;
    if (this.upsideDownTime > 2 || this.body.translation().y < -20) this.reset();
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
    this.model.wheels.forEach((wheel, i) => {
      const suspension = this.vehicle.wheelSuspensionLength(i) ?? CAR.suspensionRestLength;
      wheel.pivot.position.set(WHEELS[i].x, -suspension, WHEELS[i].z);
      wheel.pivot.rotation.y = this.vehicle.wheelSteering(i) ?? 0;
      wheel.spin.rotation.x = this.vehicle.wheelRotation(i) ?? 0;
    });
  }

  private storePose() {
    const p = this.body.translation();
    const r = this.body.rotation();
    this.currPos.set(p.x, p.y, p.z);
    this.currQuat.set(r.x, r.y, r.z, r.w);
  }
}
