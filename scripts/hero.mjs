// Records the launch-page hero clip: the title fly-in, then one throw that sets off the bomb "M".
// Drives the game frame by frame (capture mode), so the clip is smooth even in a slow headless browser.
// Usage: pnpm build && pnpm hero   (writes public/hero.mp4 and public/hero.jpg; needs ffmpeg)
import { execFileSync } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { chromium } from 'playwright-core';
import { preview } from 'vite';

const FPS = 30;
const INTRO_FRAMES = 50; // most of the 2 s fly-in
const AFTER_THROW_FRAMES = 130;
const POSTER_FRAME = INTRO_FRAMES + 22; // mid-blast
const frames = mkdtempSync(join(tmpdir(), 'hero-'));

const server = await preview({ preview: { port: 4176, strictPort: true } });
const browser = await chromium.launch({
  executablePath: process.env.CHROME ?? '/usr/bin/chromium',
  args: ['--use-gl=angle', '--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--no-sandbox'],
});
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto('http://localhost:4176/');
await page.waitForFunction(() => window.__blox);
await page.evaluate(() => {
  window.__blox.capture(true);
  window.__blox.showTitle(); // restart the fly-in under capture control
});
let n = 0;
async function shoot() {
  await page.evaluate((ms) => window.__blox.frameStep(ms), 1000 / FPS);
  await page.screenshot({ path: join(frames, `${String(n++).padStart(4, '0')}.jpg`), quality: 92 });
}
for (let i = 0; i < INTRO_FRAMES; i++) await shoot();
await page.evaluate(() =>
  window.__blox.launch(innerWidth * 0.42, innerHeight * 0.52, Number.POSITIVE_INFINITY),
);
for (let i = 0; i < AFTER_THROW_FRAMES; i++) await shoot();
await browser.close();
server.httpServer.close();

const ffmpeg = (args) => execFileSync('ffmpeg', ['-hide_banner', '-loglevel', 'error', '-y', ...args]);
ffmpeg([
  ...['-framerate', String(FPS), '-i', join(frames, '%04d.jpg')],
  ...['-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-crf', '26', '-preset', 'slow', '-movflags', '+faststart'],
  'public/hero.mp4',
]);
ffmpeg(['-i', join(frames, `${String(POSTER_FRAME).padStart(4, '0')}.jpg`), '-q:v', '4', 'public/hero.jpg']);
rmSync(frames, { recursive: true });
console.log(`wrote public/hero.mp4 (${n} frames) and public/hero.jpg`);
