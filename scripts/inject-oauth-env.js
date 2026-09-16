/**
 * Вшивает секреты main-process в пакет Electron (runtime не видит CI env / .env).
 * Источник: process.env или anixapp/.env
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { loadLocalEnv } = require('../electron/lib/load-dotenv');

loadLocalEnv();

const firebaseKey = String(process.env.FIREBASE_API_KEY || '').trim();
const proxyKey = String(
  process.env.ANIXART_PROXY_APP_KEY || process.env.ANIXAPP_PROXY_KEY || '',
).trim();

if (!firebaseKey) {
  console.error(
    'FIREBASE_API_KEY отсутствует. Добавьте его в .env или в GitHub Actions secret FIREBASE_API_KEY.',
  );
  process.exit(1);
}

if (!proxyKey) {
  console.error(
    'ANIXART_PROXY_APP_KEY отсутствует. Добавьте его в .env или в GitHub Actions secret ANIXART_PROXY_APP_KEY.',
  );
  process.exit(1);
}

const dest = path.join(__dirname, '..', 'electron', 'lib', 'oauth-env.generated.js');
const body =
  `'use strict';\n` +
  `module.exports = ${JSON.stringify(
    {
      FIREBASE_API_KEY: firebaseKey,
      ANIXART_PROXY_APP_KEY: proxyKey,
    },
    null,
    2,
  )};\n`;
fs.writeFileSync(dest, body, 'utf8');
console.log('oauth-env.generated.js записан (FIREBASE_API_KEY, ANIXART_PROXY_APP_KEY)');
