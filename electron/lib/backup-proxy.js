'use strict';

const { BACKUP_API_PROXY } = require('./constants');
const config = require('./config-store');

/** Сколько держать sticky-failover после успешного обхода через прокси. */
const STICKY_MS = 60 * 60 * 1000;
/** Пока резерв включён — прогреваем туннель presence-запросами. */
const KEEPALIVE_MS = 10_000;

let stickyUntil = 0;
const listeners = new Set();

function normalizeBase(url) {
  return String(url || '')
    .trim()
    .replace(/\/$/, '');
}

function isBackupUrl(url) {
  const n = normalizeBase(url);
  return n === normalizeBase(BACKUP_API_PROXY) || n.includes('api.anixapp.com/anixart-api');
}

function getBackupProxyEnabled() {
  return config.loadConfig().backupProxyEnabled !== false;
}

function setBackupProxyEnabled(enabled) {
  config.saveConfig({ backupProxyEnabled: enabled !== false });
  if (!enabled) {
    clearSticky();
    stopTunnelKeepAlive();
  } else {
    emitStatus();
    startTunnelKeepAlive();
  }
}

function isStickyActive() {
  return Date.now() < stickyUntil;
}

function markSticky() {
  stickyUntil = Date.now() + STICKY_MS;
  emitStatus();
  startTunnelKeepAlive();
}

function clearSticky() {
  if (stickyUntil === 0) return;
  stickyUntil = 0;
  emitStatus();
}

let presenceTimer = null;

function stopTunnelKeepAlive() {
  if (presenceTimer) {
    clearInterval(presenceTimer);
    presenceTimer = null;
  }
}

async function sendPresenceOnce() {
  if (!getBackupProxyEnabled()) return;
  try {
    const { fetchAnixartProxy } = require('./anixart-proxy-auth');
    // Presence + light status GET keep nginx/sslocal/Anixart path warm.
    await Promise.allSettled([
      fetchAnixartProxy('/_presence', {
        method: 'POST',
        headers: { 'User-Agent': 'AnixApp-BackupPresence/1.0' },
        signal: AbortSignal.timeout(10_000),
      }),
      fetchAnixartProxy('/', {
        method: 'GET',
        signal: AbortSignal.timeout(10_000),
      }),
    ]);
    if (isStickyActive()) {
      stickyUntil = Date.now() + STICKY_MS;
    }
  } catch (_) {}
}

function startTunnelKeepAlive() {
  stopTunnelKeepAlive();
  if (!getBackupProxyEnabled()) return;
  // Greem path when backup is the active base or after failover sticky.
  const base = normalizeBase(config.loadConfig().baseUrl);
  if (!isBackupUrl(base) && !isStickyActive()) return;
  void sendPresenceOnce();
  presenceTimer = setInterval(() => {
    if (!getBackupProxyEnabled()) {
      stopTunnelKeepAlive();
      return;
    }
    const current = normalizeBase(config.loadConfig().baseUrl);
    if (!isBackupUrl(current) && !isStickyActive()) {
      stopTunnelKeepAlive();
      return;
    }
    void sendPresenceOnce();
  }, KEEPALIVE_MS);
}

function parseTunnel(data) {
  if (!data || typeof data !== 'object') return null;
  return {
    ready: data.ready === true,
    label: typeof data.label === 'string' ? data.label : null,
    latencyMs:
      typeof data.latencyMs === 'number' && Number.isFinite(data.latencyMs)
        ? Math.max(0, Math.round(data.latencyMs))
        : null,
    exitLabel: typeof data.exitLabel === 'string' ? data.exitLabel : 'Tunnel',
    gatewayHost: typeof data.gatewayHost === 'string' ? data.gatewayHost : 'api.anixapp.com',
    gatewayIp: typeof data.gatewayIp === 'string' ? data.gatewayIp : null,
    upstreamHost: typeof data.upstreamHost === 'string' ? data.upstreamHost : null,
    upstreamIp: typeof data.upstreamIp === 'string' ? data.upstreamIp : null,
    error: typeof data.error === 'string' ? data.error : null,
  };
}

