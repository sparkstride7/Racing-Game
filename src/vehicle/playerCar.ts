import * as THREE from 'three';
import { createNumberDecals } from './CarModel';
import { createCarModel as createOriginalCarModel, type CarModel } from './CarModelV1';

/**
 * Which car the player drives (chosen on the car-selection screen). Only the look changes:
 * both use exactly the same physics, so they drive the same.
 * - 'v1': the Original Car from the first playable build.
 * - 'sports': the New Sports Car (the v10dd 3D model, like the five opponents).
 */
export type CarLook = 'v1' | 'sports';

/** The Original Car's paint (the same red as in the first build) and its race number. */
export const V1_PAINT = 0xe3262f;
export const V1_NUMBER = 7;

/**
 * The Original Car (V1). Its body, red metallic paint, GT wing, five-spoke wheels and yellow callipers come
 * from CarModelV1.ts, which is the first build's car file copied unchanged. The only addition is race number 7
 * on the roof and both doors (the same roundels the built-in car uses, which were made for this body shape).
 */
export function createV1Car(): CarModel {
  const model = createOriginalCarModel(V1_PAINT);
  model.body.add(createNumberDecals(V1_NUMBER));
  return model;
}

/** Frees everything a V1 car created (each V1 car has its own shapes, materials and number texture). */
export function disposeV1Car(model: CarModel) {
  const roots = [model.body, ...model.wheels.map((w) => w.pivot)];
  for (const root of roots) {
    root.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.geometry.dispose();
      const material = mesh.material as THREE.MeshStandardMaterial;
      material.map?.dispose();
      material.dispose();
    });
  }
}

const STORAGE_KEY = 'racing-game-car';

/** The car the player chose last time on this device; the Original Car (V1) for a first-time player. */
export function loadCarChoice(): CarLook {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === 'v1' || saved === 'sports') return saved;
  } catch {
    /* storage blocked: use the default */
  }
  return 'v1';
}

/** Remembers the player's car on this device (silently does nothing if the browser blocks it). */
export function saveCarChoice(look: CarLook) {
  try {
    localStorage.setItem(STORAGE_KEY, look);
  } catch {
    /* storage blocked: the choice still applies until the game is closed */
  }
}
