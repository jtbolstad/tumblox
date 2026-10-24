import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import { type BallEntity, makeEntityBase, type Owner } from './entities';
import type { Level } from './level';
import { TOOL_IDS, TOOLS, type ToolId } from './tools';

const MAX_BALLS = 12;

/** Spawning and cleanup for thrown balls: geometry/materials, the Rapier body, and the oldest-ball cap. */
export function createBalls(deps: {
  world: RAPIER.World;
  scene: THREE.Scene;
  balls: BallEntity[];
  colliderOwner: Map<number, Owner>;
  getLevel: () => Level;
  getMassScale: () => number;
  getRadiusScale: () => number;
}) {
  const { world, scene, balls, colliderOwner, getLevel, getMassScale, getRadiusScale } = deps;

  const ballGeo = new THREE.SphereGeometry(1, 24, 16);
  const toolMats = Object.fromEntries(
    TOOL_IDS.map((id) => [id, new THREE.MeshStandardMaterial({ color: TOOLS[id].color, roughness: 0.35 })]),
  ) as Record<ToolId, THREE.MeshStandardMaterial>;

  function removeBallBody(e: BallEntity) {
    colliderOwner.delete(e.collider.handle);
    world.removeRigidBody(e.body);
    scene.remove(e.mesh);
  }

  function spawnBall(origin: THREE.Vector3, velocity: THREE.Vector3) {
    const level = getLevel();
    const tool = TOOLS[level.tool];
    const r = tool.radius * getRadiusScale();
    const body = world.createRigidBody(
      RAPIER.RigidBodyDesc.dynamic()
        .setTranslation(origin.x, origin.y, origin.z)
        .setLinvel(velocity.x, velocity.y, velocity.z)
        .setCcdEnabled(true), // fast balls must not tunnel through blocks
    );
    const collider = world.createCollider(
      RAPIER.ColliderDesc.ball(r)
        .setMass(tool.mass * getMassScale())
        .setFriction(tool.friction)
        .setRestitution(tool.restitution)
        .setActiveEvents(RAPIER.ActiveEvents.COLLISION_EVENTS),
      body,
    );
    const mesh = new THREE.Mesh(ballGeo, toolMats[level.tool]);
    mesh.scale.setScalar(r);
    mesh.castShadow = true;
    scene.add(mesh);
    const ball: BallEntity = {
      ...makeEntityBase(body, collider),
      mesh,
      age: 0,
      tool: level.tool,
      exploding: false,
    };
    balls.push(ball);
    colliderOwner.set(collider.handle, ball);
    if (balls.length > MAX_BALLS) {
      const oldest = balls.shift();
      if (oldest) removeBallBody(oldest);
    }
  }

  return { spawnBall, removeBallBody };
}
