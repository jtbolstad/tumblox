import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { BLOCKS, type BlockType } from './blocks';
import { blockTexture } from './marks';

/** Shared block geometry: bevelled like a wooden toy block. */
export const boxGeo = new RoundedBoxGeometry(1, 1, 1, 2, 0.07);

/** Scales an instance to nothing: how a removed block's instance is hidden rather than resized. */
export const hiddenMatrix = new THREE.Matrix4().makeScale(0, 0, 0);

/**
 * Black ink outline for the title letters: a back-face copy of the block pushed out along its normals by a fixed
 * distance in metres, whatever the block's size (shares the block's instance matrices).
 */
function outlineMaterial(thickness: number) {
  const mat = new THREE.MeshBasicMaterial({ color: 0x000000, side: THREE.BackSide, fog: false });
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>
      vec3 blockSize = vec3(length(instanceMatrix[0].xyz), length(instanceMatrix[1].xyz), length(instanceMatrix[2].xyz));
      transformed += normalize(normal) * ${thickness.toFixed(3)} / blockSize;`,
    );
  };
  return mat;
}
export const titleOutlineMat = outlineMaterial(0.09);

const blockMats = new Map<BlockType, THREE.MeshStandardMaterial>();

/** Shared material per block type: painted face texture plus a finish that suits the material. */
export function blockMaterial(type: BlockType) {
  const hit = blockMats.get(type);
  if (hit) return hit;
  const finish: Partial<Record<BlockType, THREE.MeshStandardMaterialParameters>> = {
    steel: { metalness: 0.25, roughness: 0.45 },
    point: { metalness: 0.55, roughness: 0.3 },
    gem: { metalness: 0.1, roughness: 0.15, emissive: BLOCKS.gem.color, emissiveIntensity: 0.18 },
    ice: { roughness: 0.12, emissive: BLOCKS.ice.color, emissiveIntensity: 0.1 },
    wood: { roughness: 0.8 },
    immobile: { roughness: 0.95 },
  };
  const mat = new THREE.MeshStandardMaterial({
    color: BLOCKS[type].color,
    map: blockTexture(type),
    roughness: 0.6,
    ...finish[type],
  });
  blockMats.set(type, mat);
  return mat;
}
