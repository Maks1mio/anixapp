'use strict';

const crypto = require('crypto');
const { BrowserWindow } = require('electron');
const state = require('./app-state');
const logger = require('../logger');

/** Как в официальном Anixart Android. */
const VK_APP_ID = 7432776;
const GOOGLE_CLIENT_ID =
  '983926366374-c3jvolf9t8e151mbgriuqi7uqnbt4c4p.apps.googleusercontent.com';
const FIREBASE_API_KEY = 'AIzaSyBFPckWOsp0MEqb_1gwszvM1ILdUixM-uw';
const VK_REDIRECT = 'https://oauth.vk.com/blank.html';
const FIREBASE_AUTH_HANDLER =
  'https://anime-ad-eb8b3.firebaseapp.com/__/auth/handler';

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;

/** @type {{ reject: (e: Error) => void, timer: NodeJS.Timeout } | null} */
let pendingCancel = null;

function focusMainWindow() {
  const win = state.mainWindow;
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function parseParamsFromUrl(url) {
  /** @type {Record<string, string>} */
  const params = {};
  if (!url || typeof url !== 'string') return params;
  try {
    const u = new URL(url);
    for (const [k, v] of u.searchParams) params[k] = v;
    if (u.hash) {
      const hp = new URLSearchParams(u.hash.replace(/^#/, ''));
      for (const [k, v] of hp) {
        if (!(k in params)) params[k] = v;
      }
    }
  } catch {
    const hash = url.includes('#') ? url.split('#').pop() : '';
    const query = url.includes('?') ? url.split('?').pop()?.split('#')[0] : '';
    for (const part of [query, hash]) {
      if (!part) continue;
      const sp = new URLSearchParams(part);
      for (const [k, v] of sp) {
        if (!(k in params)) params[k] = v;
      }
    }
  }
  return params;
}

/** Достаёт access_token даже из «кривой» вставки. */
function extractVkAccessToken(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const params = parseParamsFromUrl(raw.trim());
  if (params.access_token) return params.access_token.trim();
  const m = raw.match(/access_token=([^&\s#]+)/i);
  if (m) {
    try {
      return decodeURIComponent(m[1]).trim();
    } catch {
      return m[1].trim();
    }
  }
  return '';
}

async function readPageHref(webContents) {
  if (!webContents || webContents.isDestroyed()) return '';
  try {
    const href = await webContents.executeJavaScript('String(location.href || "")', true);
    if (href) return href;
  } catch {
    /* ignore */
  }
  try {
    return webContents.getURL() || '';
  } catch {
    return '';
  }
}

function cancelPending(reason) {
  if (!pendingCancel) return;
  const p = pendingCancel;
  pendingCancel = null;
  clearTimeout(p.timer);
  p.reject(new Error(reason || 'cancelled'));
}

/**
 * OAuth во встроенном окне (системный браузер нельзя: у Anixart нет наших redirect URI).
 * @param {string} authUrl
 * @param {{ title: string, isDone: (url: string, params: Record<string, string>) => boolean }} opts
 */
function openAuthWindow(authUrl, opts) {
  return new Promise((resolve, reject) => {
    let settled = false;

    cancelPending('cancelled');

    const win = new BrowserWindow({
      width: 520,
      height: 740,
      parent: state.mainWindow && !state.mainWindow.isDestroyed() ? state.mainWindow : undefined,
      modal: !!(state.mainWindow && !state.mainWindow.isDestroyed()),
      show: true,
      autoHideMenuBar: true,
      title: opts.title || 'Авторизация',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null;

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      if (pendingCancel) pendingCancel = null;
      try {
        if (!win.isDestroyed()) win.close();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(value);
    };

    timer = setTimeout(() => {
      finish(new Error('timeout'));
    }, OAUTH_TIMEOUT_MS);

    pendingCancel = {
      reject: (e) => finish(e),
      timer,
    };

    const checkUrl = async (maybeUrl) => {
      if (settled || win.isDestroyed()) return;
      let url = typeof maybeUrl === 'string' && maybeUrl ? maybeUrl : '';
      // Electron часто отдаёт URL без hash — читаем location.href
      if (!url.includes('access_token=') && !url.includes('id_token=') && !url.includes('error=')) {
        const href = await readPageHref(win.webContents);
        if (href) url = href;
      }
      if (settled || !url) return;
      const params = parseParamsFromUrl(url);
      if (!opts.isDone(url, params)) return;
      finish(null, { url, params });
    };

    win.webContents.on('will-redirect', (_e, url) => {
      void checkUrl(url);
    });
    win.webContents.on('will-navigate', (_e, url) => {
      void checkUrl(url);
    });
    win.webContents.on('did-navigate', (_e, url) => {
      void checkUrl(url);
    });
    win.webContents.on('did-navigate-in-page', (_e, url) => {
      void checkUrl(url);
    });
    win.webContents.on('did-finish-load', () => {
      void checkUrl();
    });
    win.webContents.on('did-frame-finish-load', () => {
      void checkUrl();
    });

    win.on('closed', () => {
      if (!settled) finish(new Error('cancelled'));
    });

    win.loadURL(authUrl).catch((err) => finish(err));
  });
}

async function getVkAccessToken() {
  const authUrl =
    `https://oauth.vk.com/authorize?client_id=${VK_APP_ID}` +
    `&display=popup&redirect_uri=${encodeURIComponent(VK_REDIRECT)}` +
    `&scope=email&response_type=token&v=5.199&revoke=1`;

  logger.info('oauth', 'vk browserwindow');

  const { url, params } = await openAuthWindow(authUrl, {
    title: 'Вход через VK',
    isDone: (nextUrl, p) => {
      if (p.error) return true;
      if (p.access_token) return true;
      if (nextUrl.includes('oauth.vk.com/blank.html') && nextUrl.includes('access_token=')) return true;
      return false;
    },
  });

  if (params.error) {
    throw new Error(params.error_description || params.error || 'vk_error');
  }

  const token = (params.access_token || extractVkAccessToken(url) || '').trim();
  if (!token) throw new Error('vk_no_token');

  logger.info('oauth', 'vk token captured', { len: token.length, prefix: token.slice(0, 6) });
  return token;
}

async function exchangeGoogleTokenForFirebase(googleIdToken) {
  const body = {
    postBody: `id_token=${googleIdToken}&providerId=google.com`,
    requestUri: 'http://localhost',
    returnIdpCredential: true,
    returnSecureToken: true,
  };
  const res = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:signInWithIdp?key=${FIREBASE_API_KEY}`,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    },
  );
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !data.idToken) {
    const msg = data.error?.message || `firebase_exchange_${res.status}`;
    throw new Error(msg);
  }
  return data.idToken;
}

async function getGoogleFirebaseIdToken() {
  const nonce = crypto.randomBytes(16).toString('hex');
  const authUrl =
    'https://accounts.google.com/o/oauth2/v2/auth?' +
    `client_id=${encodeURIComponent(GOOGLE_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(FIREBASE_AUTH_HANDLER)}` +
    '&response_type=id_token' +
    '&scope=openid%20email%20profile' +
    `&nonce=${encodeURIComponent(nonce)}` +
    '&prompt=select_account';

  logger.info('oauth', 'google browserwindow', { redirectUri: FIREBASE_AUTH_HANDLER });

  const { url, params } = await openAuthWindow(authUrl, {
    title: 'Вход через Google',
    isDone: (nextUrl, p) => {
      if (p.id_token) return true;
      if (p.error) return true;
      if (nextUrl.includes('id_token=')) return true;
      if (nextUrl.includes('error=')) return true;
      return false;
    },
  });

  if (params.error || (url && /redirect_uri_mismatch/i.test(url))) {
    throw new Error(params.error_description || params.error || 'redirect_uri_mismatch');
  }

  const googleIdToken = (params.id_token || '').trim();
  if (!googleIdToken) throw new Error('google_no_token');

  logger.info('oauth', 'google id_token captured', { len: googleIdToken.length });

  // Как в Android: в Anixart уходит Firebase idToken
  try {
    return await exchangeGoogleTokenForFirebase(googleIdToken);
  } catch (err) {
    logger.warn('oauth', 'firebase exchange failed, trying raw google token', {
      error: String(err?.message || err),
    });
    return googleIdToken;
  }
}

/** Deep link больше не несёт токен — только фокус окна. */
function handleOAuthDeepLink(url) {
  if (!url || typeof url !== 'string') return false;
  if (!url.startsWith('anixart://oauth')) return false;
  focusMainWindow();
  return true;
}

function completeOAuthFromUrl(url) {
  // Совместимость с IPC paste: вернуть токен через pending нельзя в новой схеме.
  // Используется только для ручной вставки → отдельный путь в auth.js
  const token = extractVkAccessToken(url);
  return !!token;
}

function extractTokenFromPastedUrl(url) {
  return extractVkAccessToken(url);
}

module.exports = {
  getVkAccessToken,
  getGoogleFirebaseIdToken,
  handleOAuthDeepLink,
  completeOAuthFromUrl,
  extractTokenFromPastedUrl,
  cancelPending,
};
