import * as THREE from 'three';
import { clone as skeletonClone } from 'three/addons/utils/SkeletonUtils.js';
import { LAYERS } from '../config';
import type { CarTemplate } from './carAssets';
import { createNumberMaterial, createNumberTexture, PAINT_FINISH, type CarStyle } from './CarModel';

/**
 * Detail levels by distance from the camera: full detail up close, lighter models further away.
 * Your own car (6-8 m from the chase camera) always shows full detail.
 */
export const LOD_DISTANCES = [0, 25, 70];
/** Extra distance before switching back, so a car right at a boundary does not flicker between levels. */
const LOD_HYSTERESIS = 0.08;

export interface GlbWheel {
  /** At the wheel centre; turns for steering (also carries the brake caliper, which must not spin). */
  pivot: THREE.Object3D;
  /** Child of the pivot; rolls with the wheel. */
  spin: THREE.Object3D;
}

/**
 * One car built from a loaded 3D model: all three detail levels in a THREE.LOD (the renderer shows the right one
 * for the camera distance), recoloured for this car, with race numbers if it has one.
 * Each level has its own wheel nodes; the car moves all of them so any level can be shown at any moment.
 */
export class GlbCarModel {
  /** Everything this car draws: the THREE.LOD (what you see) and the shadow-only copy. */
  readonly root = new THREE.Group();
  /** The three detail levels; the renderer shows one of them depending on the camera distance. */
  readonly lod = new THREE.LOD();
  /** Wheels for each level (and last, the shadow copy), in the game's order: front-left, front-right, rear-left, rear-right. */
  readonly levelWheels: GlbWheel[][] = [];
  private readonly ownMaterials: THREE.Material[] = [];
  private readonly ownTextures: THREE.Texture[] = [];

  constructor(template: CarTemplate, style: CarStyle) {
    // This car's own paint and caliper colours (everything else is shared between cars).
    const replace = new Map<THREE.Material, THREE.Material>();
    const own = (source: THREE.Material) => {
      let m = replace.get(source);
      if (!m) {
        if (source.name === 'Recolourable_Paint') {
          m = new THREE.MeshPhysicalMaterial({ name: source.name, color: style.paint, ...PAINT_FINISH[style.finish] });
        } else {
          m = source.clone();
          (m as THREE.MeshStandardMaterial).color.setHex(style.caliper);
        }
        replace.set(source, m);
        this.ownMaterials.push(m);
      }
      return m;
    };

    let numberMaterial: THREE.Material | null = null;
    if (style.number !== undefined && template.numberGeometry) {
      const texture = createNumberTexture(style.number);
      numberMaterial = createNumberMaterial(texture);
      this.ownTextures.push(texture);
      this.ownMaterials.push(numberMaterial);
    }

    const wheelsOf = (copy: THREE.Object3D) =>
      ['FL', 'FR', 'RL', 'RR'].map((c) => ({ pivot: copy.getObjectByName(`Wheel_${c}`)!, spin: copy.getObjectByName(`Wheel_${c}_Spin`)! }));

    template.levels.forEach((source, level) => {
      const copy = skeletonClone(source); // keeps the merged meshes tied to this copy's own wheel nodes
      copy.traverse((o) => {
        const mesh = o as THREE.Mesh;
        if (!mesh.isMesh) return;
        mesh.castShadow = false; // the shadow comes from the light shadow-only copy below
        mesh.receiveShadow = true;
        const name = (mesh.material as THREE.Material).name;
        if (name === 'Recolourable_Paint' || name === 'Brake_Caliper') mesh.material = own(mesh.material as THREE.Material);
      });
      // Race numbers on the two nearer levels (too small to read beyond 70 m).
      if (numberMaterial && level < 2) {
        const numbers = new THREE.Mesh(template.numberGeometry!, numberMaterial);
        numbers.name = 'Race_Numbers';
        numbers.receiveShadow = true;
        copy.add(numbers);
      }
      this.levelWheels.push(wheelsOf(copy));
      this.lod.addLevel(copy, LOD_DISTANCES[level], LOD_HYSTERESIS);
    });
    this.root.add(this.lod);

    // Shadow-only copy of the lightest level: drawn into the sun's shadow map, never on screen.
    const shadow = skeletonClone(template.levels[2]);
    shadow.name = 'Shadow_Caster';
    shadow.traverse((o) => {
      o.layers.set(LAYERS.shadowOnly);
      const mesh = o as THREE.Mesh;
      if (mesh.isMesh) {
        mesh.castShadow = true;
        mesh.receiveShadow = false;
        // The renderer only refreshes a skinned mesh's pose for objects drawn on screen, so do it here,
        // just before the shadow is drawn (positions are already up to date for this frame).
        const skinned = mesh as THREE.SkinnedMesh;
        if (skinned.isSkinnedMesh) {
          skinned.frustumCulled = false; // its resting bounds are not reliable before the first pose update
          skinned.onBeforeShadow = () => skinned.skeleton.update();
        }
      }
    });
    this.levelWheels.push(wheelsOf(shadow));
    this.root.add(shadow);
  }

  /** Index of the detail level shown in the last rendered frame (0 = full detail). */
  get currentLevel() {
    return this.lod.getCurrentLevel();
  }

  /** Frees this car's own materials and textures (the shared model data stays loaded). */
  dispose() {
    this.ownMaterials.forEach((m) => m.dispose());
    this.ownTextures.forEach((t) => t.dispose());
  }
}
