/**
 * Bundle CRT ad player into anixback/public/ads-embed/player.js
 * Run from anixapp or anixback: node ../anixapp/scripts/build-ads-embed.mjs
 */
import * as esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const anixappRoot = path.resolve(__dirname, '..');
const outDir = path.resolve(anixappRoot, '../anixback/public/ads-embed');
const entry = path.join(anixappRoot, 'src/ads-embed/main.ts');

fs.mkdirSync(outDir, { recursive: true });

await esbuild.build({
  entryPoints: [entry],
  bundle: true,
  outfile: path.join(outDir, 'player.js'),
  format: 'iife',
  platform: 'browser',
  target: ['es2020'],
  minify: true,
  sourcemap: false,
  define: {
    'import.meta.env.DEV': 'false',
    'import.meta.env.PROD': 'true',
    'import.meta.env.VITE_VPN_67_URL': '""',
  },
  logLevel: 'info',
});

console.log(`[build-ads-embed] OK → ${path.join(outDir, 'player.js')}`);
