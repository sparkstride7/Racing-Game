import * as THREE from 'three';
import { CAR, TRACK } from '../config';
import type { DriveControls } from '../input/Input';
import { clamp, damp, lerp } from '../utils/math';
import type { Car } from '../vehicle/Car';
import type { RacingLine } from './RacingLine';
import type { TrackProgress } from './TrackProgress';

/** How an AI driver drives. Every opponent has the same car; only these skills differ. */
export interface DriverSkill {
  /** Cornering confidence: sideways grip the driver dares to use (m/s²). Higher = faster through corners. */
  cornerGrip: number;
  /** How hard the driver plans to brake (m/s²). Higher = brakes later. */
  braking: number;
  /** Preferred side of the road on straights (metres from the racing line, + = left). */
  lane: number;
  /** Seconds to react when the lights go out. */
  reaction: number;
}

/** What the driver needs to know about another car to avoid it. */
export interface Traffic {
  distance: number;
  lateral: number;
  speed: number;
}

const WHEELBASE = CAR.frontAxleZ - CAR.rearAxleZ;
const FORWARD = new THREE.Vector3(0, 0, 1);

/**
 * Drives a car around the track like a human would:
 * - looks ahead along the racing line and steers towards a point on it
 * - follows a speed plan, braking before corners and accelerating out of them
 * - moves aside to overtake slower cars and backs off to avoid running into them.
 * It produces the same controls as the player's keyboard/touchscreen, so it is never given extra power or grip.
 */
export class AIDriver {
  private readonly plan: Float32Array;
  private avoidOffset = 0;
  private stuckTime = 0;
  private readonly forward = new THREE.Vector3();
  private readonly quat = new THREE.Quaternion();
  private readonly target = new THREE.Vector3();

  constructor(
    readonly car: Car,
    private readonly line: RacingLine,
    readonly progress: TrackProgress,
    readonly skill: DriverSkill,
  ) {
    this.plan = line.speedPlan(skill.cornerGrip, skill.braking);
  }

  /** True when the car has been stopped for a while (crashed into something); the race then puts it back on track. */
  get isStuck() {
    return this.stuckTime > 2.5;
  }

  resetStuck() {
    this.stuckTime = 0;
  }

  /**
   * Decide this step's controls.
   * `raceTime` is seconds since the green light (negative during the countdown).
   * `traffic` lists nearby cars (distance along the track, + = ahead; sideways position; speed).
   */
  drive(dt: number, raceTime: number, traffic: Traffic[], paceFactor = 1): DriveControls {
    const controls: DriveControls = { throttle: 0, brake: 0, steer: 0, handbrake: false };
    if (raceTime < this.skill.reaction) return controls;

    const line = this.line;
    const n = line.count;
    const samples = line.path.samples;
    const body = this.car.body;
    const pos = body.translation();
    const r = body.rotation();
    this.quat.set(r.x, r.y, r.z, r.w);
    this.forward.copy(FORWARD).applyQuaternion(this.quat);
    const speed = this.car.forwardSpeed;
    const index = this.progress.index;
    const myLateral = this.progress.lateralOffset(pos);

    // --- Speed plan. ---
    let targetSpeed = Infinity;
    for (let k = 1; k <= 4; k++) targetSpeed = Math.min(targetSpeed, this.plan[(index + k) % n]);
    targetSpeed *= paceFactor;

    // --- Traffic: overtake slower cars, don't drive into them, leave room for cars alongside. ---
    const maxOffset = TRACK.width / 2 - 1.4;
    let wantedAvoid = 0;
    for (const t of traffic) {
      const latDiff = t.lateral - myLateral;
      if (Math.abs(t.distance) < 6) {
        // Side by side: keep at least a car's width apart.
        if (Math.abs(latDiff) < 3) {
          const away = latDiff > 0 ? -1 : 1;
          wantedAvoid = clamp(t.lateral + away * 3.1 - this.lineOffset(index), -7, 7);
        }
        continue;
      }
      if (t.distance < 0 || Math.abs(latDiff) > 2.4) continue;
      if (speed > t.speed - 0.5 && t.distance < 30) {
        // Faster than the car ahead: pull out on the side with more room.
        const roomLeft = maxOffset - t.lateral;
        const roomRight = t.lateral + maxOffset;
        const passLateral = roomLeft > roomRight ? t.lateral + 3.2 : t.lateral - 3.2;
        wantedAvoid = clamp(passLateral - this.lineOffset(index), -7, 7);
      }
      // Close behind: keep about 7 m (centre to centre) instead of bumping.
      if (t.distance < 14) targetSpeed = Math.min(targetSpeed, t.speed + (t.distance - 7) * 0.6);
    }
    this.avoidOffset = damp(this.avoidOffset, wantedAvoid, 2.5, dt);

    // --- Steering: aim at a point further down the racing line (further when faster). ---
    const lookAhead = clamp(6 + Math.abs(speed) * 0.42, 7, 28);
    const ahead = (index + Math.round(lookAhead / line.step)) % n;
    const s = samples[ahead];
    const lateral = clamp(this.lineOffset(ahead) + this.avoidOffset, -maxOffset - 0.2, maxOffset + 0.2);
    this.target.copy(s.point).addScaledVector(s.left, lateral);
    const dx = this.target.x - pos.x;
    const dz = this.target.z - pos.z;
    const distance = Math.max(Math.hypot(dx, dz), 1);
    // Angle to the target: positive = target is to the left.
    const angle = Math.atan2(this.forward.z * dx - this.forward.x * dz, this.forward.x * dx + this.forward.z * dz);
    const wheelAngle = Math.atan2(2 * WHEELBASE * Math.sin(angle), distance);
    const speedRatio = clamp(Math.abs(speed) / CAR.topSpeed, 0, 1);
    const maxWheelAngle = lerp(CAR.maxSteerAngle, CAR.minSteerAngleAtTopSpeed, speedRatio);
    controls.steer = clamp(-wheelAngle / maxWheelAngle, -1, 1);

    // --- Pedals. ---
    const error = targetSpeed - speed;
    if (error > 0) {
      controls.throttle = clamp(error / 2, 0.15, 1);
    } else if (error < -1 && speed > 3) {
      controls.brake = clamp(-error / 4, 0.2, 1);
    }

    // --- Stuck detection. ---
    this.stuckTime = Math.abs(speed) < 1.5 ? this.stuckTime + dt : 0;
    return controls;
  }

  /** The driver's own line: the shared racing line plus their preferred lane on the straights. */
  private lineOffset(index: number) {
    const straightness = 1 - clamp(Math.abs(this.line.curvature[index]) * 60, 0, 1);
    return this.line.offset[index] + this.skill.lane * straightness;
  }
}
