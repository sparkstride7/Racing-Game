// Shape toolkit for sculpting car bodies: signed distance functions (SDF), blending, and a mesher.
import * as THREE from 'three';

export const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
export const mix = (a: number, b: number, t: number) => a + (b - a) * t;

/** Smooth union / intersection (k = blend radius in metres). */
export function smin(a: number, b: number, k: number) {
  if (k <= 0) return Math.min(a, b);
  const h = clamp(0.5 + (0.5 * (b - a)) / k, 0, 1);
  return mix(b, a, h) - k * h * (1 - h);
}
export const smax = (a: number, b: number, k: number) => -smin(-a, -b, k);

export function sdEllipsoid(x: number, y: number, z: number, rx: number, ry: number, rz: number) {
  const k0 = Math.hypot(x / rx, y / ry, z / rz);
  const k1 = Math.hypot(x / (rx * rx), y / (ry * ry), z / (rz * rz));
  return k1 === 0 ? -Math.min(rx, ry, rz) : (k0 * (k0 - 1)) / k1;
}
export function sdRoundBox(x: number, y: number, z: number, bx: number, by: number, bz: number, r: number) {
  const qx = Math.abs(x) - bx + r;
  const qy = Math.abs(y) - by + r;
  const qz = Math.abs(z) - bz + r;
  return Math.hypot(Math.max(qx, 0), Math.max(qy, 0), Math.max(qz, 0)) + Math.min(Math.max(qx, qy, qz), 0) - r;
}
/** 2D isosceles trapezoid: half-width r1 at bottom (y=-he), r2 at top (y=+he). */
export function sdTrapezoid(px: number, py: number, r1: number, r2: number, he: number) {
  const k1x = r2, k1y = he;
  const k2x = r2 - r1, k2y = 2 * he;
  px = Math.abs(px);
  const cax = px - Math.min(px, py < 0 ? r1 : r2);
  const cay = Math.abs(py) - he;
  const t = clamp(((k1x - px) * k2x + (k1y - py) * k2y) / (k2x * k2x + k2y * k2y), 0, 1);
  const cbx = px - k1x + k2x * t;
  const cby = py - k1y + k2y * t;
  const s = cbx < 0 && cay < 0 ? -1 : 1;
  return s * Math.sqrt(Math.min(cax * cax + cay * cay, cbx * cbx + cby * cby));
}
export function sdRoundTrap(px: number, py: number, r1: number, r2: number, he: number, r: number) {
  r = Math.min(r, he * 0.95, r1 * 0.95, r2 * 0.95);
  return sdTrapezoid(px, py, r1 - r, r2 - r, he - r) - r;
}
/** Rotations of a point (for tilted shapes). */
export function rotX(y: number, z: number, a: number): [number, number] {
  const c = Math.cos(a), s = Math.sin(a);
  return [c * y - s * z, s * y + c * z];
}

/** Smooth curve through (z, value) control points; `linear` gives sharp creases instead. */
export class Curve {
  constructor(private readonly pts: [number, number][], private readonly linear = false) {
    this.pts = [...pts].sort((a, b) => a[0] - b[0]);
  }
  at(z: number) {
    const p = this.pts;
    if (z <= p[0][0]) return p[0][1];
    if (z >= p[p.length - 1][0]) return p[p.length - 1][1];
    let i = 0;
    while (z > p[i + 1][0]) i++;
    const [z0, v0] = p[i];
    const [z1, v1] = p[i + 1];
    const t = (z - z0) / (z1 - z0);
    if (this.linear) return mix(v0, v1, t);
    const slope = (j: number) => {
      const a = p[Math.max(0, j - 1)], b = p[Math.min(p.length - 1, j + 1)];
      return (b[1] - a[1]) / (b[0] - a[0]);
    };
    const m0 = slope(i) * (z1 - z0), m1 = slope(i + 1) * (z1 - z0);
    const t2 = t * t, t3 = t2 * t;
    return (2 * t3 - 3 * t2 + 1) * v0 + (t3 - 2 * t2 + t) * m0 + (-2 * t3 + 3 * t2) * v1 + (t3 - t2) * m1;
  }
}

