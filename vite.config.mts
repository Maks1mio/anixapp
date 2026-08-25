import { defineConfig } from 'vite';
import { resolve } from 'path';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { anixWebBridgePlugin } from './vite/anix-web-bridge-plugin.mjs';

export default defineConfig(({ command }) => ({
  root: __dirname,
  // Dev: absolute `/` so SPA routes (/watch, /release/…) don't 404 Vite deps.
  // Build: `./` so Electron file:// still resolves assets.
  base: command === 'serve' ? '/' : './',
  appType: 'spa',
  plugins: [svelte({ preprocess: vitePreprocess() }), anixWebBridgePlugin()],
  resolve: {
    alias: {
      // binauralfir@0.1.2 has invalid `"exports": "BinauralFIR"` — bypass for Vite 8 / rolldown.
      binauralfir: resolve(__dirname, 'node_modules/binauralfir/dist/binaural-fir.js'),
    },
  },
  optimizeDeps: {
    include: ['anixapi', 'binauralfir'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    chunkSizeWarningLimit: 3600,
    // Vite CSS minify always uses convertTargets(cssTarget) and OVERRIDES
    // css.lightningcss.targets. Default is Baseline (Safari 16.4), which
    // drops unprefixed backdrop-filter so Electron shows glass without blur.
    cssTarget: 'chrome150',
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
    // Used by the lightningcss transformer path. Minify still follows cssTarget.
    lightningcss: {
      targets: { chrome: 150 << 16 },
    },
    preprocessorOptions: {
      scss: {
        silenceDeprecations: ['legacy-js-api'],
      },
    },
  },
  server: {
    // 0.0.0.0: IPv4 на всех интерфейсах. 127.0.0.1 остаётся для wait-on/Electron,
    // LAN-IP — для телефона. Не использовать host: true на Windows: Vite тогда
    // может слушать только [::1], и electron:dev зависает с ECONNREFUSED.
    host: '0.0.0.0',
    port: 5173,
    strictPort: true,
    allowedHosts: true,
    watch: {
      ignored: ['**/release/**', '**/dist/**'],
    },
    proxy: {
      // Same-origin WS so phone/LAN can join lobby without hitting localhost:8787.
      '/anixapp/lobby/ws': {
        target: 'http://127.0.0.1:8787',
        ws: true,
        changeOrigin: true,
      },
    },
  },
}));
