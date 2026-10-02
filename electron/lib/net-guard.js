'use strict';

const dns = require('dns').promises;
const net = require('net');

/** Loopback / частные / link-local / CGNAT / multicast / зарезервированные адреса — недоступны для запросов «от имени приложения». */
function isPrivateAddress(ip) {
  const v = net.isIP(ip);
  if (!v) return true;
  if (v === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 || a === 10 || a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168) ||
      (a === 192 && b === 0) ||
      (a === 198 && (b === 18 || b === 19)) ||
      a >= 224
    );
  }
  const x = ip.toLowerCase();
  if (x === '::' || x === '::1') return true;
  if (x.startsWith('fe8') || x.startsWith('fe9') || x.startsWith('fea') || x.startsWith('feb')) return true; // fe80::/10
  if (x.startsWith('fc') || x.startsWith('fd')) return true; // fc00::/7
  if (x.startsWith('ff')) return true; // multicast
  const m = x.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/); // IPv4-mapped
  if (m) return isPrivateAddress(m[1]);
  return false;
}

/**
 * Бросает ошибку, если URL не http(s) или указывает (напрямую либо через DNS) на закрытый адрес.
 * Это защита от SSRF для запросов, которые главный процесс делает по URL из рендерера.
 */
async function assertPublicHttpUrl(rawUrl) {
  let u;
  try { u = new URL(String(rawUrl)); } catch { throw new Error('Invalid URL'); }
  if (u.protocol !== 'http:' && u.protocol !== 'https:') throw new Error('Unsupported protocol');
  const host = u.hostname.replace(/^\[|\]$/g, '');
  if (!host || host === 'localhost' || host.endsWith('.localhost')) throw new Error('Blocked host');
  if (net.isIP(host)) {
    if (isPrivateAddress(host)) throw new Error('Blocked address');
    return u.href;
  }
  const addrs = await dns.lookup(host, { all: true });
  if (!addrs.length || addrs.some((a) => isPrivateAddress(a.address))) throw new Error('Blocked address');
  return u.href;
}

module.exports = { isPrivateAddress, assertPublicHttpUrl };