function getStatus() {
  return {
    enabled: getBackupProxyEnabled(),
    url: BACKUP_API_PROXY,
    active: isStickyActive() && getBackupProxyEnabled(),
    stickyUntil: stickyUntil || null,
    connections: null,
    tunnel: null,
  };
}

async function getStatusWithConnections() {
  const status = getStatus();
  const baseIsBackup = isBackupUrl(config.loadConfig().baseUrl);
  if (!status.enabled && !baseIsBackup && !isStickyActive()) {
    status.tunnel = null;
    status.connections = null;
    return status;
  }
  try {
    const { fetchAnixartProxy } = require('./anixart-proxy-auth');
    const res = await fetchAnixartProxy('/', {
      method: 'GET',
      signal: AbortSignal.timeout(8_000),
    });
    if (res.ok) {
      const data = await res.json();
      if (typeof data?.connections === 'number') {
        status.connections = Math.max(0, Math.floor(data.connections));
      }
      status.tunnel = parseTunnel(data?.tunnel);
    }
  } catch (_) {}
  return status;
}

function onStatus(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emitStatus() {
  const status = getStatus();
  for (const fn of listeners) {
    try {
      fn(status);
    } catch (_) {}
  }
  try {
    const appState = require('./app-state');
    const win = appState.mainWindow;
    if (win && !win.isDestroyed()) {
      win.webContents.send('anix:backupProxy', status);
    }
  } catch (_) {}
}

function shouldFailoverError(err) {
  const msg = err && err.message ? String(err.message) : String(err);
  const httpStatus = err && typeof err.httpStatus === 'number' ? err.httpStatus : null;
  if (httpStatus === 429 || httpStatus === 502 || httpStatus === 503 || httpStatus === 504) return true;
  return (
    msg.includes('fetch failed') ||
    msg.includes('ENOTFOUND') ||
    msg.includes('ECONNREFUSED') ||
    msg.includes('ECONNRESET') ||
    msg.includes('ETIMEDOUT') ||
    msg.includes('AbortError') ||
    msg.includes('timeout') ||
    msg.includes('empty response') ||
    msg.includes('invalid JSON') ||
    msg.includes('HTTP 429') ||
    msg.includes('HTTP 502') ||
    msg.includes('HTTP 503') ||
    /\b429\b/.test(msg) ||
    /rate limit/i.test(msg) ||
    /Too Many Requests/i.test(msg)
  );
}

/**
 * Обёртка client.call: при сбое основного хоста один раз пробует резервный прокси.
 * Пока sticky активен — сразу ходит через прокси.
 */
function attachBackupProxyFailover(client) {
  if (!client || typeof client.call !== 'function') return client;
  const original = client.call.bind(client);

  client.call = async (request) => {
    const enabled = getBackupProxyEnabled();
    const primaryBase = String(request?.customBaseUrl ?? client.baseUrl ?? '');
    const alreadyBackup =
      isBackupUrl(primaryBase) || (request?.customBaseUrl && isBackupUrl(request.customBaseUrl));

    const useSticky = enabled && isStickyActive() && !alreadyBackup;
    const firstRequest = useSticky
      ? { ...request, customBaseUrl: BACKUP_API_PROXY }
      : request;

    try {
      return await original(firstRequest);
    } catch (err) {
      if (!enabled || alreadyBackup || useSticky || !shouldFailoverError(err)) {
        throw err;
      }
      try {
        const out = await original({ ...request, customBaseUrl: BACKUP_API_PROXY });
        markSticky();
        return out;
      } catch (_) {
        throw err;
      }
    }
  };

  return client;
}

/** Start keep-alive if backup was already enabled at process boot. */
function initBackupProxyKeepAlive() {
  if (!getBackupProxyEnabled()) return;
  const base = normalizeBase(config.loadConfig().baseUrl);
  if (isBackupUrl(base) || isStickyActive()) startTunnelKeepAlive();
}

module.exports = {
  BACKUP_API_PROXY,
  isBackupUrl,
  getBackupProxyEnabled,
  setBackupProxyEnabled,
  getStatus,
  getStatusWithConnections,
  clearSticky,
  markSticky,
  onStatus,
  attachBackupProxyFailover,
  shouldFailoverError,
  initBackupProxyKeepAlive,
  startTunnelKeepAlive,
};
