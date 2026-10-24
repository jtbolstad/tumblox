import type RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { BlockType } from './blocks';
import type { CharacterKind, CharacterRig, Mood, Role } from './characters';
import type { BlockStatus } from './rules';
import type { ToolId } from './tools';

export interface Entity {
  body: RAPIER.RigidBody;
  collider: RAPIER.Collider;
  prevPos: THREE.Vector3;
  currPos: THREE.Vector3;
  prevRot: THREE.Quaternion;
  currRot: THREE.Quaternion;
}

export interface BlockEntity extends Entity {
  type: BlockType;
  status: BlockStatus;
  mesh: THREE.InstancedMesh;
  instance: number; // index into the per-type InstancedMesh
  size: THREE.Vector3;
  exploding: boolean;
  hitsLeft: number; // vanish blocks: hard hits remaining
  lastHit: number; // sim time of the last counted hit, so one impact is not counted per contact
  note: number; // jingle blocks: index into JINGLE_NOTES, so a row plays a tune
  multiplier: number; // zone multiplier at its current floor position
  startPos: THREE.Vector3; // where the level placed it, to measure Jenga pulls and collapse
  grabbedOnce: boolean;
  squash: number; // 1 right after a hard ball hit, decays to 0 (visual only)
}

export interface BallEntity extends Entity {
  mesh: THREE.Mesh;
  age: number;
  tool: ToolId;
  exploding: boolean;
  /** closest approach so far to each character; -1 once it has been remarked on */
  nearest?: Map<CharacterEntity, number>;
}

export type Blaster = BlockEntity | BallEntity;

export interface CharacterEntity extends Entity {
  kind: CharacterKind;
  role: Role;
  status: 'alive' | 'fallen';
  rig: CharacterRig;
  mood: Mood;
  lastVoice: number; // performance.now() of its last line, to keep chatter down
  tiltedFor: number; // s spent lying on its side at rest; it hops back up after a moment
}

/** Anything a collider can belong to. */
export type Owner = Blaster | CharacterEntity;

/** title: the knock-down logo scene, free throws and no goal. */
export type Phase = 'title' | 'menu' | 'playing' | 'won' | 'lost';

export function makeEntityBase(body: RAPIER.RigidBody, collider: RAPIER.Collider): Entity {
  const t = body.translation();
  const r = body.rotation();
  const pos = new THREE.Vector3(t.x, t.y, t.z);
  const rot = new THREE.Quaternion(r.x, r.y, r.z, r.w);
  return { body, collider, prevPos: pos.clone(), currPos: pos, prevRot: rot.clone(), currRot: rot };
}
