'use strict';

const fs = require('fs');
const path = require('path');

function parseEnv(contents) {
  const out = {};
  for (const raw of String(contents || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq <= 0) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"'))
      || (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[key] = val;
  }
  return out;
}

/** Подхватывает anixapp/.env в dev и вшитые секреты из oauth-env.generated.js. */
function loadLocalEnv() {
  if (loadLocalEnv.done) return;
  loadLocalEnv.done = true;
  const file = path.join(__dirname, '..', '..', '.env');
  try {
    if (fs.existsSync(file)) {
      const parsed = parseEnv(fs.readFileSync(file, 'utf8'));
      for (const [key, val] of Object.entries(parsed)) {
        if (process.env[key] == null || process.env[key] === '') {
          process.env[key] = val;
        }
      }
    }
  } catch {
    /* ignore */
  }

  try {
    const generated = require('./oauth-env.generated');
    if (generated && typeof generated === 'object') {
      for (const key of ['FIREBASE_API_KEY', 'ANIXART_PROXY_APP_KEY', 'ANIXAPP_PROXY_KEY']) {
        const val = String(generated[key] || '').trim();
        if (val && (process.env[key] == null || process.env[key] === '')) {
          process.env[key] = val;
        }
      }
    }
  } catch {
    /* нет generated в чистом dev без inject — ок */
  }
}

module.exports = { parseEnv, loadLocalEnv };
