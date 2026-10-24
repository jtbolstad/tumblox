import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { BLOCKS } from './blocks';
import type { BlockEntity, Owner } from './entities';

export const WHITE = new THREE.Color(1, 1, 1); // the neutral per-block tint (block meshes start white)

/**
 * The grab tool: pick a mobile block under a screen point and drag it on a soft spring, plus the
 * held-block glow and the aim ring that previews what a pick-up would grab. What a pick-up *costs*
 * (throws used, party turn, stats) stays in main.ts, reached through `onPickUp`; main.ts also decides
 * when a grab starts and ends, and calls `applyGrabForce` once per physics step.
 */
export function createGrab(deps: {
  camera: THREE.Camera;
  world: RAPIER.World;
  colliderOwner: Map<number, Owner>;
  params: { gravity: number; grabStiffness: number; grabDamping: number; grabMaxAccel: number };
  aim: { x: number; y: number; visible: boolean };
  step: number;
  ring: THREE.Mesh;
  arc: THREE.Object3D;
  tierColors: number[];
  canThrow: () => boolean;
  ui: { hideBanner: () => void };
  onPickUp: () => void;
}) {
  const {
    camera,
    world,
    colliderOwner,
    params,
    aim,
    step: STEP,
    ring,
    arc,
    tierColors,
    canThrow,
    ui,
    onPickUp,
  } = deps;

  // ---------- grab: pick a block and drag it on a soft spring ----------
  const grab = {
    entity: null as BlockEntity | null,
    local: new THREE.Vector3(), // grip point in the block's local space
    planeY: 0, // the pointer drags the grip along this horizontal plane, so pulling toward the camera works
  };
  const grabPoint = new THREE.Vector3();
  const grabTarget = new THREE.Vector3();
  const grabAccel = new THREE.Vector3();
  const gripRot = new THREE.Quaternion();
  const ndc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();

  /** The mobile block under a screen point, and where the ray hits it. */
  function pickBlock(px: number, py: number): { entity: BlockEntity; point: THREE.Vector3 } | null {
    ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const ray = raycaster.ray;
    const hit = world.castRay(new RAPIER.Ray(ray.origin, ray.direction), 200, true);
    const owner = hit ? colliderOwner.get(hit.collider.handle) : undefined;
    if (!hit || !owner || !('type' in owner) || !BLOCKS[owner.type].mobile) return null;
    return { entity: owner, point: ray.direction.clone().multiplyScalar(hit.timeOfImpact).add(ray.origin) };
  }

  function beginGrab(px: number, py: number): boolean {
    const pick = pickBlock(px, py);
    if (!pick) return false;
    ui.hideBanner();
    grab.planeY = pick.point.y;
    grabTarget.copy(pick.point);
    grab.local
      .copy(pick.point)
      .sub(pick.entity.currPos)
      .applyQuaternion(gripRot.copy(pick.entity.currRot).invert());
    grab.entity = pick.entity;
    pick.entity.grabbedOnce = true;
    onPickUp();
    return true;
  }

  /** Accelerate the held block toward the pointer; capped, so yanking too hard wobbles the stack. */
  function applyGrabForce() {
    const e = grab.entity;
    if (!e) return;
    if (e.status === 'removed') {
      grab.entity = null;
      return;
    }
    ndc.set((aim.x / innerWidth) * 2 - 1, -(aim.y / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const ray = raycaster.ray;
    // intersect the pointer ray with the grip plane, whether the camera is above it (ray points down) or
    // below it (ray points up); a ray that never reaches it keeps the last target
    const reach = (grab.planeY - ray.origin.y) / ray.direction.y;
    if (Number.isFinite(reach) && reach > 0) {
      grabTarget.copy(ray.direction).multiplyScalar(Math.min(reach, 80)).add(ray.origin);
    }

    const r = e.body.rotation();
    const t = e.body.translation();
    const v = e.body.linvel();
    grabPoint
      .copy(grab.local)
      .applyQuaternion(gripRot.set(r.x, r.y, r.z, r.w))
      .add(t as THREE.Vector3);
    grabAccel.copy(grabTarget).sub(grabPoint).multiplyScalar(params.grabStiffness);
    grabAccel.x -= v.x * params.grabDamping;
    grabAccel.y -= v.y * params.grabDamping;
    grabAccel.z -= v.z * params.grabDamping;
    grabAccel.clampLength(0, params.grabMaxAccel);
    grabAccel.y += params.gravity * 0.95; // carry most of the weight so the block can be lifted out
    e.body.applyImpulseAtPoint(grabAccel.multiplyScalar(e.body.mass() * STEP), grabPoint, true);
  }

  // ---------- grab highlight: the held block glows; the aim ring previews what a pick-up would grab ----------
  const grabTint = new THREE.Color();
  let tinted: BlockEntity | null = null;

  /** Forget the highlighted block (its mesh is being thrown away with the level). */
  function forgetHighlight() {
    tinted = null;
  }

  /** The block being dragged glows and pulses (a Jenga tower is full of look-alikes), so you can see which one you hold. */
  function updateGrabHighlight(now: number) {
    const held = grab.entity && grab.entity.status !== 'removed' ? grab.entity : null;
    if (tinted && tinted !== held && tinted.status !== 'removed') {
      tinted.mesh.setColorAt(tinted.instance, WHITE);
      if (tinted.mesh.instanceColor) tinted.mesh.instanceColor.needsUpdate = true;
    }
    tinted = held;
    if (!held) return;
    const k = 1.7 + 0.5 * Math.sin(now / 110); // above 1 = brighter than the block's own colour
    held.mesh.setColorAt(held.instance, grabTint.setRGB(k, k * 0.95, k * 0.6));
    if (held.mesh.instanceColor) held.mesh.instanceColor.needsUpdate = true;
  }

  function updateGrabPreview() {
    arc.visible = false;
    // highlight the block that would be picked up; hide while holding one
    const pick = aim.visible && canThrow() && !grab.entity ? pickBlock(aim.x, aim.y) : null;
    ring.visible = pick !== null;
    if (!pick) return;
    ring.position.copy(pick.point);
    ring.lookAt(camera.position);
    (ring.material as THREE.MeshBasicMaterial).color.setHex(tierColors[0]);
  }

  return { grab, beginGrab, applyGrabForce, forgetHighlight, updateGrabHighlight, updateGrabPreview };
}
