/**
 * Запуск Vite-сборки без yarn / npm-скриптов / cross-env:
 * вызываем локальный node_modules/vite/bin/vite.js с нужными переменными окружения.
 * Работает одинаково с npm, yarn и pnpm, без глобальных пакетов.
 */
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const viteBin = path.join(root, 'node_modules', 'vite', 'bin', 'vite.js');

/**
 * @param {Record<string, string>} envOverrides переменные сборки, напр. { VITE_TV_MODE: '1', ANIXAPP_OUT_DIR: 'dist-android' }
 */
export function runViteBuild(envOverrides = {}) {
  const result = spawnSync(process.execPath, [viteBin, 'build'], {
    cwd: root,
    env: { ...process.env, ...envOverrides },
    stdio: 'inherit',
  });
  if (result.error) {
    console.error(`vite build не запустился: ${result.error.message}`);
    process.exit(1);
  }
  if (result.status !== 0) {
    process.exit(result.status ?? 1);
  }
}
