import { defineConfig } from 'vite';
import { resolve } from 'path';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { anixWebBridgePlugin } from './vite/anix-web-bridge-plugin.mjs';

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [svelte({ preprocess: vitePreprocess() }), anixWebBridgePlugin()],
  optimizeDeps: {
    include: ['anixapi'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: [
        resolve(__dirname, 'index.html'),
        resolve(__dirname, 'player.html'),
        resolve(__dirname, 'theme-editor.html'),
        resolve(__dirname, 'upscale-tool.html'),
        resolve(__dirname, 'overview-video-editor.html'),
      ],
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        silenceDeprecations: ['legacy-js-api'],
      },
    },
  },
  server: {
    // IPv4 явно: на Windows Vite иначе слушает только [::1], а wait-on/Electron
    // ходят на 127.0.0.1 → ECONNREFUSED, и electron:dev зависает без окна.
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
