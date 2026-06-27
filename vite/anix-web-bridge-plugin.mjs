import { createRequire } from 'module';

const require = createRequire(import.meta.url);

const ANIXART_REFERER = 'https://anixart.tv/';
const ANIXART_ORIGIN = 'https://anixart.tv';

function anixbackTargetOrigin() {
  return (
    process.env.VITE_ANIXBACK_ORIGIN
    || process.env.ANIXBACK_PROXY_TARGET
    || 'https://anix.maks1mio.su'
  ).replace(/\/$/, '');
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 4 * 1024 * 1024) {
        reject(new Error('Body too large'));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on('end', () => {
      try {
        const raw = Buffer.concat(chunks).toString('utf8');
        resolve(raw ? JSON.parse(raw) : {});
      } catch {
        reject(new Error('Invalid JSON'));
      }
    });
    req.on('error', reject);
  });
}

function sendJson(res, code, payload) {
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(payload));
}

async function proxyCdn(url, res) {
  try {
    const upstream = await fetch(url, {
      headers: {
        Referer: ANIXART_REFERER,
        Origin: ANIXART_ORIGIN,
        Accept: 'image/*,*/*',
        'User-Agent': 'AnixApp/0.1 (Web Dev)',
      },
    });
    const ct = upstream.headers.get('content-type') || 'application/octet-stream';
    res.writeHead(upstream.status, { 'Content-Type': ct, 'Cache-Control': 'public, max-age=3600' });
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (err) {
    sendJson(res, 502, { ok: false, error: String(err?.message || err) });
  }
}

async function proxyAnixback(req, res, url) {
  const targetOrigin = anixbackTargetOrigin();
  const path = url.replace(/^\/__anixback/, '') || '/';
  const upstreamUrl = `${targetOrigin}${path}`;

  try {
    const headers = {
      Accept: req.headers.accept || '*/*',
      'User-Agent': 'AnixApp/0.1 (Web Dev)',
    };
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
    if (req.headers['x-admin-token']) headers['X-Admin-Token'] = req.headers['x-admin-token'];
    if (req.headers.range) headers.Range = req.headers.range;

    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      const parsed = await readBody(req);
      if (parsed !== null && parsed !== undefined && Object.keys(parsed).length > 0) {
        body = JSON.stringify(parsed);
      }
    }

    const upstream = await fetch(upstreamUrl, {
      method: req.method,
      headers,
      body: body ?? undefined,
    });

    const outHeaders = {
      'Cache-Control': upstream.headers.get('cache-control') || 'public, max-age=300',
    };
    const ct = upstream.headers.get('content-type');
    if (ct) outHeaders['Content-Type'] = ct;
    const cr = upstream.headers.get('content-range');
    if (cr) outHeaders['Content-Range'] = cr;
    const ar = upstream.headers.get('accept-ranges');
    if (ar) outHeaders['Accept-Ranges'] = ar;
    const cl = upstream.headers.get('content-length');
    if (cl) outHeaders['Content-Length'] = cl;

    res.writeHead(upstream.status, outHeaders);
    const buf = Buffer.from(await upstream.arrayBuffer());
    res.end(buf);
  } catch (err) {
    sendJson(res, 502, { ok: false, error: String(err?.message || err) });
  }
}

function attachBridgeMiddleware(server, bridge) {
  server.middlewares.use(async (req, res, next) => {
    const url = req.url ?? '';

    if (url.startsWith('/__cdn/?')) {
      let target = new URL(url, 'http://localhost').searchParams.get('u');
      if (!target) {
        sendJson(res, 400, { ok: false, error: 'Bad CDN url' });
        return;
      }
      // Размотать случайную двойную обёртку
      for (let i = 0; i < 4; i += 1) {
        const embedded = target.match(/\/__cdn\/\?u=([^&]+)/);
        if (embedded) {
          try {
            target = decodeURIComponent(embedded[1]);
            continue;
          } catch {
            break;
          }
        }
        if (target.includes('/posters//__cdn/') || target.includes('/avatars//__cdn/')) {
          const m = target.match(/\/__cdn\/\?u=([^&]+)/);
          if (m) {
            try {
              target = decodeURIComponent(m[1]);
              continue;
            } catch {
              break;
            }
          }
        }
        break;
      }
      if (!/^https:\/\//i.test(target)) {
        sendJson(res, 400, { ok: false, error: 'Bad CDN url' });
        return;
      }
      await proxyCdn(target, res);
      return;
    }

    if (url.startsWith('/__anixback/') || url === '/__anixback') {
      await proxyAnixback(req, res, url);
      return;
    }

    if (!url.startsWith('/__anix/')) {
      next();
      return;
    }

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    try {
      if (url === '/__anix/health' && req.method === 'GET') {
        const cfg = bridge.loadConfig();
        sendJson(res, 200, { ok: true, hasAuth: !!cfg.token, baseUrl: cfg.baseUrl });
        return;
      }

      if (url === '/__anix/invoke' && req.method === 'POST') {
        const body = await readBody(req);
        const channel = body.channel;
        const args = Array.isArray(body.args) ? body.args : [];
        if (!channel || typeof channel !== 'string') {
          sendJson(res, 400, { ok: false, error: 'Missing channel' });
          return;
        }
        const data = await bridge.invoke(channel, args);
        sendJson(res, 200, { ok: true, data });
        return;
      }

      sendJson(res, 404, { ok: false, error: 'Not found' });
    } catch (err) {
      sendJson(res, 500, { ok: false, error: String(err?.message || err) });
    }
  });
}

/** Vite plugin: Anixart API + CDN proxy для браузерного dev-режима */
export function anixWebBridgePlugin() {
  let bridge = null;

  function getBridge() {
    if (!bridge) {
      const { createAnixBridgeCore } = require('../electron/anix-bridge-core.js');
      bridge = createAnixBridgeCore();
    }
    return bridge;
  }

  return {
    name: 'anix-web-bridge',
    configureServer(server) {
      attachBridgeMiddleware(server, getBridge());
      console.log('[anix-web-bridge] Browser API at /__anix/invoke');
      console.log(`[anix-web-bridge] Anixback proxy /__anixback → ${anixbackTargetOrigin()}`);
      console.log(`[anix-web-bridge] Session config: ${getBridge().configPath}`);
    },
    configurePreviewServer(server) {
      attachBridgeMiddleware(server, getBridge());
    },
  };
}
