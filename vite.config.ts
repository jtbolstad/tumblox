import basicSsl from '@vitejs/plugin-basic-ssl';
import { defineConfig, type Plugin } from 'vite';

/** Stamp the game page with the time it was built, as an HTML comment (handy to tell deploys apart),
 *  and show it for real on the launch page, in Norwegian local time. */
function buildTime(): Plugin {
  const now = new Date();
  const isoStamp = now.toISOString();
  const nbStamp = new Intl.DateTimeFormat('nb-NO', {
    timeZone: 'Europe/Oslo',
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(now);
  return {
    name: 'build-time',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html, ctx) {
        if (ctx.filename.endsWith('index.html')) {
          return html.replace(/^(<!doctype html>)/i, `$1\n<!-- built ${isoStamp} -->`);
        }
        if (ctx.filename.endsWith('about.html')) {
          return html.replace(
            '</footer>',
            `  <p class="sub">Built ${nbStamp} (Norway time)</p>\n      </footer>`,
          );
        }
        return html;
      },
    },
  };
}

/**
 * In dev the game runs on localhost, which a phone cannot reach. Tell the page the dev server's network address,
 * so the phone-remote QR code points there instead.
 */
function lanOrigin(): Plugin {
  let origin = '';
  return {
    name: 'lan-origin',
    apply: 'serve',
    configureServer(server) {
      server.httpServer?.once('listening', () => {
        origin = server.resolvedUrls?.network[0] ?? '';
      });
    },
    transformIndexHtml(html) {
      return origin
        ? html.replace(
            '</head>',
            `<script>window.__LAN_ORIGIN__ = ${JSON.stringify(origin)};</script></head>`,
          )
        : html;
    },
  };
}

// two pages: the game, and the launch page
export default defineConfig({
  base: './',
  // `pnpm dev:phone` serves over https too, because phones only give sensor access to secure pages
  plugins: [buildTime(), lanOrigin(), ...(process.env.HTTPS === '1' ? [basicSsl()] : [])],
  server: { host: true },
  build: { rollupOptions: { input: { main: 'index.html', about: 'about.html', remote: 'remote.html' } } },
});
