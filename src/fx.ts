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
  private readonly points: THREE.Points;
  private next = 0;

  constructor(scene: THREE.Scene, max = 400) {
    this.max = max;
    this.positions = new Float32Array(max * 3).fill(-999);
    this.colors = new Float32Array(max * 3);
    this.velocity = new Float32Array(max * 3);
    this.life = new Float32Array(max);
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

  burst(at: THREE.Vector3, color: number, count: number, speed = 6) {
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
      this.velocity[i * 3 + 1] -= gravity * dt;
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

export interface PuffOptions {
  color: number;
  /** start and end diameter in metres */
  size: [number, number];
  life: number;
  velocity?: THREE.Vector3;
  /** start opacity */
  alpha?: number;
}

/**
 * Soft round billboards (smoke, dust, flashes, trails) in one draw call. Each puff grows from its start
 * to its end size and fades out over its life. Use one pool per blending mode.
 */
export class Puffs {
  private readonly max: number;
  private readonly positions: Float32Array;
  private readonly colors: Float32Array;
  private readonly sizes: Float32Array;
  private readonly alphas: Float32Array;
  private readonly velocity: Float32Array;
  private readonly from: Float32Array; // start size, end size, start alpha per puff
  private readonly age: Float32Array;
  private readonly life: Float32Array;
  private readonly material: THREE.ShaderMaterial;
  private readonly geo = new THREE.BufferGeometry();
  private next = 0;

  constructor(scene: THREE.Scene, max: number, blending: THREE.Blending) {
    this.max = max;
    this.positions = new Float32Array(max * 3).fill(-999);
    this.colors = new Float32Array(max * 3);
    this.sizes = new Float32Array(max);
    this.alphas = new Float32Array(max);
    this.velocity = new Float32Array(max * 3);
    this.from = new Float32Array(max * 3);
    this.age = new Float32Array(max);
    this.life = new Float32Array(max);
    const geo = this.geo;
    geo.setAttribute('position', new THREE.BufferAttribute(this.positions, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.colors, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.sizes, 1));
    geo.setAttribute('alpha', new THREE.BufferAttribute(this.alphas, 1));
    this.material = new THREE.ShaderMaterial({
      uniforms: { scale: { value: 500 } },
      vertexShader: /* glsl */ `
        attribute float size;
        attribute float alpha;
        attribute vec3 color;
        uniform float scale;
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          vec4 mv = modelViewMatrix * vec4(position, 1.0);
          gl_PointSize = size * scale / max(-mv.z, 0.1);
          gl_Position = projectionMatrix * mv;
          vAlpha = alpha;
          vColor = color;
        }`,
      fragmentShader: /* glsl */ `
        varying float vAlpha;
        varying vec3 vColor;
        void main() {
          float d = length(gl_PointCoord - 0.5) * 2.0;
          float a = smoothstep(1.0, 0.35, d) * vAlpha;
          if (a < 0.01) discard;
          gl_FragColor = vec4(vColor, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
      transparent: true,
      depthWrite: false,
      blending,
    });
    const points = new THREE.Points(geo, this.material);
    points.frustumCulled = false;
    points.renderOrder = 5;
    scene.add(points);
  }

  emit(at: THREE.Vector3, opts: PuffOptions) {
    const i = this.next;
    this.next = (this.next + 1) % this.max;
    const c = new THREE.Color(opts.color);
    this.positions.set([at.x, at.y, at.z], i * 3);
    this.colors.set([c.r, c.g, c.b], i * 3);
    const v = opts.velocity;
    this.velocity.set(v ? [v.x, v.y, v.z] : [0, 0, 0], i * 3);
    this.from.set([opts.size[0], opts.size[1], opts.alpha ?? 0.8], i * 3);
    this.age[i] = 0;
    this.life[i] = opts.life;
  }

  /** `pixelsPerUnit`: drawing-buffer height / (2 tan(fov / 2)), so sizes stay in metres. */
  update(dt: number, pixelsPerUnit: number) {
    this.material.uniforms.scale.value = pixelsPerUnit;
    for (let i = 0; i < this.max; i++) {
      if (this.life[i] <= 0) continue;
      this.age[i] += dt;
      const t = this.age[i] / this.life[i];
      if (t >= 1) {
        this.life[i] = 0;
        this.alphas[i] = 0;
        this.positions[i * 3 + 1] = -999;
        continue;
      }
      const ease = 1 - (1 - t) * (1 - t);
      this.sizes[i] = this.from[i * 3] + (this.from[i * 3 + 1] - this.from[i * 3]) * ease;
      this.alphas[i] = this.from[i * 3 + 2] * (1 - t);
      for (let k = 0; k < 3; k++) {
        this.positions[i * 3 + k] += this.velocity[i * 3 + k] * dt;
        this.velocity[i * 3 + k] *= 1 - Math.min(dt * 1.5, 1); // air drag: puffs drift to a stop
      }
    }
    for (const name of ['position', 'size', 'alpha', 'color']) {
      (this.geo.getAttribute(name) as THREE.BufferAttribute).needsUpdate = true;
    }
  }
}

/** Expanding, fading rings that face the camera: the shockwave of a blast. */
export class Shockwaves {
  private readonly rings: { mesh: THREE.Mesh; age: number; life: number; radius: number }[] = [];

  constructor(scene: THREE.Scene, count = 4) {
    const geo = new THREE.RingGeometry(0.93, 1, 48);
    for (let i = 0; i < count; i++) {
      const mesh = new THREE.Mesh(
        geo,
        new THREE.MeshBasicMaterial({
          color: 0xffd9a0,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
        }),
      );
      mesh.visible = false;
      mesh.renderOrder = 6;
      scene.add(mesh);
      this.rings.push({ mesh, age: 0, life: 0, radius: 1 });
    }
  }

  spawn(at: THREE.Vector3, radius: number) {
    const ring = this.rings.reduce((a, b) => (a.life - a.age < b.life - b.age ? a : b)); // the one closest to done
    ring.mesh.position.copy(at);
    ring.age = 0;
    ring.life = 0.3;
    ring.radius = radius;
    ring.mesh.visible = true;
  }

  update(dt: number, camera: THREE.Camera) {
    for (const ring of this.rings) {
      if (!ring.mesh.visible) continue;
      ring.age += dt;
      const t = ring.age / ring.life;
      if (t >= 1) {
        ring.mesh.visible = false;
        continue;
      }
      ring.mesh.scale.setScalar(0.2 + ring.radius * (1 - (1 - t) ** 3));
      (ring.mesh.material as THREE.MeshBasicMaterial).opacity = 0.45 * (1 - t);
      ring.mesh.quaternion.copy(camera.quaternion);
    }
  }
}

/** Small tumbling cubes thrown out by blasts, pooled in one InstancedMesh. */
export class Debris {
  private readonly mesh: THREE.InstancedMesh;
  private readonly bits: {
    pos: THREE.Vector3;
    vel: THREE.Vector3;
    rot: THREE.Euler;
    spin: THREE.Vector3;
    life: number;
    size: number;
  }[] = [];
  private next = 0;
  private readonly m = new THREE.Matrix4();
  private readonly q = new THREE.Quaternion();
  private readonly s = new THREE.Vector3();
  private readonly color = new THREE.Color();

  constructor(scene: THREE.Scene, max = 64) {
    this.mesh = new THREE.InstancedMesh(
      new THREE.BoxGeometry(1, 1, 1),
      new THREE.MeshStandardMaterial({ roughness: 0.7 }),
      max,
    );
    this.mesh.frustumCulled = false;
    this.mesh.castShadow = false;
    for (let i = 0; i < max; i++) {
      this.bits.push({
        pos: new THREE.Vector3(),
        vel: new THREE.Vector3(),
        rot: new THREE.Euler(),
        spin: new THREE.Vector3(),
        life: 0,
        size: 0,
      });
      this.mesh.setMatrixAt(i, this.m.makeScale(0, 0, 0));
      this.mesh.setColorAt(i, this.color.set(0xffffff));
    }
    scene.add(this.mesh);
  }

  burst(at: THREE.Vector3, colors: readonly number[], count: number, speed: number) {
    for (let n = 0; n < count; n++) {
      const i = this.next;
      this.next = (this.next + 1) % this.bits.length;
      const b = this.bits[i];
      b.pos.copy(at);
      b.vel
        .set(Math.random() - 0.5, Math.random() * 0.8 + 0.4, Math.random() - 0.5)
        .normalize()
        .multiplyScalar(speed * (0.5 + Math.random() * 0.5));
      b.rot.set(Math.random() * 6, Math.random() * 6, Math.random() * 6);
      b.spin.set(Math.random() - 0.5, Math.random() - 0.5, Math.random() - 0.5).multiplyScalar(20);
      b.life = 0.9 + Math.random() * 0.6;
      b.size = 0.1 + Math.random() * 0.14;
      this.mesh.setColorAt(i, this.color.set(colors[n % colors.length]));
    }
    if (this.mesh.instanceColor) this.mesh.instanceColor.needsUpdate = true;
  }

  update(dt: number, gravity: number) {
    let any = false;
    for (let i = 0; i < this.bits.length; i++) {
      const b = this.bits[i];
      if (b.life <= 0) continue;
      any = true;
      b.life -= dt;
      b.vel.y -= gravity * dt;
      b.pos.addScaledVector(b.vel, dt);
      b.rot.x += b.spin.x * dt;
      b.rot.y += b.spin.y * dt;
      b.rot.z += b.spin.z * dt;
      const shrink = b.life <= 0 ? 0 : Math.min(b.life / 0.3, 1); // shrink away instead of popping out
      this.m.compose(b.pos, this.q.setFromEuler(b.rot), this.s.setScalar(b.size * shrink));
      this.mesh.setMatrixAt(i, this.m);
    }
    if (any) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
