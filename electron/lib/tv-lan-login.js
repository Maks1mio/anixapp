'use strict';

const http = require('http');
const os = require('os');
const dgram = require('dgram');
const crypto = require('crypto');

const PORT_START = 38471;
const PORT_TRIES = 8;

let server = null;
let csrf = '';
let url = '';
let sender = null;

const SKIP_NAME = [
  'vbox', 'virtualbox', 'vmware', 'hyper-v', 'hyperv', 'vethernet',
  'vpn', 'radmin', 'hamachi', 'zerotier', 'tailscale', 'wireguard',
  'nordlynx', 'nordvpn', 'openvpn', 'tap-windows', 'wsl', 'docker',
  'veth', 'isatap', 'teredo', 'bluetooth', 'wi-fi direct', 'hosted network',
  'npcap', 'outline', 'mullvad', 'proton', 'cloudflare warp', 'warp',
  'softether', 'anyconnect', 'forticlient', 'globalprotect', 'ipsec',
  'tun', 'tap0', 'wg0', 'utun', 'sstp', 'l2tp', 'pptp', 'pseudo',
];

const SKIP_CIDR = [
  '127.0.0.0/8',
  '169.254.0.0/16',
  '224.0.0.0/4',
  '192.168.56.0/24',
  '192.168.57.0/24',
  '192.168.59.0/24',
  '192.168.64.0/24',
  '192.168.99.0/24',
  '192.168.137.0/24',
  '172.17.0.0/16',
  '10.0.2.0/24',
  '100.64.0.0/10',
  '25.0.0.0/8',
  '26.0.0.0/8',
  '198.18.0.0/15',
];

function ipv4ToInt(ip) {
  const p = String(ip).split('.').map((n) => Number(n));
  if (p.length !== 4 || p.some((n) => !Number.isInteger(n) || n < 0 || n > 255)) return null;
  return ((p[0] << 24) >>> 0) + (p[1] << 16) + (p[2] << 8) + p[3];
}

function inCidr(ip, cidr) {
  const [base, bitsRaw] = cidr.split('/');
  const ipi = ipv4ToInt(ip);
  const basei = ipv4ToInt(base);
  const bits = Number(bitsRaw);
  if (ipi == null || basei == null || !Number.isInteger(bits)) return false;
  const mask = bits === 0 ? 0 : (~0 << (32 - bits)) >>> 0;
  return (ipi & mask) === (basei & mask);
}

function isPrivateLan(ip) {
  return inCidr(ip, '10.0.0.0/8')
    || inCidr(ip, '172.16.0.0/12')
    || inCidr(ip, '192.168.0.0/16');
}

function isSkippedIp(ip) {
  return SKIP_CIDR.some((cidr) => inCidr(ip, cidr));
}

function isVirtualName(name) {
  const n = String(name || '').toLowerCase();
  return SKIP_NAME.some((needle) => n.includes(needle));
}

function isPhysicalName(name) {
  return /(ethernet|wi-?fi|wlan|wlan\d|eth\d|en\d|wlp|local area connection)/i.test(name || '');
}

function collectLanCandidates() {
  const ifs = os.networkInterfaces();
  const out = [];
  for (const [name, list] of Object.entries(ifs)) {
    if (!list || isVirtualName(name)) continue;
    for (const item of list) {
      const family = item.family === 4 || item.family === 'IPv4';
      if (!family || item.internal) continue;
      const host = item.address;
      if (!host || isSkippedIp(host) || !isPrivateLan(host)) continue;
      out.push({ name, host, physical: isPhysicalName(name) });
    }
  }
  return out;
}

function scoreCandidate(item, routeIp) {
  let score = 10;
  if (item.host === routeIp) score += 80;
  if (item.physical) score += 30;
  if (inCidr(item.host, '192.168.0.0/24') || inCidr(item.host, '192.168.1.0/24')) score += 25;
  else if (inCidr(item.host, '192.168.0.0/16')) score += 15;
  else if (inCidr(item.host, '10.0.0.0/8')) score += 8;
  return score;
}

function defaultRouteIPv4() {
  return new Promise((resolve) => {
    const sock = dgram.createSocket('udp4');
    let settled = false;
    const done = (ip) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { sock.close(); } catch (_) {}
      resolve(ip || null);
    };
    const timer = setTimeout(() => done(null), 250);
    sock.once('error', () => done(null));
    sock.connect(53, '1.1.1.1', () => {
      try {
        done(sock.address().address);
      } catch (_) {
        done(null);
      }
    });
  });
}

async function lanIPv4() {
  const candidates = collectLanCandidates();
  const routeIp = await defaultRouteIPv4();
  const routeOk = routeIp && candidates.some((item) => item.host === routeIp);
  if (routeOk) return routeIp;

  let best = null;
  let bestScore = -1;
  for (const item of candidates) {
    const score = scoreCandidate(item, routeIp);
    if (score > bestScore) {
      bestScore = score;
      best = item.host;
    }
  }
  return best;
}

