import * as THREE from 'three';
import type { BlockType } from '../data/blocks';
import { seeded } from './scene';

/**
 * Painted block faces: a material layer (grain, brushed metal, facets...) under a shape marking, so
 * types are told apart by more than colour. Painted in light greys on white, so the material colour
 * still tints it. Drawn in a 128-unit space at 2x resolution.
 */
const SIZE = 256;
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
    // embossed "100": dark drop, light highlight, then the face
    g.font = 'bold 44px system-ui, sans-serif';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillStyle = 'rgba(90, 50, 0, 0.55)';
    g.fillText('100', 65.5, 67.5);
    g.fillStyle = 'rgba(255, 255, 255, 0.9)';
    g.fillText('100', 62.5, 64.5);
    g.fillStyle = 'rgba(160, 110, 0, 0.35)';
    g.fillText('100', 64, 66);
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

type Paint = (g: CanvasRenderingContext2D, rand: () => number) => void;

function speckle(g: CanvasRenderingContext2D, rand: () => number, count: number, alpha: number) {
  for (let i = 0; i < count; i++) {
    g.fillStyle = rand() < 0.5 ? `rgba(0, 0, 0, ${alpha})` : `rgba(255, 255, 255, ${alpha * 2})`;
    g.fillRect(rand() * 128, rand() * 128, 1 + rand() * 1.5, 1 + rand() * 1.5);
  }
}

/** Material layer under the marking; types not listed get painted-toy speckle. */
const BASES: Partial<Record<BlockType, Paint>> = {
  wood(g, rand) {
    for (let i = 0; i < 18; i++) {
      const y = rand() * 128;
      g.strokeStyle = `rgba(80, 40, 10, ${0.08 + rand() * 0.12})`;
      g.lineWidth = 0.6 + rand() * 1.8;
      g.beginPath();
      g.moveTo(0, y);
      g.bezierCurveTo(40, y + (rand() - 0.5) * 10, 90, y + (rand() - 0.5) * 10, 128, y + (rand() - 0.5) * 6);
      g.stroke();
    }
    g.strokeStyle = 'rgba(80, 40, 10, 0.2)';
    g.lineWidth = 1.2;
    g.beginPath();
    g.ellipse(92, 30, 7, 3.5, 0, 0, Math.PI * 2);
    g.stroke();
  },
  steel(g, rand) {
    g.fillStyle = '#e4e4e4';
    g.fillRect(0, 0, 128, 128);
    for (let i = 0; i < 220; i++) {
      g.fillStyle = rand() < 0.5 ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.25)';
      g.fillRect(0, rand() * 128, 128, 0.5);
    }
  },
  ice(g, rand) {
    for (let i = 0; i < 6; i++) {
      g.strokeStyle = `rgba(255, 255, 255, ${0.4 + rand() * 0.4})`;
      g.lineWidth = 1;
      g.beginPath();
      let x = rand() * 128;
      let y = rand() * 128;
      g.moveTo(x, y);
      for (let k = 0; k < 4; k++) {
        x += (rand() - 0.5) * 40;
        y += (rand() - 0.5) * 40;
        g.lineTo(x, y);
      }
      g.stroke();
    }
  },
  immobile(g) {
    g.fillStyle = '#d6d6d6';
    g.fillRect(0, 0, 128, 128);
    g.strokeStyle = 'rgba(0, 0, 0, 0.18)';
    g.lineWidth = 2;
    for (let row = 0; row < 4; row++) {
      const y = row * 32;
      g.strokeRect(row % 2 === 0 ? -16 : 0, y, 64, 32);
      g.strokeRect(row % 2 === 0 ? 48 : 64, y, 64, 32);
    }
  },
  gem(g) {
    // facets: a fan of triangles with alternating shades around the centre
    const shades = ['#ffffff', '#d8d8d8', '#bcbcbc', '#ececec'];
    const corners = [
      [0, 0],
      [64, 0],
      [128, 0],
      [128, 64],
      [128, 128],
      [64, 128],
      [0, 128],
      [0, 64],
    ];
    for (let i = 0; i < corners.length; i++) {
      const [ax, ay] = corners[i];
      const [bx, by] = corners[(i + 1) % corners.length];
      g.fillStyle = shades[i % shades.length];
      g.beginPath();
      g.moveTo(64, 64);
      g.lineTo(ax, ay);
      g.lineTo(bx, by);
      g.closePath();
      g.fill();
    }
  },
  point(g, rand) {
    const grad = g.createLinearGradient(0, 0, 128, 128);
    grad.addColorStop(0, '#ffffff');
    grad.addColorStop(0.5, '#e6e6e6');
    grad.addColorStop(1, '#ffffff');
    g.fillStyle = grad;
    g.fillRect(0, 0, 128, 128);
    speckle(g, rand, 60, 0.04);
  },
  chemical(g, rand) {
    speckle(g, rand, 120, 0.04);
    for (let i = 0; i < 9; i++) {
      g.strokeStyle = 'rgba(255, 255, 255, 0.55)';
      g.lineWidth = 1.2;
      g.beginPath();
      g.arc(rand() * 128, rand() * 128, 2 + rand() * 5, 0, Math.PI * 2);
      g.stroke();
    }
  },
};

/** Light edge shading, like paint pooling at the bevel of a toy block. */
function edgeShade(g: CanvasRenderingContext2D) {
  const grad = g.createRadialGradient(64, 64, 40, 64, 64, 92);
  grad.addColorStop(0, 'rgba(0, 0, 0, 0)');
  grad.addColorStop(1, 'rgba(0, 0, 0, 0.12)');
  g.fillStyle = grad;
  g.fillRect(0, 0, 128, 128);
}

const cache = new Map<string, THREE.CanvasTexture>();

/**
 * Painted face texture for a block type, or null when canvas is unavailable. `marked` false paints only
 * the material (for the pedestal and props, which must not look like gameplay blocks).
 */
export function blockTexture(type: BlockType, marked = true): THREE.CanvasTexture | null {
  const draw = marked ? DRAWERS[type] : undefined;
  const key = `${type}:${marked}`;
  const hit = cache.get(key);
  if (hit) return hit;
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = SIZE;
  const g = canvas.getContext('2d');
  if (!g) return null;
  g.scale(SIZE / 128, SIZE / 128);
  g.fillStyle = '#fff';
  g.fillRect(0, 0, 128, 128);
  const rand = seeded(type.length * 997 + type.charCodeAt(0));
  const base = BASES[type];
  if (base) base(g, rand);
  else speckle(g, rand, 160, 0.035);
  edgeShade(g);
  g.lineWidth = 5.5;
  g.lineCap = g.lineJoin = 'round';
  g.strokeStyle = INK;
  g.save();
  draw?.(g);
  g.restore();
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  cache.set(key, tex);
  return tex;
}