export type SDF = (x: number, y: number, z: number) => number;

/**
 * Naive surface nets: turns an SDF into a smooth triangle mesh.
 * Vertices are then pulled exactly onto the surface and given normals from the SDF gradient.
 */
export function mesh(f: SDF, min: number[], max: number[], h: number) {
  const nx = Math.ceil((max[0] - min[0]) / h), ny = Math.ceil((max[1] - min[1]) / h), nz = Math.ceil((max[2] - min[2]) / h);
  const sx = nx + 1, sy = ny + 1;
  const vals = new Float32Array(sx * sy * (nz + 1));
  for (let k = 0; k <= nz; k++)
    for (let j = 0; j <= ny; j++)
      for (let i = 0; i <= nx; i++) vals[i + sx * (j + sy * k)] = f(min[0] + i * h, min[1] + j * h, min[2] + k * h);
  const V = (i: number, j: number, k: number) => vals[i + sx * (j + sy * k)];

  const cell = new Int32Array(nx * ny * nz).fill(-1);
  const C = (i: number, j: number, k: number) => i + nx * (j + ny * k);
  const pos: number[] = [];
  const corners = [[0, 0, 0], [1, 0, 0], [0, 1, 0], [1, 1, 0], [0, 0, 1], [1, 0, 1], [0, 1, 1], [1, 1, 1]];
  const edges = [[0, 1], [2, 3], [4, 5], [6, 7], [0, 2], [1, 3], [4, 6], [5, 7], [0, 4], [1, 5], [2, 6], [3, 7]];
  const cv = new Float32Array(8);
  for (let k = 0; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        let mask = 0;
        for (let c = 0; c < 8; c++) {
          cv[c] = V(i + corners[c][0], j + corners[c][1], k + corners[c][2]);
          if (cv[c] < 0) mask |= 1 << c;
        }
        if (mask === 0 || mask === 255) continue;
        let px = 0, py = 0, pz = 0, n = 0;
        for (const [a, b] of edges) {
          if (cv[a] < 0 === cv[b] < 0) continue;
          const t = cv[a] / (cv[a] - cv[b]);
          px += corners[a][0] + (corners[b][0] - corners[a][0]) * t;
          py += corners[a][1] + (corners[b][1] - corners[a][1]) * t;
          pz += corners[a][2] + (corners[b][2] - corners[a][2]) * t;
          n++;
        }
        cell[C(i, j, k)] = pos.length / 3;
        pos.push(min[0] + (i + px / n) * h, min[1] + (j + py / n) * h, min[2] + (k + pz / n) * h);
      }

  const idx: number[] = [];
  const quad = (a: number, b: number, c: number, d: number, flip: boolean) => {
    if (a < 0 || b < 0 || c < 0 || d < 0) return;
    if (flip) idx.push(a, c, b, a, d, c);
    else idx.push(a, b, c, a, c, d);
  };
  for (let k = 1; k < nz; k++)
    for (let j = 1; j < ny; j++)
      for (let i = 0; i < nx; i++) {
        const a = V(i, j, k) < 0, b = V(i + 1, j, k) < 0;
        if (a !== b) quad(cell[C(i, j - 1, k - 1)], cell[C(i, j, k - 1)], cell[C(i, j, k)], cell[C(i, j - 1, k)], a);
      }
  for (let k = 1; k < nz; k++)
    for (let j = 0; j < ny; j++)
      for (let i = 1; i < nx; i++) {
        const a = V(i, j, k) < 0, b = V(i, j + 1, k) < 0;
        if (a !== b) quad(cell[C(i - 1, j, k - 1)], cell[C(i - 1, j, k)], cell[C(i, j, k)], cell[C(i, j, k - 1)], a);
      }
  for (let k = 0; k < nz; k++)
    for (let j = 1; j < ny; j++)
      for (let i = 1; i < nx; i++) {
        const a = V(i, j, k) < 0, b = V(i, j, k + 1) < 0;
        if (a !== b) quad(cell[C(i - 1, j - 1, k)], cell[C(i, j - 1, k)], cell[C(i, j, k)], cell[C(i - 1, j, k)], a);
      }

  // Pull vertices onto the surface; normals from the gradient.
  const nrm = new Float32Array(pos.length);
  const e = h * 0.25;
  for (let v = 0; v < pos.length; v += 3) {
    let x = pos[v], y = pos[v + 1], z = pos[v + 2];
    let gx = 0, gy = 0, gz = 0;
    for (let it = 0; it < 3; it++) {
      const d = f(x, y, z);
      gx = (f(x + e, y, z) - f(x - e, y, z)) / (2 * e);
      gy = (f(x, y + e, z) - f(x, y - e, z)) / (2 * e);
      gz = (f(x, y, z + e) - f(x, y, z - e)) / (2 * e);
      const g2 = gx * gx + gy * gy + gz * gz || 1;
      const step = clamp(d / g2, -h, h);
      x -= gx * step; y -= gy * step; z -= gz * step;
    }
    pos[v] = x; pos[v + 1] = y; pos[v + 2] = z;
    const gl = Math.hypot(gx, gy, gz) || 1;
    nrm[v] = gx / gl; nrm[v + 1] = gy / gl; nrm[v + 2] = gz / gl;
  }
  // Make every triangle face outwards.
  for (let t = 0; t < idx.length; t += 3) {
    const [a, b, c] = [idx[t] * 3, idx[t + 1] * 3, idx[t + 2] * 3];
    const ux = pos[b] - pos[a], uy = pos[b + 1] - pos[a + 1], uz = pos[b + 2] - pos[a + 2];
    const wx = pos[c] - pos[a], wy = pos[c + 1] - pos[a + 1], wz = pos[c + 2] - pos[a + 2];
    const fx = uy * wz - uz * wy, fy = uz * wx - ux * wz, fz = ux * wy - uy * wx;
    const dot = fx * (nrm[a] + nrm[b] + nrm[c]) + fy * (nrm[a + 1] + nrm[b + 1] + nrm[c + 1]) + fz * (nrm[a + 2] + nrm[b + 2] + nrm[c + 2]);
    if (dot < 0) { const tmp = idx[t + 1]; idx[t + 1] = idx[t + 2]; idx[t + 2] = tmp; }
  }
  return { pos: new Float32Array(pos), nrm, idx };
}

