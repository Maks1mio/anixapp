import { networkInterfaces } from 'node:os';

const DEV_PORT = Number(process.env.ANIXAPP_DEV_PORT || 5174);

/** LAN URL Vite TV-сервера (ПК как tv.anixapp.com). */
export function resolveTvLiveUrl() {
  const forced = (process.env.ANIXAPP_TV_LIVE_URL || '').trim();
  if (forced) return forced.replace(/\/$/, '');

  const ips = [];
  for (const addrs of Object.values(networkInterfaces())) {
    for (const addr of addrs || []) {
      const family = String(addr.family);
      if (family !== 'IPv4' && family !== '4') continue;
      if (addr.internal) continue;
      ips.push(addr.address);
    }
  }

  const pick =
    ips.find((ip) => /^192\.168\.(0|1)\./.test(ip))
    || ips.find((ip) => /^192\.168\./.test(ip) && !ip.startsWith('192.168.56.'))
    || ips.find((ip) => /^(10\.|172\.(1[6-9]|2\d|3[01])\.)/.test(ip))
    || ips[0];

  if (!pick) {
    throw new Error('Нет LAN IPv4. Задайте ANIXAPP_TV_LIVE_URL, например http://192.168.1.176:5174');
  }
  return `http://${pick}:${DEV_PORT}`;
}
