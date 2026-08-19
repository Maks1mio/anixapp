/**
 * Вшивает FIREBASE_API_KEY в пакет Electron (main process не видит Vite env).
 * Источник: process.env или anixapp/.env
 */
'use strict';

const fs = require('fs');
const path = require('path');
const { loadLocalEnv } = require('../electron/lib/load-dotenv');

loadLocalEnv();

const key = String(process.env.FIREBASE_API_KEY || '').trim();
if (!key) {
  console.error(
    'FIREBASE_API_KEY отсутствует. Добавьте его в .env или в GitHub Actions secret FIREBASE_API_KEY.',
  );
  process.exit(1);
}

const dest = path.join(__dirname, '..', 'electron', 'lib', 'oauth-env.generated.js');
const body =
  `'use strict';\n` +
  `module.exports = ${JSON.stringify({ FIREBASE_API_KEY: key }, null, 2)};\n`;
fs.writeFileSync(dest, body, 'utf8');
console.log('oauth-env.generated.js записан');
