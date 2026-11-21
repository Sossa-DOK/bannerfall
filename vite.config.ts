import { defineConfig } from 'vite';

// Relative base path: CrazyGames requires relative asset paths.
export default defineConfig({
  base: './',
  server: { host: '127.0.0.1', port: 5173, strictPort: true },
  build: { target: 'es2020', assetsInlineLimit: 0 },
});
