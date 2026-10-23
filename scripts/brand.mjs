// Draws the logo and app icons from the same block letters as the title scene.
// Usage: pnpm brand   (writes public/logo.svg, public/icon.svg, public/icon-192.png, public/icon-512.png)
import { writeFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { BLOCKS } from '../src/blocks.ts';
import { GAME_NAME, GLYPH_ROWS, LETTER_TYPES, layoutText } from '../src/glyphs.ts';

const INK = '#023047';
const hex = (n) => `#${n.toString(16).padStart(6, '0')}`;

/** One toy block: ink outline, darker bottom bevel, face, and a highlight in the top-left corner. */
function block(x, y, size, color, transform = '') {
  const r = size * 0.2;
  return `<g${transform ? ` transform="${transform}"` : ''}>
    <rect x="${x}" y="${y}" width="${size}" height="${size}" rx="${r}" fill="${INK}"/>
    <rect x="${x + 2}" y="${y + 2}" width="${size - 4}" height="${size - 4}" rx="${r - 1}" fill="${color}"/>
    <rect x="${x + 2}" y="${y + size * 0.72}" width="${size - 4}" height="${size * 0.28 - 2}" rx="${r - 1}" fill="#000" opacity="0.18"/>
    <rect x="${x + size * 0.18}" y="${y + size * 0.16}" width="${size * 0.3}" height="${size * 0.14}" rx="${size * 0.07}" fill="#fff" opacity="0.55"/>
  </g>`;
}

function logoSvg() {
  const { cells, width } = layoutText(GAME_NAME);
  const cell = 26;
  const pad = 16;
  const w = width * cell + pad * 2;
  const h = GLYPH_ROWS * cell + pad * 2 + 10;
  // the top-right block of the last letter tips over the edge
  const lastLetter = Math.max(...cells.map((c) => c.letter));
  const tipper = cells
    .filter((c) => c.letter === lastLetter && c.row === GLYPH_ROWS - 1)
    .sort((a, b) => b.col - a.col)[0];
  const parts = cells.map((c) => {
    const x = pad + c.col * cell;
    const y = pad + 10 + (GLYPH_ROWS - 1 - c.row) * cell;
    const color = hex(BLOCKS[LETTER_TYPES[c.letter % LETTER_TYPES.length]].color);
    if (c === tipper) return block(x, y, cell, color, `rotate(24 ${x + 2} ${y + cell})`); // pivots on its corner
    return block(x, y, cell, color);
  });
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w} ${h}" width="${w}" height="${h}">
  <title>${GAME_NAME}</title>
  ${parts.join('\n  ')}
</svg>
`;
}

function iconSvg() {
  const s = 512;
  const b = 96;
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${s} ${s}">
  <title>${GAME_NAME}</title>
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="${hex(0x4f9fd6)}"/>
      <stop offset="1" stop-color="${hex(0xd4eef8)}"/>
    </linearGradient>
  </defs>
  <rect width="${s}" height="${s}" fill="url(#sky)"/>
  <path d="M120 372 Q256 344 392 372 L330 446 Q256 470 182 446 Z" fill="${hex(0xb08968)}" stroke="${INK}" stroke-width="6"/>
  <ellipse cx="256" cy="372" rx="136" ry="26" fill="${hex(0x7bc47f)}" stroke="${INK}" stroke-width="6"/>
  ${block(160, 270, b, hex(BLOCKS.normal.color))}
  ${block(256, 270, b, hex(BLOCKS.gem.color))}
  ${block(208, 174, b, hex(BLOCKS.bomb.color), 'rotate(-22 256 270)')}
</svg>
`;
}

const logo = logoSvg();
const icon = iconSvg();
writeFileSync('public/logo.svg', logo);
writeFileSync('public/icon.svg', icon);

const browser = await chromium.launch({ executablePath: process.env.CHROME ?? '/usr/bin/chromium' });
for (const size of [192, 512]) {
  const page = await browser.newPage({ viewport: { width: size, height: size } });
  await page.setContent(
    `<body style="margin:0">${icon.replace('<svg ', `<svg width="${size}" height="${size}" `)}</body>`,
  );
  await page.screenshot({ path: `public/icon-${size}.png` });
  await page.close();
}
await browser.close();
console.log('wrote public/logo.svg, icon.svg, icon-192.png, icon-512.png');