function pageHtml(token, error) {
  const err = error
    ? `<p class="err">${error}</p>`
    : '';
  return `<!doctype html>
<html lang="ru">
<head>
  <meta charset="utf-8"/>
  <meta name="viewport" content="width=device-width,initial-scale=1"/>
  <title>Вход в AnixApp на ТВ</title>
  <style>
    :root { color-scheme: dark; }
    body { margin:0; min-height:100vh; display:flex; align-items:center; justify-content:center;
      font-family: system-ui, sans-serif; background:#0d0d0d; color:#e8e8e8; }
    form { width:min(22rem, calc(100vw - 2rem)); background:#1a1a1a; border:1px solid #2a2a2a;
      border-radius:16px; padding:1.4rem; display:grid; gap:.85rem; }
    h1 { margin:0; font-size:1.35rem; }
    p { margin:0; color:#9a9a9a; font-size:.92rem; line-height:1.4; }
    label { display:grid; gap:.35rem; font-size:.82rem; color:#bdbdbd; }
    input { height:2.7rem; border-radius:10px; border:1px solid #333; background:#121212;
      color:#fff; padding:0 .85rem; font-size:1rem; }
    button { height:2.85rem; border:0; border-radius:999px; background:#e35454; color:#fff;
      font-weight:700; font-size:1rem; }
    .ok, .err { padding:.75rem; border-radius:10px; }
    .ok { background:#16321c; color:#b6f0c2; }
    .err { background:#3a1515; color:#ffb4b4; }
  </style>
</head>
<body>
  <form method="post" action="/login" autocomplete="on">
    <h1>AnixApp на ТВ</h1>
    <p>Войдите — телевизор получит сессию сам. Телефон и ТВ должны быть в одной сети.</p>
    ${err}
    <input type="hidden" name="csrf" value="${token}"/>
    <label>Почта или никнейм<input name="login" required autocomplete="username" inputmode="email"/></label>
    <label>Пароль<input name="password" type="password" required autocomplete="current-password"/></label>
    <button type="submit">Войти на телевизор</button>
  </form>
</body>
</html>`;
}

function okHtml() {
  return `<!doctype html><html lang="ru"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>Готово</title>
  <style>body{margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0d0d0d;color:#e8e8e8;font-family:system-ui,sans-serif}
  .box{max-width:22rem;padding:1.4rem;background:#1a1a1a;border-radius:16px;text-align:center;line-height:1.45}</style></head>
  <body><div class="box"><h1>Отправлено на ТВ</h1><p>Смотрите экран телевизора — вход завершится там.</p></div></body></html>`;
}

function parseForm(body) {
  const out = {};
  String(body || '').split('&').forEach((part) => {
    const i = part.indexOf('=');
    if (i < 0) return;
    const key = decodeURIComponent(part.slice(0, i).replace(/\+/g, ' '));
    const val = decodeURIComponent(part.slice(i + 1).replace(/\+/g, ' '));
    out[key] = val;
  });
  return out;
}

function send(res, code, html) {
  res.writeHead(code, {
    'Content-Type': 'text/html; charset=utf-8',
    'Cache-Control': 'no-store',
    'Content-Length': Buffer.byteLength(html),
  });
  res.end(html);
}

function listenOn(port) {
  return new Promise((resolve, reject) => {
    const next = http.createServer((req, res) => {
      if (req.method === 'GET' && (req.url === '/' || req.url === '/login')) {
        send(res, 200, pageHtml(csrf, ''));
        return;
      }
      if (req.method === 'POST' && req.url === '/login') {
        const chunks = [];
        let size = 0;
        req.on('data', (c) => {
          size += c.length;
          if (size > 8192) {
            req.destroy();
            return;
          }
          chunks.push(c);
        });
        req.on('end', () => {
          const form = parseForm(Buffer.concat(chunks).toString('utf8'));
          if (form.csrf !== csrf) {
            send(res, 403, pageHtml(csrf, 'Сессия устарела. Обновите страницу.'));
            return;
          }
          const login = String(form.login || '').trim();
          const password = String(form.password || '');
          if (!login || !password) {
            send(res, 400, pageHtml(csrf, 'Заполните почту/никнейм и пароль.'));
            return;
          }
          sender?.({ login, password });
          send(res, 200, okHtml());
        });
        return;
      }
      res.writeHead(404);
      res.end();
    });
    next.once('error', reject);
    next.listen(port, '0.0.0.0', () => resolve(next));
  });
}

async function start(onCredentials) {
  await stop();
  csrf = crypto.randomBytes(16).toString('hex');
  sender = onCredentials;
  let lastErr = null;
  for (let i = 0; i < PORT_TRIES; i += 1) {
    const port = PORT_START + i;
    try {
      server = await listenOn(port);
      const host = await lanIPv4();
      url = host ? `http://${host}:${port}/` : `http://127.0.0.1:${port}/`;
      return { url };
    } catch (err) {
      lastErr = err;
      server = null;
    }
  }
  return { url: null, error: lastErr?.message || 'bind_failed' };
}

async function stop() {
  sender = null;
  url = '';
  csrf = '';
  const current = server;
  server = null;
  if (!current) return;
  await new Promise((resolve) => current.close(() => resolve()));
}

function getUrl() {
  return url || null;
}

module.exports = { start, stop, getUrl };
