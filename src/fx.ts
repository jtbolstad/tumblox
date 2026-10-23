import * as THREE from 'three';

/** Flat floor marker for a multiplier zone, labelled "x2", "x3"... */
export function makeZoneMesh(zone: { multiplier: number; pos: readonly number[]; size: readonly number[] }) {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d');
  if (g) {
    g.fillStyle = 'rgba(255, 196, 0, 0.55)';
    g.fillRect(0, 0, 128, 128);
    g.lineWidth = 8;
    g.strokeStyle = '#fb8500';
    g.strokeRect(4, 4, 120, 120);
    g.fillStyle = '#023047';
    g.font = 'bold 72px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(`×${zone.multiplier}`, 64, 68);
  }
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(zone.size[0], zone.size[1]).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(canvas), transparent: true }),
  );
  mesh.position.set(zone.pos[0], 0.02, zone.pos[2]);
  return mesh;
}

export function disposeMesh(mesh: THREE.Mesh) {
  mesh.geometry.dispose();
  const mat = mesh.material as THREE.MeshBasicMaterial;
  mat.map?.dispose();
  mat.dispose();
}

/** Pooled particle bursts (debris, sparkles) drawn as one Points object. */
export class Particles {
  private readonly max: number;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly velocity: Float32Array;
  private readonly life: Float32Array;
  private readonly gravityScale: Float32Array;
  private readonly points: THREE.Points;
  private next = 0;

  constructor(scene: THREE.Scene, max = 400) {
    this.max = max;
    this.positions = new Float32Array(max * 3).fill(-999);
    this.colors = new Float32Array(max * 3);
    this.velocity = new Float32Array(max * 3);
    this.life = new Float32Array(max);
    this.gravityScale = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    this.points = new THREE.Points(
      geo,
      new THREE.PointsMaterial({ size: 0.28, vertexColors: true, transparent: true, opacity: 0.95 }),
    );
    this.points.frustumCulled = false;
    scene.add(this.points);
  }

  /** `gravityScale` 0 makes particles drift (glints), 1 makes them fall (debris). */
  burst(at: THREE.Vector3, color: number, count: number, speed = 6, gravityScale = 1) {
    const c = new THREE.Color(color);
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.max;
      const theta = Math.random() * Math.PI * 2;
      const up = Math.random() * 0.9 + 0.1;
      const s = speed * (0.4 + Math.random() * 0.6);
      this.positions.set([at.x, at.y, at.z], i * 3);
      this.velocity.set(
        [Math.cos(theta) * s * (1 - up * 0.5), up * s, Math.sin(theta) * s * (1 - up * 0.5)],
        i * 3,
      );
      this.colors.set([c.r, c.g, c.b], i * 3);
      this.life[i] = 0.5 + Math.random() * 0.5;
      this.gravityScale[i] = gravityScale;
    }
  }

  update(dt: number, gravity: number) {
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) {
        this.positions[i * 3 + 1] = -999; // park dead particles far below the scene
        continue;
      }
      this.velocity[i * 3 + 1] -= gravity * this.gravityScale[i] * dt;
      for (let k = 0; k < 3; k++) this.positions[i * 3 + k] += this.velocity[i * 3 + k] * dt;
    }
    (this.points.geometry.getAttribute('position') as THREE.BufferAttribute).needsUpdate = true;
    (this.points.geometry.getAttribute('color') as THREE.BufferAttribute).needsUpdate = true;
  }
}

/** Decaying random camera offset; add it before render and remove it after. */
export class Shake {
  private amount = 0;
  readonly offset = new THREE.Vector3();

  kick(amount: number) {
    this.amount = Math.max(this.amount, amount);
  }

  update(dt: number) {
    this.amount = Math.max(0, this.amount - dt * 1.6);
    this.offset
      .set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5)
      .multiplyScalar(this.amount);
  }
}
