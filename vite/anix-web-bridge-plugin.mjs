import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { createRequire } from 'module';

const require = createRequire(import.meta.url);
const { proxyMediaRequest, corsHeaders } = require('../electron/lib/media-proxy.js');

const ANIXART_REFERER = 'https://anixart.tv/';
const ANIXART_ORIGIN = 'https://anixart.tv';

const ANIXBACK_PROD_ORIGIN = 'https://anix.maks1mio.su';
const ANIXBACK_LOCAL_ORIGIN = 'http://localhost:8787';

function anixbackTargetOrigins() {
  const seen = new Set();
  const out = [];
  const add = (raw) => {
    const v = (raw || '').replace(/\/$/, '');
    if (v && !seen.has(v)) {
      seen.add(v);
      out.push(v);
    }
  };
  add(process.env.VITE_ANIXBACK_ORIGIN);
  add(ANIXBACK_LOCAL_ORIGIN);
  add(process.env.ANIXBACK_PROXY_TARGET);
  add(ANIXBACK_PROD_ORIGIN);
  return out;
}

function anixbackTargetOrigin() {
  return anixbackTargetOrigins()[0] ?? ANIXBACK_PROD_ORIGIN;
}

function shouldTryNextOrigin(res, path, originIndex, total) {
  if (originIndex >= total - 1) return false;
  if (res.ok) return false;
  // Admin API must stay on the selected origin (no silent failover to prod).
  if (path.startsWith('/api/admin/')) return false;
  if (res.status >= 500) return true;
  return path.startsWith('/uploads/') && res.status === 404;
}

/** ffmpeg download / render can take minutes — never apply the short proxy timeout. */
function isLongRunningAnixbackPath(path) {
  return /\/admin\/overview\/overrides\/[^/?#]+\/(source-url|source|render|bg)\b/.test(path);
}

function readBody(req, maxBytes = 4 * 1024 * 1024) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > maxBytes) {
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
  if (res.headersSent || res.writableEnded) return;
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
  const path = url.replace(/^\/__anixback/, '') || '/';
  const origins = anixbackTargetOrigins();

  try {
    const headers = {
      Accept: req.headers.accept || '*/*',
      'User-Agent': 'AnixApp/0.1 (Web Dev)',
    };
    if (req.headers['content-type']) headers['Content-Type'] = req.headers['content-type'];
    if (req.headers['x-admin-token']) headers['X-Admin-Token'] = req.headers['x-admin-token'];
    if (req.headers.range) headers.Range = req.headers.range;

    const longRunning = isLongRunningAnixbackPath(path);
    let body;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // source/bg могут нести data_url целиком (видео/картинка в JSON).
      const maxBytes = longRunning ? 300 * 1024 * 1024 : 4 * 1024 * 1024;
      const parsed = await readBody(req, maxBytes);
      if (parsed !== null && parsed !== undefined && Object.keys(parsed).length > 0) {
        body = JSON.stringify(parsed);
      }
    }

    let upstream = null;
    let usedOrigin = origins[0];
    let lastErr = null;

    for (let i = 0; i < origins.length; i++) {
      const origin = origins[i];
      const upstreamUrl = `${origin}${path}`;
      try {
        const isUpload = path.includes('/uploads/');
        const fetchOpts = {
          method: req.method,
          headers,
          body: body ?? undefined,
        };
        if (!isUpload && !longRunning) {
          fetchOpts.signal = AbortSignal.timeout(30_000);
        } else if (longRunning) {
          // Скачивание серии / ffmpeg render — до 15 минут.
          fetchOpts.signal = AbortSignal.timeout(15 * 60_000);
        }
        const attempt = await fetch(upstreamUrl, fetchOpts);
        if (shouldTryNextOrigin(attempt, path, i, origins.length)) {
          continue;
        }
        upstream = attempt;
        usedOrigin = origin;
        break;
      } catch (err) {
        lastErr = err;
        // Admin / long-running: не уходим на следующий origin после timeout/сети.
        if (longRunning || path.startsWith('/api/admin/')) break;
      }
    }

    if (!upstream) {
      throw lastErr ?? new Error('anixback unreachable');
    }

    const outHeaders = {};
    for (const [key, value] of upstream.headers.entries()) {
      const lower = key.toLowerCase();
      if (['content-type', 'content-length', 'content-range', 'accept-ranges', 'cache-control', 'etag', 'last-modified'].includes(lower)) {
        outHeaders[key] = value;
      }
    }
    if (!outHeaders['cache-control']) {
      outHeaders['Cache-Control'] = path.includes('/uploads/') ? 'public, max-age=31536000, immutable' : 'public, max-age=300';
    }
    if (usedOrigin !== origins[0]) {
      outHeaders['X-Anixback-Proxy-Origin'] = usedOrigin;
    }

    if (!res.headersSent) {
      res.writeHead(upstream.status, outHeaders);
    }

    if (req.method === 'HEAD' || !upstream.body) {
      if (!res.writableEnded) res.end();
      return;
    }

    const readable = Readable.fromWeb(upstream.body);
    const abortStream = () => {
      try {
        readable.destroy();
      } catch {
        /* ignore */
      }
    };
    readable.on('error', abortStream);
    res.on('close', abortStream);
    req.on('aborted', abortStream);

    await pipeline(readable, res).catch(abortStream);
  } catch (err) {
    if (!res.headersSent && !res.writableEnded) {
      sendJson(res, 502, { ok: false, error: String(err?.message || err) });
    } else if (!res.writableEnded) {
      res.destroy();
    }
  }
}

function attachBridgeMiddleware(server, bridge) {
  server.middlewares.on('error', (err) => {
    console.warn('[anix-web-bridge] middleware error:', err?.message || err);
  });

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

    if (url.startsWith('/__anix/media')) {
      if (req.method === 'OPTIONS') {
        res.writeHead(204, corsHeaders());
        res.end();
        return;
      }
      const parsed = new URL(url, 'http://localhost');
      const target = parsed.searchParams.get('u');
      const ref = parsed.searchParams.get('ref');
      if (!target) {
        sendJson(res, 400, { ok: false, error: 'Missing media url' });
        return;
      }
      try {
        await proxyMediaRequest(req, res, target, ref);
      } catch (err) {
        if (!res.headersSent && !res.writableEnded) {
          sendJson(res, 502, { ok: false, error: String(err?.message || err) });
        } else if (!res.writableEnded) {
          res.destroy();
        }
      }
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
      console.log(`[anix-web-bridge] Anixback proxy /__anixback → ${anixbackTargetOrigins().join(' → ')}`);
      console.log(`[anix-web-bridge] Session config: ${getBridge().configPath}`);
    },
    configurePreviewServer(server) {
      attachBridgeMiddleware(server, getBridge());
    },
  };
}
