import * as THREE from 'three';
import type { BlockType } from './blocks';

/**
 * A shape stamped on every block face so types are told apart by more than colour.
 * The texture is white with dark strokes, so the material colour still tints it.
 */
const SIZE = 128;
const INK = 'rgba(2, 48, 71, 0.55)';

type Draw = (g: CanvasRenderingContext2D) => void;

function ring(g: CanvasRenderingContext2D, r: number, dashed = false) {
  g.setLineDash(dashed ? [10, 8] : []);
  g.beginPath();
  g.arc(64, 64, r, 0, Math.PI * 2);
  g.stroke();
  g.setLineDash([]);
}

const DRAWERS: Partial<Record<BlockType, Draw>> = {
  wood(g) {
    for (const y of [40, 64, 88]) {
      g.beginPath();
      g.moveTo(24, y);
      g.bezierCurveTo(48, y - 10, 80, y + 10, 104, y);
      g.stroke();
    }
  },
  steel(g) {
    g.fillStyle = INK;
    for (const [x, y] of [
      [26, 26],
      [102, 26],
      [26, 102],
      [102, 102],
    ]) {
      g.beginPath();
      g.arc(x, y, 7, 0, Math.PI * 2);
      g.fill();
    }
  },
  ice(g) {
    for (const o of [-24, 0, 24]) {
      g.beginPath();
      g.moveTo(34 + o, 94);
      g.lineTo(94 + o, 34);
      g.stroke();
    }
  },
  immobile(g) {
    for (let o = -96; o <= 96; o += 24) {
      g.beginPath();
      g.moveTo(32 + o, 96);
      g.lineTo(96 + o, 32);
      g.stroke();
    }
  },
  gem(g) {
    g.beginPath();
    g.moveTo(64, 24);
    g.lineTo(100, 64);
    g.lineTo(64, 104);
    g.lineTo(28, 64);
    g.closePath();
    g.stroke();
  },
  point(g) {
    g.beginPath();
    for (let i = 0; i < 10; i++) {
      const r = i % 2 === 0 ? 40 : 17;
      const a = -Math.PI / 2 + (i * Math.PI) / 5;
      g.lineTo(64 + Math.cos(a) * r, 66 + Math.sin(a) * r);
    }
    g.closePath();
    g.stroke();
  },
  penalty(g) {
    g.beginPath();
    g.moveTo(34, 34);
    g.lineTo(94, 94);
    g.moveTo(94, 34);
    g.lineTo(34, 94);
    g.stroke();
  },
  bomb(g) {
    g.fillStyle = INK;
    g.beginPath();
    g.arc(60, 72, 26, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(74, 52);
    g.quadraticCurveTo(90, 36, 98, 28);
    g.stroke();
  },
  chemical(g) {
    ring(g, 32);
    g.fillStyle = INK;
    g.beginPath();
    g.arc(64, 64, 9, 0, Math.PI * 2);
    g.fill();
  },
  vanish(g) {
    ring(g, 34, true);
  },
  multivanish(g) {
    ring(g, 40, true);
    ring(g, 22, true);
  },
  cloud(g) {
    g.beginPath();
    g.arc(46, 70, 16, Math.PI * 0.5, Math.PI * 1.5);
    g.arc(64, 54, 18, Math.PI, Math.PI * 2);
    g.arc(84, 70, 16, Math.PI * 1.5, Math.PI * 0.5);
    g.closePath();
    g.stroke();
  },
  fragile(g) {
    g.beginPath();
    g.moveTo(30, 30);
    g.lineTo(62, 56);
    g.lineTo(48, 70);
    g.lineTo(84, 98);
    g.stroke();
  },
  fireworks(g) {
    for (let i = 0; i < 8; i++) {
      const a = (i * Math.PI) / 4;
      g.beginPath();
      g.moveTo(64 + Math.cos(a) * 12, 64 + Math.sin(a) * 12);
      g.lineTo(64 + Math.cos(a) * 38, 64 + Math.sin(a) * 38);
      g.stroke();
    }
  },
  jingle(g) {
    g.fillStyle = INK;
    g.beginPath();
    g.ellipse(52, 88, 16, 11, -0.4, 0, Math.PI * 2);
    g.fill();
    g.beginPath();
    g.moveTo(66, 84);
    g.lineTo(66, 34);
    g.quadraticCurveTo(84, 40, 90, 58);
    g.stroke();
  },
};

const cache = new Map<BlockType, THREE.CanvasTexture>();

/** Marking texture for a block type, or null for plain blocks and when canvas is unavailable. */
export function markTexture(type: BlockType): THREE.CanvasTexture | null {
  const draw = DRAWERS[type];
  if (!draw) return null;
  const hit = cache.get(type);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.fillStyle = '#fff';
  g.fillRect(0, 0, SIZE, SIZE);
  g.lineWidth = 7;
  g.lineCap = g.lineJoin = 'round';
  g.strokeStyle = INK;
  draw(g);
  g.lineWidth = 4;
  g.strokeStyle = 'rgba(2, 48, 71, 0.25)'; // thin edge so stacked blocks read as separate cubes
  g.strokeRect(2, 2, SIZE - 4, SIZE - 4);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 4;
  cache.set(type, tex);
  return tex;
}
