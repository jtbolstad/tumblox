import { defineConfig } from 'vite';

// two pages: the game, and the launch page
export default defineConfig({
  build: { rollupOptions: { input: { main: 'index.html', about: 'about.html' } } },
});
