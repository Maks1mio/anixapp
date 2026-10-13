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
  const bytes = parseIPv6(ip);
  if (!bytes) return true;
  const zero = (from, to) => bytes.slice(from, to).every((v) => v === 0);
  const embeddedV4 = (at) => `${bytes[at]}.${bytes[at + 1]}.${bytes[at + 2]}.${bytes[at + 3]}`;
  if (zero(0, 15) && (bytes[15] === 0 || bytes[15] === 1)) return true; // :: и ::1
  if (zero(0, 10) && bytes[10] === 0xff && bytes[11] === 0xff) return isPrivateAddress(embeddedV4(12)); // ::ffff:a.b.c.d (в т.ч. hex-форма ::ffff:7f00:1)
  if (zero(0, 12)) return true; // ::/96 — IPv4-compatible (устарело)
  if (bytes[0] === 0x00 && bytes[1] === 0x64 && bytes[2] === 0xff && bytes[3] === 0x9b) {
    // 64:ff9b::/96 — NAT64: проверяем вложенный IPv4; 64:ff9b:1::/48 — локального использования
    return zero(4, 12) ? isPrivateAddress(embeddedV4(12)) : true;
  }
  if (bytes[0] === 0x20 && bytes[1] === 0x02) return isPrivateAddress(embeddedV4(2)); // 6to4
  if (bytes[0] === 0x20 && bytes[1] === 0x01 && bytes[2] === 0 && bytes[3] === 0) return true; // Teredo
  if ((bytes[0] & 0xfe) === 0xfc) return true; // fc00::/7
  if (bytes[0] === 0xfe && (bytes[1] & 0xc0) === 0x80) return true; // fe80::/10
  if (bytes[0] === 0xff) return true; // multicast
  return false;
}

/** Разбор IPv6-адреса в 16 байт (поддерживает «::», хвостовой IPv4 и zone id); null — не разобрался. */
function parseIPv6(ip) {
  let x = String(ip).toLowerCase().split('%')[0];
  const tail = x.match(/(\d+\.\d+\.\d+\.\d+)$/);
  if (tail) {
    const o = tail[1].split('.').map(Number);
    if (o.some((n) => !(n >= 0 && n <= 255))) return null;
    x = x.slice(0, -tail[1].length) + ((o[0] << 8) | o[1]).toString(16) + ':' + ((o[2] << 8) | o[3]).toString(16);
  }
  const halves = x.split('::');
  if (halves.length > 2) return null;
  const head = halves[0] ? halves[0].split(':') : [];
  const rest = halves.length === 2 && halves[1] ? halves[1].split(':') : [];
  const missing = 8 - head.length - rest.length;
  if (halves.length === 1 ? head.length !== 8 : missing < 0) return null;
  const groups = halves.length === 1 ? head : [...head, ...Array(missing).fill('0'), ...rest];
  const bytes = [];
  for (const g of groups) {
    if (!/^[0-9a-f]{1,4}$/.test(g)) return null;
    const n = parseInt(g, 16);
    bytes.push(n >> 8, n & 0xff);
  }
  return bytes.length === 16 ? bytes : null;
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
