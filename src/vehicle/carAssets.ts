import type * as THREE from 'three';

/** The two 3D car models. Which one a car uses is chosen by its style (`CarStyle.body`). */
export type CarBody = 'exotic' | 'gt';

/** One loaded car model: its three detail levels, ready to be copied for each car. */
export interface CarTemplate {
  /** LOD0 (full detail), LOD1, LOD2. Car space: ground y = 0, facing +Z, +X is the car's left. */
  levels: THREE.Object3D[];
  /** Roof and door patches shaped to this body, for race-number roundels (null if they could not be made). */
  numberGeometry: THREE.BufferGeometry | null;
}

/**
 * Loaded car models, filled in by `loadCarAssets()` at start-up.
 * When empty (files missing, loading failed, or the headless race simulator), cars use the built-in model.
 */
const templates = new Map<CarBody, CarTemplate>();

export function setCarTemplate(body: CarBody, template: CarTemplate) {
  templates.set(body, template);
}

export function getCarTemplate(body: CarBody): CarTemplate | undefined {
  return templates.get(body);
}

export function clearCarTemplates() {
  templates.clear();
}
