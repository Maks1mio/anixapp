'use strict';

const path = require('path');
const state = require('./app-state');
const logger = require('../logger');

const PROTOCOL = 'anixart';
/** VK ID redirect scheme из Anixart Android (VKIDRedirectScheme). */
const VK_ID_PROTOCOL = 'vk54701760';

const EXTRA_PROTOCOLS = [VK_ID_PROTOCOL];

/** @type {string | null} */
let pendingUrl = null;

/**
 * @param {string} url
 * @returns {{ type: string, id: number, url: string } | null}
 */
function parseDeepLink(url) {
  if (!url || typeof url !== 'string' || !url.startsWith(`${PROTOCOL}://`)) return null;
  try {
    const u = new URL(url);
    const type = (u.hostname || u.pathname.replace(/^\//, '').split('/')[0] || '').toLowerCase();
    const idRaw = u.searchParams.get('id');
    const id = idRaw != null ? Number(idRaw) : NaN;
    if (!type || !Number.isFinite(id) || id <= 0) return null;
    if (type === 'profile' || type === 'release' || type === 'collection' || type === 'channel' || type === 'article') {
      return { type, id, url };
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * @param {string[]} argv
 * @returns {string | null}
 */
function findDeepLinkInArgv(argv) {
  if (!Array.isArray(argv)) return null;
  for (const arg of argv) {
    if (typeof arg !== 'string') continue;
    if (arg.startsWith(`${PROTOCOL}://`)) return arg;
    if (arg.startsWith(`${VK_ID_PROTOCOL}://`)) return arg;
  }
  return null;
}

/**
 * @param {import('electron').App} app
 * @param {string} protocol
 */
function registerOneProtocol(app, protocol) {
  if (process.defaultApp) {
    if (process.argv.length >= 2) {
      app.setAsDefaultProtocolClient(protocol, process.execPath, [path.resolve(process.argv[1])]);
    }
  } else {
    app.setAsDefaultProtocolClient(protocol);
  }
  logger.info('deep-link', 'protocol registered', { protocol });
}

/**
 * @param {import('electron').App} app
 */
function registerProtocolClient(app) {
  try {
    registerOneProtocol(app, PROTOCOL);
    for (const p of EXTRA_PROTOCOLS) {
      registerOneProtocol(app, p);
    }
  } catch (err) {
    logger.error('deep-link', `register failed: ${err?.message || err}`);
  }
}

/**
 * @param {string} url
 */
function deliverDeepLink(url) {
  // OAuth callback из браузера: anixart://oauth/… или vk54701760://…
  try {
    const { handleOAuthDeepLink } = require('./oauth-login');
    if (handleOAuthDeepLink(url)) {
      logger.info('deep-link', 'oauth handled', { url: String(url).slice(0, 80) });
      return;
    }
  } catch (err) {
    logger.warn('deep-link', 'oauth handler error', { error: String(err?.message || err) });
  }

  const parsed = parseDeepLink(url);
  if (!parsed) {
    logger.warn('deep-link', 'ignored url', { url });
    return;
  }

  const win = state.mainWindow;
  if (!win || win.isDestroyed()) {
    pendingUrl = url;
    logger.info('deep-link', 'queued (no window)', { url });
    return;
  }

  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();

  const send = () => {
    if (!win.isDestroyed()) {
      win.webContents.send('anix:deepLink', parsed);
      logger.info('deep-link', 'delivered', parsed);
    }
  };

  if (win.webContents.isLoadingMainFrame()) {
    win.webContents.once('did-finish-load', send);
  } else {
    send();
  }
}

function flushPendingDeepLink() {
  if (!pendingUrl) return;
  const url = pendingUrl;
  pendingUrl = null;
  deliverDeepLink(url);
}

/**
 * @param {import('electron').App} app
 */
function setupDeepLinks(app) {
  registerProtocolClient(app);

  app.on('open-url', (event, url) => {
    event.preventDefault();
    deliverDeepLink(url);
  });

  const coldStart = findDeepLinkInArgv(process.argv);
  if (coldStart) {
    pendingUrl = coldStart;
  }
}

/**
 * @param {string[]} commandLine
 */
function handleSecondInstanceArgv(commandLine) {
  const url = findDeepLinkInArgv(commandLine);
  if (url) deliverDeepLink(url);
  else if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    if (state.mainWindow.isMinimized()) state.mainWindow.restore();
    state.mainWindow.show();
    state.mainWindow.focus();
  }
}

module.exports = {
  PROTOCOL,
  VK_ID_PROTOCOL,
  parseDeepLink,
  findDeepLinkInArgv,
  setupDeepLinks,
  deliverDeepLink,
  flushPendingDeepLink,
  handleSecondInstanceArgv,
};
