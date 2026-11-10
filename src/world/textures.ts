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
