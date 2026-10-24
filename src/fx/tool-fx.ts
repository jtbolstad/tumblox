import RAPIER from '@dimforge/rapier3d-compat';
import * as THREE from 'three';
import type { Sparks } from './fx';

/**
 * The laser beam line and the hose's water jet mesh, plus the camera-ray casting they both aim with.
 * Pure visuals and raycasting: what a laser/hose hit *means* for the game (vanishing a block, nudging
 * a spectator, spending a throw) stays in main.ts, which calls `castBeam` then acts on the result.
 */
export function createToolFx(deps: {
  scene: THREE.Scene;
  camera: THREE.Camera;
  world: RAPIER.World;
  sparks: Sparks;
}) {
  const { scene, camera, world, sparks } = deps;

  const beamGeo = new THREE.BufferGeometry();
  beamGeo.setAttribute('position', new THREE.BufferAttribute(new Float32Array(6), 3));
  const beamMat = new THREE.LineBasicMaterial({ color: 0xff3864, transparent: true, depthTest: false });
  const beam = new THREE.Line(beamGeo, beamMat);
  beam.renderOrder = 11;
  beam.frustumCulled = false;
  beam.visible = false;
  scene.add(beam);

  const nozzle = new THREE.Vector3();
  const beamEnd = new THREE.Vector3();
  const beamDir = new THREE.Vector3();
  const ndc = new THREE.Vector2();
  const raycaster = new THREE.Raycaster();

  /** Where beams start: just in front of the camera, slightly below the view centre (same as a thrown ball). */
  function updateNozzle() {
    camera.getWorldDirection(beamDir);
    nozzle.copy(camera.position).addScaledVector(beamDir, 1.5);
    nozzle.y -= 0.6;
  }

  // the hose's water jet: a see-through tube from the nozzle to where it lands, with droplets and splash
  const jetGeo = new THREE.CylinderGeometry(0.16, 0.05, 1, 12, 1, true); // wide end (+y) at the target
  const jet = new THREE.Mesh(
    jetGeo,
    new THREE.MeshBasicMaterial({
      color: 0x8fdcff,
      transparent: true,
      opacity: 0.5,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  jet.renderOrder = 11;
  jet.frustumCulled = false;
  jet.visible = false;
  scene.add(jet);
  const jetCore = new THREE.Mesh(
    new THREE.CylinderGeometry(0.07, 0.025, 1, 10, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.7,
      depthTest: false,
      depthWrite: false,
      side: THREE.DoubleSide,
    }),
  );
  jetCore.renderOrder = 12;
  jet.add(jetCore);
  const jetUp = new THREE.Vector3(0, 1, 0);
  const jetColor = new THREE.Color(0x9fe0ff);
  const dropAt = new THREE.Vector3();

  /** Draw the jet from the nozzle to `beamEnd`, and throw water droplets along it. */
  function showJet(splash: boolean) {
    const length = nozzle.distanceTo(beamEnd);
    jet.position.copy(nozzle).add(beamEnd).multiplyScalar(0.5);
    jet.quaternion.setFromUnitVectors(jetUp, beamDir);
    jet.scale.set(1, Math.max(length, 0.01), 1);
    jet.visible = true;
    beam.visible = false;
    // droplets: spread along the stream, drifting with it and sagging under their own weight
    for (let i = 0; i < 5; i++) {
      dropAt.copy(nozzle).lerp(beamEnd, Math.random());
      sparks.emit(
        dropAt,
        beamDir.x * 6 + (Math.random() - 0.5) * 1.6,
        beamDir.y * 6 + (Math.random() - 0.5) * 1.6,
        beamDir.z * 6 + (Math.random() - 0.5) * 1.6,
        jetColor,
        0.35 + Math.random() * 0.3,
        0.5,
        false,
      );
    }
    if (splash) {
      for (let i = 0; i < 5; i++) {
        sparks.emit(
          beamEnd,
          (Math.random() - 0.5) * 5,
          1.5 + Math.random() * 4,
          (Math.random() - 0.5) * 5,
          jetColor,
          0.4 + Math.random() * 0.4,
          1.2,
          false,
        );
      }
    }
  }

  function showBeam(color: number, opacity: number) {
    const pos = beamGeo.getAttribute('position') as THREE.BufferAttribute;
    pos.setXYZ(0, nozzle.x, nozzle.y, nozzle.z);
    pos.setXYZ(1, beamEnd.x, beamEnd.y, beamEnd.z);
    pos.needsUpdate = true;
    beamMat.color.setHex(color);
    beamMat.opacity = opacity;
    beam.visible = true;
  }

  /** Cast the camera ray through a screen point; fills `beamEnd`/`beamDir` and returns the hit, if any. */
  function castBeam(px: number, py: number, range: number) {
    ndc.set((px / innerWidth) * 2 - 1, -(py / innerHeight) * 2 + 1);
    raycaster.setFromCamera(ndc, camera);
    const ray = raycaster.ray;
    const hit = world.castRay(new RAPIER.Ray(ray.origin, ray.direction), range, true);
    beamEnd
      .copy(ray.direction)
      .multiplyScalar(hit ? hit.timeOfImpact : range)
      .add(ray.origin);
    updateNozzle();
    beamDir.copy(beamEnd).sub(nozzle).normalize();
    return hit;
  }

  return { beam, jet, beamMat, beamEnd, beamDir, castBeam, showBeam, showJet };
}
