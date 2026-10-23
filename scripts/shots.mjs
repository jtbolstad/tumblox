// Screenshot gate for the look pass: builds nothing, serves dist/ with `vite preview`, saves PNGs.
// Usage: pnpm build && pnpm shots [outDir]   (uses the system Chromium; set CHROME to override)
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const outDir = process.argv[2] ?? 'shots';
const executablePath = process.env.CHROME ?? '/usr/bin/chromium';
// [file name, level index, physics steps after a full-power throw at the centre (0 = no throw)]
const SHOTS = [
  ['01-gem-tower', 0, 0],
  ['06-first-boom', 5, 0],
  ['06-first-boom-blast', 5, 40],
  ['15-fortress', 14, 0],
  ['17-jenga', 16, 0],
  ['21-cloud-nine', 20, 0],
  ['25-zap-tower', 24, 0],
];

mkdirSync(outDir, { recursive: true });
const server = await preview({ preview: { port: 4174, strictPort: true } });
const browser = await chromium.launch({
  executablePath,
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
page.on('console', (m) => m.type() === 'error' && errors.push(m.text()));
await page.goto('http://localhost:4174/');
await page.waitForFunction(() => window.__blox);
for (const [name, index, steps] of SHOTS) {
  await page.evaluate((i) => window.__blox.loadLevel(i), index);
  if (steps > 0) {
    await page.evaluate((n) => {
      window.__blox.launch(innerWidth / 2, innerHeight / 2, Number.POSITIVE_INFINITY);
      window.__blox.step(n);
    }, steps);
  }
  await page.waitForTimeout(400); // let a few frames render
  await page.screenshot({ path: `${outDir}/${name}.png` });
}
await browser.close();
server.httpServer.close();
if (errors.length > 0) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`saved ${SHOTS.length} screenshots to ${outDir}/`);
