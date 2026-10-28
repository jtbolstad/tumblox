import * as THREE from 'three';
import type { Level } from '../data/level';
import { buildPreviewScene, type PreviewScene } from './preview-scene';

const ROTATE_SPEED = 0.25; // rad/s, a slow turntable

/**
 * Browsers cap concurrent WebGL contexts fairly low (older Chrome: 16, shared across the whole page,
 * including the main game's own renderer); a level menu that fits more tiles than this on a tall or
 * wide monitor would otherwise silently evict contexts (including, randomly, the game's own). Past
 * this many live tiles, `onBudgetExceeded` is called instead, so the caller can fall back to a static
 * image for that tile.
 */
const MAX_LIVE_THUMBS = 8;
let activeCount = 0;

/**
 * Mounts a small, slowly-orbiting 3D preview of a level into `container` (its CSS size decides the
 * canvas size) - but only while `container` is actually scrolled into view within its nearest `.panel`
 * ancestor. The renderer and its WebGL context are created on entering view and torn down on leaving
 * it, so a long scrollable level list never holds more than a handful of contexts at once.
 */
export function mountLiveThumb(
  container: HTMLElement,
  level: Level,
  onBudgetExceeded: () => void,
): () => void {
  let renderer: THREE.WebGLRenderer | null = null;
  let preview: PreviewScene | null = null;
  let raf = 0;
  let angle = Math.PI / 4;
  let last = 0;

  function loop(now: number) {
    if (!renderer || !preview) return;
    raf = requestAnimationFrame(loop);
    const dt = Math.min((now - (last || now)) / 1000, 0.1);
    last = now;
    angle += ROTATE_SPEED * dt;
    preview.camera.position.set(
      preview.radius * Math.cos(angle),
      preview.height,
      preview.radius * Math.sin(angle),
    );
    preview.camera.lookAt(preview.lookAt);
    renderer.render(preview.scene, preview.camera);
  }

  function start() {
    if (renderer) return;
    if (activeCount >= MAX_LIVE_THUMBS) {
      io.disconnect();
      onBudgetExceeded();
      return;
    }
    activeCount++;
    const canvas = document.createElement('canvas');
    canvas.className = 'thumb';
    container.appendChild(canvas);
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    const rect = container.getBoundingClientRect();
    renderer.setSize(rect.width || 120, rect.height || 76, false);
    preview = buildPreviewScene(level);
    last = 0;
    raf = requestAnimationFrame(loop);
  }

  function stop() {
    cancelAnimationFrame(raf);
    preview?.dispose();
    preview = null;
    if (renderer) {
      activeCount--;
      renderer.dispose();
      renderer.domElement.remove();
      renderer = null;
    }
  }

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) (e.isIntersecting ? start : stop)();
    },
    { root: container.closest('.panel'), rootMargin: '50px' },
  );
  io.observe(container);

  return () => {
    io.disconnect();
    stop();
  };
}
