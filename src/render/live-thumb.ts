import * as THREE from 'three';
import type { Level } from '../data/level';
import { buildPreviewScene, type PreviewScene } from './preview-scene';

const ROTATE_SPEED = 0.25; // rad/s, a slow turntable
const TILE_W = 240;
const TILE_H = 152;

/**
 * Every visible tile is drawn with ONE shared offscreen WebGLRenderer, then copied into that tile's own
 * plain 2D canvas - never a WebGLRenderer per tile. Browsers cap concurrent WebGL contexts fairly low
 * and share that budget across the whole page, including the main game's own renderer; a level menu
 * that creates one live context per tile risks the browser evicting the OLDEST context to make room,
 * which can be the game's own (its canvas just goes blank - a real, previously-hit bug, not a
 * hypothetical). Sharing one context for every thumbnail, no matter how many are on screen, avoids that
 * entirely: the page only ever holds two contexts total, the game's and this one.
 */
let renderer: THREE.WebGLRenderer | null = null;

function ensureRenderer(): THREE.WebGLRenderer {
  if (renderer) return renderer;
  const canvas = document.createElement('canvas');
  renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false });
  renderer.setPixelRatio(1); // the shared buffer stays small; each tile's own canvas upscales with CSS
  renderer.setSize(TILE_W, TILE_H, false);
  return renderer;
}

interface Tile {
  container: HTMLElement;
  canvas: HTMLCanvasElement;
  ctx: CanvasRenderingContext2D;
  preview: PreviewScene;
  angle: number;
}

const liveTiles = new Set<Tile>();
let raf = 0;
let last = 0;

function loop(now: number) {
  raf = requestAnimationFrame(loop);
  if (liveTiles.size === 0 || !renderer) return;
  const dt = Math.min((now - (last || now)) / 1000, 0.1);
  last = now;
  for (const tile of liveTiles) {
    const rect = tile.container.getBoundingClientRect();
    if (rect.bottom < 0 || rect.top > innerHeight || rect.right < 0 || rect.left > innerWidth) continue;
    tile.angle += ROTATE_SPEED * dt;
    const p = tile.preview;
    p.camera.position.set(p.radius * Math.cos(tile.angle), p.height, p.radius * Math.sin(tile.angle));
    p.camera.lookAt(p.lookAt);
    renderer.render(p.scene, p.camera);
    tile.ctx.drawImage(renderer.domElement, 0, 0, tile.canvas.width, tile.canvas.height);
  }
}

/**
 * Mounts a small, slowly-orbiting 3D preview of a level into `container` (its CSS size decides the
 * displayed size) - but only actually draws it while `container` is scrolled into view within its
 * nearest `.panel` ancestor.
 */
export function mountLiveThumb(container: HTMLElement, level: Level): () => void {
  const canvas = document.createElement('canvas');
  canvas.className = 'thumb';
  canvas.width = TILE_W;
  canvas.height = TILE_H;
  container.appendChild(canvas);
  const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
  const preview = buildPreviewScene(level);
  const tile: Tile = { container, canvas, ctx, preview, angle: Math.PI / 4 };

  const io = new IntersectionObserver(
    (entries) => {
      for (const e of entries) {
        if (e.isIntersecting) {
          ensureRenderer();
          liveTiles.add(tile);
          if (!raf) {
            last = 0;
            raf = requestAnimationFrame(loop);
          }
        } else {
          liveTiles.delete(tile);
        }
      }
    },
    { root: container.closest('.panel'), rootMargin: '50px' },
  );
  io.observe(container);

  return () => {
    io.disconnect();
    liveTiles.delete(tile);
    preview.dispose();
    canvas.remove();
  };
}
