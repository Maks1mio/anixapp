'use strict';

const http = require('http');
const { FETCHAAPP_PORT, parsePlayPayload } = require('./external-play');

const HOST = '127.0.0.1';

/** @type {import('http').Server | null} */
let server = null;

/**
 * Мост слушает 127.0.0.1 и доступен любому сайту в браузере пользователя (fetch на localhost).
 * Поэтому: запрос принимаем только без Origin (curl/нативные клиенты) или от расширения браузера
 * (chrome-extension:// / moz-extension://), а Host должен быть loopback (защита от DNS rebinding).
 * Страницы http(s) получают 403 и не получают CORS-заголовков.
 */
function allowedOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return { ok: true, echo: '' };
  if (/^(?:chrome-extension|moz-extension|safari-web-extension):\/\/[a-z0-9-]+$/i.test(origin)) {
    return { ok: true, echo: origin };
  }
  return { ok: false, echo: '' };
}

function hostIsLoopback(req) {
  const host = String(req.headers.host || '').toLowerCase().replace(/:\d+$/, '');
  return host === '127.0.0.1' || host === 'localhost' || host === '[::1]';
}

function corsFor(echo) {
  return echo
    ? { 'Access-Control-Allow-Origin': echo, Vary: 'Origin', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type' }
    : {};
}

function sendJson(res, code, payload, echo = '') {
  const body = JSON.stringify(payload);
  res.writeHead(code, {
    'Content-Type': 'application/json; charset=utf-8',
    ...corsFor(echo),
    'Cache-Control': 'no-store',
  });
  res.end(body);
}

function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let size = 0;
    req.on('data', (chunk) => {
      size += chunk.length;
      if (size > 2 * 1024 * 1024) {
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

function startFetchAAppBridge(logger) {
  if (server) return Promise.resolve(FETCHAAPP_PORT);

  return new Promise((resolve, reject) => {
    const httpServer = http.createServer(async (req, res) => {
      const origin = allowedOrigin(req);
      if (!origin.ok || !hostIsLoopback(req)) {
        sendJson(res, 403, { ok: false, error: 'forbidden_origin' }, origin.echo);
        return;
      }
      if (req.method === 'OPTIONS') {
        res.writeHead(204, corsFor(origin.echo));
        res.end();
        return;
      }

      let pathname = '/';
      try { pathname = new URL(req.url || '/', 'http://127.0.0.1').pathname; } catch { /* keep */ }

      if (req.method === 'GET' && (pathname === '/health' || pathname === '/status')) {
        sendJson(res, 200, { ok: true, app: 'AnixApp', port: FETCHAAPP_PORT }, origin.echo);
        return;
      }

      if (req.method === 'POST' && pathname === '/play') {
        try {
          const body = await readJsonBody(req);
          const parsed = parsePlayPayload(body);
          if (!parsed) {
            sendJson(res, 400, { ok: false, error: 'invalid_url' }, origin.echo);
            return;
          }
          const { player } = require('../windows/player');
          if (!player.openExternalPlayback) {
            sendJson(res, 503, { ok: false, error: 'player_unavailable' }, origin.echo);
            return;
          }
          const opened = player.openExternalPlayback(parsed);
          sendJson(res, opened ? 200 : 500, { ok: !!opened });
        } catch (err) {
          logger?.warn?.('fetchaapp', `play failed: ${err?.message || err}`);
          sendJson(res, 400, { ok: false, error: 'bad_request' }, origin.echo);
        }
        return;
      }

      sendJson(res, 404, { ok: false, error: 'not_found' }, origin.echo);
    });

    httpServer.on('error', (err) => {
      if (err && err.code === 'EADDRINUSE') {
        logger?.warn?.('fetchaapp', `port ${FETCHAAPP_PORT} busy — расширение откроет AnixApp через протокол`);
        resolve(null);
        return;
      }
      reject(err);
    });

    httpServer.listen(FETCHAAPP_PORT, HOST, () => {
      server = httpServer;
      logger?.info?.('fetchaapp', `listening on http://${HOST}:${FETCHAAPP_PORT}`);
      resolve(FETCHAAPP_PORT);
    });
  });
}

function stopFetchAAppBridge() {
  if (!server) return;
  try { server.close(); } catch { /* ignore */ }
  server = null;
}

module.exports = {
  FETCHAAPP_PORT,
  startFetchAAppBridge,
  stopFetchAAppBridge,
};
