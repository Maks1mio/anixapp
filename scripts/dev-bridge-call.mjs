#!/usr/bin/env node
/**
 * Вызов dev API-моста AnixApp (только localhost, нужен Bearer-токен из настроек).
 *
 * Usage:
 *   node scripts/dev-bridge-call.mjs --token YOUR_TOKEN profile.self
 *   node scripts/dev-bridge-call.mjs --token YOUR_TOKEN profile.info 487033
 */

const DEFAULT_BASE = 'http://127.0.0.1:17320';

function parseArgs(argv) {
  let token = process.env.ANIXAPP_DEV_BRIDGE_TOKEN || '';
  let base = process.env.ANIXAPP_DEV_BRIDGE_URL || DEFAULT_BASE;
  const rest = [];

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--token') {
      token = argv[++i] || '';
    } else if (arg === '--base') {
      base = argv[++i] || DEFAULT_BASE;
    } else {
      rest.push(arg);
    }
  }

  return { token, base, path: rest[0], args: rest.slice(1).map((v) => {
    const n = Number(v);
    return Number.isFinite(n) && String(n) === v ? n : v;
  }) };
}

async function main() {
  const { token, base, path, args } = parseArgs(process.argv.slice(2));

  if (!path) {
    console.error('Usage: dev-bridge-call.mjs --token TOKEN <endpoint.path> [args...]');
    process.exit(1);
  }

  const res = await fetch(`${base.replace(/\/$/, '')}/v1/call`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ path, args }),
  });

  const json = await res.json();
  if (!res.ok || !json.ok) {
    console.error(JSON.stringify(json, null, 2));
    process.exit(1);
  }

  console.log(JSON.stringify(json.data, null, 2));
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
