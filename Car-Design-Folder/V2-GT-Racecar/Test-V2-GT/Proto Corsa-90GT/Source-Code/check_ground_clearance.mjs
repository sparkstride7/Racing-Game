// Ground clearance checks.
//
//   node check_ground_clearance.mjs <model.glb>
//
// The ground is at y = 0 (the bottom of the tyres). Reports, using every point of every part except the wheels:
//   - the lowest parts and their height above the ground;
//   - approach angle (the steepest slope the front can meet without the front overhang touching), departure angle
//     (the same at the back) and ramp angle (the sharpest crest the car can drive over without the middle touching);
//   - the lowest point if the body tips 2 degrees nose-down or nose-up (hard braking / accelerating) or 3 degrees
//     to either side (cornering), turning about a point at axle height midway between the axles.
// Read-only: the model file is not changed.
import { NodeIO } from '@gltf-transform/core';

const doc = await new NodeIO().read(process.argv[2]);
const WHEEL = /^(Wheel|Rim|Spoke|Disc|Caliper)_/;
const rows = [], points = [];
let front = null, rear = null, axleY = 0;
for (const n of doc.getRoot().listNodes()) {
  const m = n.getMesh();
  if (!m) continue;
  const P = m.listPrimitives()[0].getAttribute('POSITION');
  if (/^Wheel_(FR|RR)$/.test(n.getName())) {
    const a = P.getMin([]), b = P.getMax([]);
    const c = { z: (a[2] + b[2]) / 2, y: (a[1] + b[1]) / 2 };
    if (n.getName() === 'Wheel_FR') front = c; else rear = c;
    axleY = c.y;
  }
  if (WHEEL.test(n.getName())) continue;
  let lowest = Infinity;
  for (const prim of m.listPrimitives()) {
    const A = prim.getAttribute('POSITION');
    for (let i = 0; i < A.getCount(); i++) { const p = A.getElement(i, []); lowest = Math.min(lowest, p[1]); points.push(p); }
  }
  rows.push({ part: n.getName(), lowestPointMm: Math.round(lowest * 10000) / 10 });
}
rows.sort((a, b) => a.lowestPointMm - b.lowestPointMm);
const deg = (r) => +((r * 180) / Math.PI).toFixed(1);
let approach = Infinity, departure = Infinity, ramp = Infinity;
for (const [, y, z] of points) {
  if (z > front.z) approach = Math.min(approach, Math.atan2(y, z - front.z));
  else if (z < rear.z) departure = Math.min(departure, Math.atan2(y, rear.z - z));
  else ramp = Math.min(ramp, Math.atan2(y, z - rear.z) + Math.atan2(y, front.z - z));
}
const mid = (front.z + rear.z) / 2, tilted = {};
for (const [label, ax, angle] of [['nose down 2°', 'x', 2], ['nose up 2°', 'x', -2], ['roll left 3°', 'z', 3], ['roll right 3°', 'z', -3]]) {
  const c = Math.cos((angle * Math.PI) / 180), s = Math.sin((angle * Math.PI) / 180);
  let lo = Infinity;
  for (const [x, y, z] of points) {
    const dy = y - axleY;
    const ny = ax === 'x' ? axleY + dy * c - (z - mid) * s : axleY + dy * c + x * s;
    lo = Math.min(lo, ny);
  }
  tilted[label] = Math.round(lo * 10000) / 10;
}
console.log(JSON.stringify({
  lowestParts: rows.slice(0, 6),
  anyPartBelowGround: rows.some((r) => r.lowestPointMm < 0),
  approachAngleDeg: deg(approach), departureAngleDeg: deg(departure), rampAngleDeg: deg(ramp),
  lowestPointMmWithBodyTipped: tilted,
}, null, 1));