/** Splits a mesh into one geometry per material class, decided per triangle. */
export function splitByClass(
  m: { pos: Float32Array; nrm: Float32Array; idx: number[] },
  classify: (c: THREE.Vector3, n: THREE.Vector3) => string,
) {
  const buckets = new Map<string, { p: number[]; n: number[] }>();
  const c = new THREE.Vector3(), n = new THREE.Vector3();
  for (let t = 0; t < m.idx.length; t += 3) {
    c.set(0, 0, 0); n.set(0, 0, 0);
    for (let k = 0; k < 3; k++) {
      const v = m.idx[t + k] * 3;
      c.x += m.pos[v] / 3; c.y += m.pos[v + 1] / 3; c.z += m.pos[v + 2] / 3;
      n.x += m.nrm[v]; n.y += m.nrm[v + 1]; n.z += m.nrm[v + 2];
    }
    n.normalize();
    const cls = classify(c, n);
    let b = buckets.get(cls);
    if (!b) buckets.set(cls, (b = { p: [], n: [] }));
    for (let k = 0; k < 3; k++) {
      const v = m.idx[t + k] * 3;
      b.p.push(m.pos[v], m.pos[v + 1], m.pos[v + 2]);
      b.n.push(m.nrm[v], m.nrm[v + 1], m.nrm[v + 2]);
    }
  }
  const out = new Map<string, THREE.BufferGeometry>();
  for (const [cls, b] of buckets) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(b.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(b.n, 3));
    // Simple projected UVs (for carbon weave / textures).
    const uv: number[] = [];
    for (let i = 0; i < b.p.length; i += 3) uv.push(b.p[i + 2] * 3 + b.p[i] * 3, b.p[i + 1] * 3);
    g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
    out.set(cls, g);
  }
  return out;
}
