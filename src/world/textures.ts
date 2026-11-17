import * as THREE from 'three';
import { seededRandom } from '../utils/math';

/**
 * Textures drawn with code at start-up, so every image in the game is original
 * and nothing needs to be downloaded.
 */

function canvasTexture(size: number, draw: (ctx: CanvasRenderingContext2D, size: number) => void) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  draw(ctx, size);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = texture.wrapT = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

function speckle(ctx: CanvasRenderingContext2D, size: number, count: number, colors: string[], maxSize: number, seed: number) {
  const rand = seededRandom(seed);
  for (let i = 0; i < count; i++) {
    ctx.fillStyle = colors[Math.floor(rand() * colors.length)];
    const s = 1 + rand() * maxSize;
    ctx.fillRect(rand() * size, rand() * size, s, s);
  }
}

/** Road surface. U runs across the road, V along it. Includes white edge lines and a dashed centre line. */
export function createAsphaltTexture() {
  return canvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#3b3e43';
    ctx.fillRect(0, 0, size, size);
    speckle(ctx, size, 26000, ['#2f3236', '#45484d', '#383b40', '#505358'], 2, 7);
    // Darker racing line worn into the middle of each half.
    const grad = ctx.createLinearGradient(0, 0, size, 0);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.3, 'rgba(0,0,0,0.12)');
    grad.addColorStop(0.5, 'rgba(0,0,0,0.02)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0.12)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, size, size);
    // Edge lines and centre dashes.
    ctx.fillStyle = '#e9e9e4';
    ctx.fillRect(size * 0.025, 0, size * 0.018, size);
    ctx.fillRect(size * (1 - 0.043), 0, size * 0.018, size);
    ctx.fillRect(size * 0.4935, 0, size * 0.013, size * 0.45);
  });
}

export function createGrassTexture() {
  return canvasTexture(512, (ctx, size) => {
    ctx.fillStyle = '#3f6a2a';
    ctx.fillRect(0, 0, size, size);
    const rand = seededRandom(11);
    // Soft colour patches.
    for (let i = 0; i < 60; i++) {
      const x = rand() * size;
      const y = rand() * size;
      const r = 30 + rand() * 90;
      const g = ctx.createRadialGradient(x, y, 0, x, y, r);
      const tone = rand() > 0.5 ? '70,110,45' : '95,128,52';
      g.addColorStop(0, `rgba(${tone},0.35)`);
      g.addColorStop(1, `rgba(${tone},0)`);
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, size, size);
    }
    speckle(ctx, size, 30000, ['#365e24', '#4f7d33', '#3d6829', '#5a8740'], 2, 12);
  });
}

/** Red and white kerb stripes. */
export function createCurbTexture() {
  return canvasTexture(128, (ctx, size) => {
    ctx.fillStyle = '#d42a2a';
    ctx.fillRect(0, 0, size, size / 2);
    ctx.fillStyle = '#f2f2ee';
    ctx.fillRect(0, size / 2, size, size / 2);
  });
}

export function createCheckerTexture(columns = 8, rows = 2) {
  const texture = canvasTexture(256, (ctx, size) => {
    const cw = size / columns;
    const ch = size / rows;
    for (let x = 0; x < columns; x++) {
      for (let y = 0; y < rows; y++) {
        ctx.fillStyle = (x + y) % 2 === 0 ? '#f4f4f4' : '#161616';
        ctx.fillRect(x * cw, y * ch, cw, ch);
      }
    }
  });
  texture.magFilter = THREE.NearestFilter;
  return texture;
}

/**
 * Concrete safety barrier. U runs along the wall, V from bottom (0) to top (1).
 * Red-and-white blocks along the top, grey concrete below.
 */
export function createBarrierTexture() {
  const canvas = document.createElement('canvas');
  canvas.width = 512;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const w = canvas.width;
  const h = canvas.height;
  ctx.fillStyle = '#c9c6bf';
  ctx.fillRect(0, 0, w, h);
  speckle(ctx, w, 9000, ['#bdbab3', '#d3d0c9', '#b4b1aa'], 2, 21);
  // Panel joints every quarter.
  ctx.fillStyle = 'rgba(60,60,60,0.35)';
  for (let x = 0; x < w; x += w / 4) ctx.fillRect(x, 0, 2, h);
  // Painted band along the top: alternating red and white.
  const band = h * 0.36;
  for (let i = 0; i < 2; i++) {
    ctx.fillStyle = i === 0 ? '#d42a2a' : '#f2f2ee';
    ctx.fillRect((i * w) / 2, 0, w / 2, band);
  }
  // Dirt near the ground.
  const grime = ctx.createLinearGradient(0, h, 0, h * 0.6);
  grime.addColorStop(0, 'rgba(70,60,45,0.45)');
  grime.addColorStop(1, 'rgba(70,60,45,0)');
  ctx.fillStyle = grime;
  ctx.fillRect(0, h * 0.6, w, h * 0.4);
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  texture.anisotropy = 8;
  return texture;
}

/** Braking marker boards before a corner ("300", "200", "100"), all in one texture strip. */
export function createDistanceBoardTexture(labels: string[]) {
  const canvas = document.createElement('canvas');
  canvas.width = 256 * labels.length;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  labels.forEach((label, i) => {
    const x = i * 256;
    ctx.fillStyle = '#f4f4f0';
    ctx.fillRect(x, 0, 256, 128);
    ctx.strokeStyle = '#1b1f27';
    ctx.lineWidth = 10;
    ctx.strokeRect(x + 5, 5, 246, 118);
    ctx.fillStyle = '#1b1f27';
    ctx.font = 'bold 84px Arial, Helvetica, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText(label, x + 128, 68);
  });
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.anisotropy = 8;
  return texture;
}

/** Front of the pit building: garage doors below, windows above. Repeats along the building. */
export function createPitBuildingTexture() {
  return canvasTexture(256, (ctx, size) => {
    ctx.fillStyle = '#eceef1';
    ctx.fillRect(0, 0, size, size);
    // Upper floor windows.
    ctx.fillStyle = '#26384a';
    ctx.fillRect(0, size * 0.08, size, size * 0.3);
    ctx.fillStyle = 'rgba(255,255,255,0.25)';
    for (let x = 0; x < size; x += size / 4) ctx.fillRect(x, size * 0.08, 3, size * 0.3);
    // Red stripe.
    ctx.fillStyle = '#e3262f';
    ctx.fillRect(0, size * 0.44, size, size * 0.06);
    // Garage door.
    ctx.fillStyle = '#3a3f47';
    ctx.fillRect(size * 0.12, size * 0.56, size * 0.76, size * 0.44);
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    for (let y = size * 0.6; y < size; y += 10) ctx.fillRect(size * 0.12, y, size * 0.76, 2);
  });
}
