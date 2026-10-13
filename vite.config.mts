import { defineConfig, loadEnv } from 'vite';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { svelte, vitePreprocess } from '@sveltejs/vite-plugin-svelte';
import { anixWebBridgePlugin } from './vite/anix-web-bridge-plugin.mjs';

const rootDir = import.meta.dirname ?? fileURLToPath(new URL('.', import.meta.url));

const devPort = Number(process.env.ANIXAPP_DEV_PORT)
  || (process.env.VITE_TV_MODE === '1' || process.env.VITE_TV_MODE === 'true' ? 5174 : 5173);

export default defineConfig(({ command, mode }) => {
  const tvMode = process.env.VITE_TV_MODE === '1' || process.env.VITE_TV_MODE === 'true';
  const outDir = process.env.ANIXAPP_OUT_DIR || 'dist';
  const webBase = process.env.ANIXAPP_WEB_BASE === '/' || process.env.ANIXAPP_TV_WEB === '1';
  // Ключ резервного прокси (x-anixapp-proxy-key) попадает только в мобильный бандл; без него клиент работает по прямым хостам
  const mobileBuild = process.env.VITE_MOBILE_MODE === '1' || process.env.VITE_MOBILE_MODE === 'true';
  const proxyKey = mobileBuild
    ? (process.env.ANIXART_PROXY_APP_KEY || loadEnv(mode, rootDir, '').ANIXART_PROXY_APP_KEY || '')
    : '';

  return {
  root: rootDir,
  // Dev: absolute `/` so SPA routes (/watch, /release/…) don't 404 Vite deps.
  // Build: `./` so Electron file:// / Capacitor still resolves assets.
  base: command === 'serve' || webBase ? '/' : './',
  appType: 'spa',
  define: { __ANIXART_PROXY_KEY__: JSON.stringify(proxyKey) },
  plugins: [svelte({ preprocess: vitePreprocess() }), anixWebBridgePlugin()],
  resolve: {
    alias: {
      // binauralfir@0.1.2 has invalid `"exports": "BinauralFIR"` — bypass for Vite 8 / rolldown.
      binauralfir: resolve(rootDir, 'node_modules/binauralfir/dist/binaural-fir.js'),
      ...(tvMode
        ? { 'form-data': resolve(rootDir, 'src/native/form-data-stub.ts') }
        : {}),
    },
  },
  optimizeDeps: {
    include: ['anixapi', 'binauralfir'],
  },
  build: {
    outDir,
    emptyOutDir: true,
    chunkSizeWarningLimit: 3600,
    // LightningCSS minify: drops `px` from `calc(18px * var(--tv-ui-scale))`
    // (invalid font-size → 16px fallback, blurry rem layout) and mangles
    // `:global()` in .scss. esbuild keeps units and selectors intact.
    cssMinify: 'esbuild',
    cssTarget: 'chrome150',
    rollupOptions: {
      input: outDir === 'dist-android' || webBase
        ? [resolve(rootDir, 'index.html')]
        : [
            resolve(rootDir, 'index.html'),
            resolve(rootDir, 'player.html'),
            resolve(rootDir, 'theme-editor.html'),
            resolve(rootDir, 'upscale-tool.html'),
            resolve(rootDir, 'overview-video-editor.html'),
          ],
      output: {
        manualChunks(id) {
          if (id.includes('anime4k-webgpu')) return 'anime4k';
          if (id.includes('hls.js')) return 'hls';
          if (id.includes('lottie')) return 'lottie';
          if (id.includes('binauralfir') || id.includes('surround-audio')) return 'audio';
          if (id.includes('flag-icons')) return 'flags';
        },
      },
    },
  },
  css: {
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
    port: devPort,
    strictPort: true,
    allowedHosts: true,
    warmup: tvMode
      ? {
          clientFiles: [
            './src/main.ts',
            './src/App.svelte',
            './src/views/Home.tv.svelte',
            './src/components/tv/TvHomeRow.svelte',
            './src/layout/TvLayout.svelte',
            './src/components/uikit-v2/UiV2AnimeCard.svelte',
          ],
        }
      : undefined,
    watch: {
      ignored: ['**/release/**', '**/dist/**', '**/dist-android/**', '**/dist-tv-web/**'],
    },
    proxy: {
      '/fluo/ws': {
        target: 'http://127.0.0.1:8787',
        ws: true,
        changeOrigin: true,
      },
      // API under /fluo/* — but NOT the SPA page route GET /fluo (sidebar href).
      '/fluo': {
        target: 'http://127.0.0.1:8787',
        changeOrigin: true,
        bypass(req) {
          const path = (req.url ?? '').split('?')[0] || '';
          if (req.method === 'GET' && (path === '/fluo' || path === '/fluo/')) {
            return '/index.html';
          }
        },
      },
      // legacy lobby WS (unused after Fluo cutover)
      '/anixapp/lobby/ws': {
        target: 'http://127.0.0.1:8787',
        ws: true,
        changeOrigin: true,
      },
    },
  },
};
});
