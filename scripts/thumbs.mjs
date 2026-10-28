// Pre-renders a level-select thumbnail for every bundled level, from the real game scene (lighting,
// theme, materials) rather than a mock-up - this is what phones and TVs show instead of a live 3D view.
// Usage: pnpm build && pnpm thumbs   (uses the system Chromium; set CHROME to override)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const outDir = 'public/thumbs';
const executablePath = process.env.CHROME ?? '/usr/bin/chromium';

mkdirSync(outDir, { recursive: true });
const server = await preview({ preview: { port: 4175, strictPort: true } });
const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 480, height: 304 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:4175/');
await page.waitForFunction(() => window.__blox);
await page.evaluate(() => document.body.classList.add('capture')); // hides the HUD for a clean shot
const count = await page.evaluate(() => window.__blox.levels.length);
for (let i = 0; i < count; i++) {
  const id = await page.evaluate((idx) => {
    window.__blox.loadLevel(idx);
    return window.__blox.levels[idx].id;
  }, i);
  await page.waitForTimeout(500); // let the framed camera and a few frames settle
  await page.screenshot({ path: `${outDir}/${id}.jpg`, type: 'jpeg', quality: 78 });
}
await browser.close();
server.httpServer.close();
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`saved ${count} level thumbnails to ${outDir}/`);
