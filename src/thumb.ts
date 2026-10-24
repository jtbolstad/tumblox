import { BLOCKS } from './blocks';
import type { Level } from './level';
import { THEMES } from './themes';

const css = (color: number) => `#${color.toString(16).padStart(6, '0')}`;

/** Thumbnail size in CSS pixels; the canvas is drawn at twice that, so it stays sharp. */
const W = 120;
const H = 76;
const SCALE = 2;

const ROLE_COLOR = { friend: '#57cc99', rival: '#e63946', decor: '#c9c3b8' } as const;

/**
 * A small front view of a level, drawn from its JSON (no rendering of the 3D scene): the world's sky and
 * ground, the platform, the blocks as coloured boxes (nearest in front), zones and characters.
 */
export function levelThumb(level: Level): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = W * SCALE;
  canvas.height = H * SCALE;
  canvas.className = 'thumb';
  const g = canvas.getContext('2d');
  if (!g) return canvas;
  g.scale(SCALE, SCALE);
  const theme = THEMES[level.theme];
  const sky = g.createLinearGradient(0, 0, 0, H);
  sky.addColorStop(0, css(theme.sky.top));
  sky.addColorStop(1, css(theme.sky.horizon));
  g.fillStyle = sky;
  g.fillRect(0, 0, W, H);

  // fit the whole structure (and the platform's width) into the frame
  let top = 0;
  let halfWidth = level.platform.size[0] / 2;
  for (const b of level.blocks) {
    top = Math.max(top, b.pos[1] + b.size[1] / 2);
    halfWidth = Math.max(halfWidth, Math.abs(b.pos[0]) + b.size[0] / 2);
  }
  const unit = Math.min((W * 0.9) / (halfWidth * 2), (H * 0.72) / Math.max(top + 0.5, 3));
  const baseY = H * 0.86; // y of the platform's top edge
  const px = (x: number) => W / 2 + x * unit;
  const py = (y: number) => baseY - y * unit;

  // ground and platform
  g.fillStyle = css(theme.ground);
  g.fillRect(0, baseY, W, H - baseY);
  const pw = level.platform.size[0] * unit;
  g.fillStyle = css(theme.pedestal);
  g.fillRect(W / 2 - pw / 2, baseY, pw, Math.max(4, H - baseY - 2));
  g.fillStyle = 'rgba(255,255,255,0.35)';
  g.fillRect(W / 2 - pw / 2, baseY, pw, 1.2);

  for (const zone of level.zones) {
    g.fillStyle = 'rgba(255, 196, 0, 0.7)';
    const zw = zone.size[0] * unit;
    g.fillRect(px(zone.pos[0]) - zw / 2, baseY - 1.2, zw, 2.4);
  }

  // back to front, so nearer blocks cover the ones behind them
  const blocks = [...level.blocks].sort((a, b) => a.pos[2] - b.pos[2]);
  for (const b of blocks) {
    const w = b.size[0] * unit;
    const h = b.size[1] * unit;
    const x = px(b.pos[0]) - w / 2;
    const y = py(b.pos[1] + b.size[1] / 2);
    g.fillStyle = css(BLOCKS[b.type].color);
    g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(0, 0, 0, 0.55)';
    g.lineWidth = 0.6;
    g.strokeRect(x + 0.3, y + 0.3, Math.max(w - 0.6, 0), Math.max(h - 0.6, 0));
  }

  for (const c of level.characters) {
    const s = 0.8 * unit * c.scale;
    g.fillStyle = ROLE_COLOR[c.role];
    g.fillRect(px(c.pos[0]) - s / 2, py(c.pos[1]) - s * 1.1, s, s * 1.1);
    g.fillStyle = '#1d2433';
    g.fillRect(px(c.pos[0]) - s * 0.3, py(c.pos[1]) - s * 0.8, s * 0.15, s * 0.2);
    g.fillRect(px(c.pos[0]) + s * 0.15, py(c.pos[1]) - s * 0.8, s * 0.15, s * 0.2);
  }
  return canvas;
}
