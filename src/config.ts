/**
 * All the numbers that control how the game looks and feels, in one place.
 * Tweak these to change the driving feel without touching the game code.
 * Units: metres, seconds, kilograms, newtons, radians.
 */

export const PHYSICS = {
  /** Gravity is a bit stronger than real life so the car feels planted. */
  gravity: -14,
  /** Physics runs at a fixed 60 steps per second for consistent handling. */
  fixedTimeStep: 1 / 60,
  /** Stop the game "catching up" too much after a long pause. */
  maxStepsPerFrame: 5,
};

export const CAR = {
  mass: 1200,
  /** Half sizes of the invisible physics box that represents the car body. */
  chassisHalfExtents: { x: 0.86, y: 0.25, z: 2.05 },
  chassisColliderOffsetY: 0.15,
  /** A low centre of mass stops the car from rolling over in corners. */
  centerOfMassY: -0.3,

  wheelRadius: 0.36,
  wheelWidth: 0.3,
  /** Distance of wheels from the car's centre line. */
  wheelTrackHalf: 0.84,
  /** Forward (+) and backward (-) position of the front and rear axles. */
  frontAxleZ: 1.32,
  rearAxleZ: -1.28,

  suspensionRestLength: 0.32,
  suspensionStiffness: 30,
  suspensionCompression: 3.2,
  suspensionRelaxation: 4.4,
  maxSuspensionTravel: 0.3,
  maxSuspensionForce: 100000,

  /** Tyre grip. Higher = more grip. */
  frontGrip: 3.0,
  rearGrip: 2.9,
  /** Rear grip while the handbrake is held (lets the car slide). */
  handbrakeRearGrip: 0.9,

  /** Engine force per wheel (all four wheels drive). */
  engineForce: 2600,
  reverseForce: 1600,
  /** Top speed in metres per second (about 200 km/h). */
  topSpeed: 56,
  topReverseSpeed: 12,
  /** Braking strength per wheel. */
  brakeForce: 45,
  handbrakeForce: 60,
  /** Gentle braking when no pedal is pressed, so the car coasts to a stop. */
  coastBrake: 1.2,

  /** Steering angle at low speed and at top speed (radians). */
  maxSteerAngle: 0.55,
  minSteerAngleAtTopSpeed: 0.12,
  /** How quickly the wheels turn towards / back to centre (radians per second). */
  steerSpeed: 2.6,
  steerReturnSpeed: 4.0,

  /** Extra push into the ground at speed (improves grip and stability). */
  downforce: 1.6,

  /** Spawn position and direction on the test track. */
  spawnHeight: 1.0,
};

export const CAMERA = {
  fov: 62,
  /** Extra field of view at top speed, for a sense of speed. */
  fovBoost: 12,
  distance: 6.4,
  /** Extra distance at top speed. */
  distanceBoost: 1.6,
  height: 2.3,
  lookAhead: 4,
  lookHeight: 1.0,
  /** How quickly the camera swings round behind the car (higher = snappier). */
  rotationSmoothing: 5,
  heightSmoothing: 6,
  near: 0.1,
  far: 3000,
};

export const TRACK = {
  /** Width of the asphalt. */
  width: 14,
  /** Red-and-white kerbs, placed on the corners. */
  curbWidth: 1.2,
  /** Corners tighter than this radius get kerbs. */
  curbCornerRadius: 140,
  /** Grass between the kerb and the safety barrier. */
  runoffWidth: 7,
  barrierHeight: 1.0,
  barrierThickness: 0.6,
};
