import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  root: __dirname,
  base: './',
  optimizeDeps: {
    include: ['anixartjs'],
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    rollupOptions: {
      input: [
        resolve(__dirname, 'index.html'),
        resolve(__dirname, 'player.html'),
      ],
    },
  },
  css: {
    preprocessorOptions: {
      scss: {
        api: 'modern-compiler',
        silenceDeprecations: ['legacy-js-api'],
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
