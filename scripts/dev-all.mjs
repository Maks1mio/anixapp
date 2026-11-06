/**
 * Дизайн-режим: ПК, телефон, планшет и ТВ одновременно, правки подхватываются во всех окнах.
 *
 *   npm run dev:all
 *   npm run dev:all -- --cdp   # ещё и порты отладки Chromium: 9391 ПК, 9392 телефон, 9393 ТВ, 9394 планшет
 *
 * Версия выбирается на этапе сборки, поэтому у каждой свой Vite; телефон и планшет — одна сборка.
 * Порты и профили отдельные: команда работает рядом с установленным AnixApp и с `npm run electron:dev`.
 * Вход копируется из профиля AnixApp при первом запуске (см. electron/lib/dev-prev-profile.js).
 */
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import concurrently from 'concurrently';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cdp = process.argv.includes('--cdp');

const servers = [
  { id: 'pc', port: 5191, env: {} },
  { id: 'mobile', port: 5192, env: { VITE_MOBILE_MODE: '1' } },
  { id: 'tv', port: 5193, env: { VITE_TV_MODE: '1' } },
];

const windows = [
  { id: 'pc', port: 5191, cdpPort: 9391, env: {} },
  { id: 'mobile', port: 5192, cdpPort: 9392, env: {} },
  { id: 'tablet', port: 5192, cdpPort: 9394, env: {} },
  { id: 'tv', port: 5193, cdpPort: 9393, env: { ANIXAPP_TV: '1' } },
];

const { commands, result } = concurrently(
  [
    ...servers.map(({ id, port, env }) => ({
      name: `vite:${id}`,
      command: 'vite',
      env: {
        ...env,
        ANIXAPP_DEV_PORT: String(port),
        ANIXAPP_VITE_CACHE_DIR: `node_modules/.vite-dev-all-${id}`,
      },
    })),
    ...windows.map(({ id, port, cdpPort, env }) => ({
      name: id,
      command: `wait-on http://127.0.0.1:${port} && electron .${cdp ? ` --remote-debugging-port=${cdpPort}` : ''}`,
      env: {
        ...env,
        NODE_ENV: 'development',
        ANIXAPP_DEV_PORT: String(port),
        ANIXAPP_DEV_PREV: '1',
        ANIXAPP_DEV_PROFILE: `anixapp-dev-all-${id}`,
        ANIXAPP_DEV_WINDOW: id,
      },
    })),
  ],
  { cwd: root, prefix: 'name' },
);

const stopAll = () => commands.forEach((c) => c.kill());
let openWindows = windows.length;
for (const c of commands) {
  c.close.subscribe(() => {
    // Окна можно закрывать по одному; Vite без окон и окно без Vite не нужны.
    if (c.name.startsWith('vite:') || --openWindows === 0) stopAll();
  });
}

await result.catch(() => {});
