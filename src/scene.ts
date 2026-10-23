import * as THREE from 'three';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/** The toy-diorama backdrop: gradient sky, clouds, a floating island and the lights. */
export const SKY = { top: 0x4f9fd6, horizon: 0xd4eef8, bottom: 0xa9d3ea };
export const ISLAND_RADIUS = 24;
/** Invisible floor far below the island that catches blocks knocked into the void, so they can sleep. */
export const CATCH_FLOOR_Y = -25;

/** Small deterministic PRNG, so procedural shapes look the same on every load. */
export function seeded(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function makeSky(radius = 150): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    uniforms: {
      top: { value: new THREE.Color(SKY.top) },
      horizon: { value: new THREE.Color(SKY.horizon) },
      bottom: { value: new THREE.Color(SKY.bottom) },
    },
    vertexShader: /* glsl */ `
      varying vec3 vDir;
      void main() {
        vDir = normalize(position);
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
      }`,
    fragmentShader: /* glsl */ `
      uniform vec3 top;
      uniform vec3 horizon;
      uniform vec3 bottom;
      varying vec3 vDir;
      void main() {
        float h = normalize(vDir).y;
        vec3 c = h > 0.0
          ? mix(horizon, top, pow(smoothstep(0.0, 0.9, h), 0.7))
          : mix(horizon, bottom, smoothstep(0.0, -0.35, h));
        gl_FragColor = vec4(c, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(radius, 32, 16), mat);
  sky.renderOrder = -1;
  sky.frustumCulled = false;
  return sky;
}

/** A ring of low-poly cloud puffs around the island, merged into one draw call. */
export function makeClouds(): THREE.Mesh {
  const rand = seeded(7);
  const parts: THREE.BufferGeometry[] = [];
  for (let c = 0; c < 14; c++) {
    const angle = (c / 14) * Math.PI * 2 + rand() * 0.3;
    const dist = 70 + rand() * 40;
    const cx = Math.cos(angle) * dist;
    const cz = Math.sin(angle) * dist;
    const cy = -18 + rand() * 40;
    const puffs = 3 + Math.floor(rand() * 3);
    for (let p = 0; p < puffs; p++) {
      const r = 3 + rand() * 3;
      const g = new THREE.IcosahedronGeometry(r, 1);
      g.scale(1, 0.7, 1);
      g.translate(cx + (p - puffs / 2) * r * 1.1, cy + rand() * 1.5, cz + (rand() - 0.5) * 3);
      parts.push(g.toNonIndexed());
    }
  }
  const mesh = new THREE.Mesh(
    mergeGeometries(parts),
    new THREE.MeshLambertMaterial({
      color: 0xffffff,
      emissive: 0xe4f1ff,
      emissiveIntensity: 0.5,
      flatShading: true,
    }),
  );
  for (const g of parts) g.dispose();
  return mesh;
}

function grassTexture(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 256;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 256, 256);
  const rand = seeded(3);
  for (let i = 0; i < 260; i++) {
    const shade = rand() < 0.5 ? '0, 40, 0' : '255, 255, 200';
    g.fillStyle = `rgba(${shade}, ${0.03 + rand() * 0.04})`;
    const x = rand() * 256;
    const y = rand() * 256;
    const r = 6 + rand() * 14;
    // draw wrapped copies too, so the repeated texture has no seams
    for (const dx of [-256, 0, 256]) {
      for (const dy of [-256, 0, 256]) {
        g.beginPath();
        g.arc(x + dx, y + dy, r, 0, Math.PI * 2);
        g.fill();
      }
    }
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(10, 10);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** Grassy top (surface at y = 0) over a rocky, tapering underside. */
export function makeIsland(): THREE.Group {
  const island = new THREE.Group();
  const top = new THREE.Mesh(
    new THREE.CylinderGeometry(ISLAND_RADIUS, ISLAND_RADIUS * 0.98, 1.2, 72),
    new THREE.MeshStandardMaterial({ color: 0x7bc47f, map: grassTexture(), roughness: 1 }),
  );
  top.position.y = -0.6;
  top.receiveShadow = true;
  island.add(top);

  // underside: a cone with jitter keyed on position, so seam vertices move together and no cracks open
  const under = new THREE.CylinderGeometry(ISLAND_RADIUS * 0.98, 3, 16, 28, 5).toNonIndexed();
  under.translate(0, -1.2 - 8, 0);
  const pos = under.getAttribute('position') as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const earth = new THREE.Color(0xb08968);
  const deep = new THREE.Color(0x6d4c3d);
  const c = new THREE.Color();
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const y = pos.getY(i);
    const z = pos.getZ(i);
    const depth = Math.min(Math.max((-1.2 - y) / 16, 0), 1);
    if (depth > 0.02) {
      const r = seeded(
        (Math.round(x * 10) * 73856093) ^ (Math.round(y * 10) * 19349663) ^ (Math.round(z * 10) * 83492791),
      );
      const s = 0.88 + r() * 0.2;
      pos.setXYZ(i, x * s, y + (r() - 0.5) * 1.6, z * s);
    }
    c.copy(earth).lerp(deep, depth);
    colors.set([c.r, c.g, c.b], i * 3);
  }
  under.setAttribute('color', new THREE.BufferAttribute(colors, 3));
  under.computeVertexNormals();
  island.add(
    new THREE.Mesh(
      under,
      new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1, flatShading: true }),
    ),
  );
  return island;
}

/** Soft dark blob under the pedestal so it sits on the grass instead of floating above it. */
export function makeContactShadow(width: number, depth: number): THREE.Mesh {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = 128;
  const g = canvas.getContext('2d') as CanvasRenderingContext2D;
  const grad = g.createRadialGradient(64, 64, 20, 64, 64, 64);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0.5)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
  const mesh = new THREE.Mesh(
    new THREE.PlaneGeometry(width * 1.6, depth * 1.6).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({
      map: new THREE.CanvasTexture(canvas),
      transparent: true,
      depthWrite: false,
    }),
  );
  mesh.position.y = 0.015;
  mesh.renderOrder = 1;
  return mesh;
}

/** Image-based light from the sky colours, so metal, gems and bevels pick up soft reflections. */
export function makeEnvironment(renderer: THREE.WebGLRenderer): THREE.Texture {
  const env = new THREE.Scene();
  env.add(makeSky(50));
  const ground = new THREE.Mesh(
    new THREE.CircleGeometry(40, 32).rotateX(-Math.PI / 2),
    new THREE.MeshBasicMaterial({ color: 0xb8c49a }),
  );
  ground.position.y = -2;
  env.add(ground);
  const pmrem = new THREE.PMREMGenerator(renderer);
  const tex = pmrem.fromScene(env, 0.04).texture;
  pmrem.dispose();
  return tex;
}

export interface Lights {
  sun: THREE.DirectionalLight;
  rim: THREE.DirectionalLight;
}

/** Warm key light (the one shadow caster), cool rim from behind, sky/grass hemisphere fill. */
export function addLights(scene: THREE.Scene): Lights {
  // warm ground colour rather than grass green, so shaded block sides stay clean instead of olive
  scene.add(new THREE.HemisphereLight(0xe8f4ff, 0xd8c8a8, 0.75));
  const sun = new THREE.DirectionalLight(0xfff1d6, 2.6);
  sun.position.set(8, 16, 6);
  sun.castShadow = true;
  sun.shadow.bias = -0.0004;
  sun.shadow.normalBias = 0.02;
  sun.shadow.intensity = 0.6; // soft toy-box shadows rather than black cut-outs
  Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 12, bottom: -12, near: 1, far: 50 });
  scene.add(sun);
  const rim = new THREE.DirectionalLight(0x9ad1ff, 1.1);
  rim.position.set(-7, 9, -12);
  scene.add(rim);
  return { sun, rim };
}
