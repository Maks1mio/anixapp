const http = require('http');
const crypto = require('crypto');

const DEFAULT_PORT = 17320;
const HOST = '127.0.0.1';

const COMMON_METHODS = [
  'profile.info',
  'profile.self',
  'profile.getFriends',
  'profile.getBookmarks',
  'profile.getVotedReleases',
  'release.info',
  'release.filter',
  'collection.info',
  'collection.all',
  'collection.profileCollections',
  'search.releases',
  'search.profiles',
  'search.collections',
  'discover.recommendations',
  'discover.interesting',
  'notification.all',
  'history.all',
];

function generateToken() {
  return crypto.randomBytes(24).toString('hex');
}

function resolveEndpointFn(client, dotPath) {
  const parts = String(dotPath || '').split('.').filter(Boolean);
  if (!parts.length) return null;

  let parent = client.endpoints;
  for (let i = 0; i < parts.length - 1; i += 1) {
    parent = parent?.[parts[i]];
    if (!parent) return null;
  }

  const key = parts[parts.length - 1];
  const fn = parent?.[key];
  return typeof fn === 'function' ? fn.bind(parent) : null;
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

function sendJson(res, code, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(code, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(body);
}

/**
 * Локальный HTTP-мост к Anixart API (только dev, только 127.0.0.1, с Bearer-токеном).
 */
function createDevApiBridge(deps) {
  const {
    isDev,
    getAnixart,
    getRawConfig,
    saveConfig,
    logger,
  } = deps;

  let server = null;

  function getStatus() {
    const raw = getRawConfig();
    const port = Number(raw.devApiBridgePort) || DEFAULT_PORT;
    return {
      available: isDev,
      enabled: isDev && raw.devApiBridgeEnabled === true,
      port,
      token: raw.devApiBridgeToken || null,
      hasAuth: !!raw.token,
      login: raw.profileLogin || null,
      running: !!server,
      baseUrl: `http://${HOST}:${port}`,
    };
  }

  async function handleRequest(req, res) {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Authorization, Content-Type');

    if (req.method === 'OPTIONS') {
      res.writeHead(204);
      res.end();
      return;
    }

    const status = getStatus();
    const url = new URL(req.url, status.baseUrl);

    if (url.pathname === '/health' && req.method === 'GET') {
      sendJson(res, 200, { ok: true, ...status });
      return;
    }

    const auth = String(req.headers.authorization || '');
    const bearer = auth.startsWith('Bearer ') ? auth.slice(7) : '';
    const token = getRawConfig().devApiBridgeToken;

    if (!token || bearer !== token) {
      sendJson(res, 401, { ok: false, error: 'Unauthorized' });
      return;
    }

    try {
      if (url.pathname === '/v1/methods' && req.method === 'GET') {
        sendJson(res, 200, { ok: true, methods: COMMON_METHODS });
        return;
      }

      if (url.pathname === '/v1/call' && req.method === 'POST') {
        const body = await readJsonBody(req);
        const dotPath = body.path;
        const args = Array.isArray(body.args) ? body.args : [];

        if (!dotPath || typeof dotPath !== 'string') {
          sendJson(res, 400, { ok: false, error: 'Missing path' });
          return;
        }

        const client = getAnixart();
        const fn = resolveEndpointFn(client, dotPath);
        if (!fn) {
          sendJson(res, 404, { ok: false, error: `Unknown path: ${dotPath}` });
          return;
        }

        logger.info('dev-bridge', `call ${dotPath}`, { args });
        const data = await fn(...args);
        sendJson(res, 200, { ok: true, data });
        return;
      }

      sendJson(res, 404, { ok: false, error: 'Not found' });
    } catch (err) {
      const message = err?.message ? String(err.message) : String(err);
      logger.error('dev-bridge', message);
      sendJson(res, 500, { ok: false, error: message });
    }
  }

  function stop() {
    if (!server) return Promise.resolve();
    const current = server;
    server = null;
    return new Promise((resolve) => {
      current.close(() => resolve());
    });
  }

  async function start() {
    if (!isDev) return false;

    const raw = getRawConfig();
    if (raw.devApiBridgeEnabled !== true) {
      await stop();
      return false;
    }

    if (!raw.devApiBridgeToken) {
      saveConfig({ devApiBridgeToken: generateToken() });
    }

    await stop();

    const port = Number(getRawConfig().devApiBridgePort) || DEFAULT_PORT;

    return new Promise((resolve, reject) => {
      const nextServer = http.createServer((req, res) => {
        handleRequest(req, res).catch((err) => {
          sendJson(res, 500, { ok: false, error: err?.message || String(err) });
        });
      });

      nextServer.on('error', reject);
      nextServer.listen(port, HOST, () => {
        server = nextServer;
        logger.info('dev-bridge', `listening on http://${HOST}:${port}`);
        resolve(true);
      });
    });
  }

  async function setEnabled(enabled) {
    if (!isDev) return getStatus();

    const updates = { devApiBridgeEnabled: !!enabled };
    if (enabled && !getRawConfig().devApiBridgeToken) {
      updates.devApiBridgeToken = generateToken();
    }

    saveConfig(updates);

    if (enabled) await start();
    else await stop();

    return getStatus();
  }

  async function regenerateToken() {
    if (!isDev) return getStatus();
    saveConfig({ devApiBridgeToken: generateToken() });
    return getStatus();
  }

  return {
    COMMON_METHODS,
    DEFAULT_PORT,
    getStatus,
    start,
    stop,
    setEnabled,
    regenerateToken,
  };
}

module.exports = {
  createDevApiBridge,
  DEFAULT_PORT,
  HOST,
  COMMON_METHODS,
};
