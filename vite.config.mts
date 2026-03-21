import { defineConfig } from 'vite';
import { resolve } from 'path';
import { svelte } from '@sveltejs/vite-plugin-svelte';

export default defineConfig({
  root: __dirname,
  base: './',
  plugins: [svelte()],
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
        resolve(__dirname, 'theme-editor.html'),
        resolve(__dirname, 'upscale-tool.html'),
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
