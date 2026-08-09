'use strict';

const crypto = require('crypto');
const http = require('http');
const path = require('path');
const { app, BrowserWindow, shell } = require('electron');
const state = require('./app-state');
const logger = require('../logger');

/** Anixart VK ID (Android 9.0 BETA 21) — нельзя ходить через oauth.vk.com (Security Error). */
const VK_CLIENT_ID = '54701760';
const VK_REDIRECT_SCHEME = 'vk54701760';
const VK_REDIRECT_BASE = `${VK_REDIRECT_SCHEME}://vk.ru/blank.html`;
const VK_ID_SDK_VERSION = '2.7.2';
const GOOGLE_CLIENT_ID =
  '983926366374-c3jvolf9t8e151mbgriuqi7uqnbt4c4p.apps.googleusercontent.com';
const FIREBASE_API_KEY = 'AIzaSyBFPckWOsp0MEqb_1gwszvM1ILdUixM-uw';
const FIREBASE_AUTH_HANDLER =
  'https://anime-ad-eb8b3.firebaseapp.com/__/auth/handler';

/** Telegram Login (из AuthActivity). */
const TELEGRAM_CLIENT_ID = '8789559054';
const TELEGRAM_REDIRECT = 'https://app1593901251-login.tg.dev/tglogin';
const TELEGRAM_SCOPE = 'profile';

/** Yandex ID (meta-data com.yandex.auth.CLIENT_ID). */
const YANDEX_CLIENT_ID = 'a980f00536554180b4826f7daa76f060';
const YANDEX_REDIRECT = `https://yx${YANDEX_CLIENT_ID}.oauth.yandex.ru/auth/finish`;

const OAUTH_TIMEOUT_MS = 5 * 60 * 1000;
const OAUTH_APP_DEVICE_LABEL = 'Приложение Anixapp';

function getOAuthUserAgent() {
  let ver = '1.0';
  try {
    ver = app.getVersion() || ver;
  } catch {
    try {
      ver = require('../../package.json').version || ver;
    } catch {
      /* ignore */
    }
  }
  return (
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
    `Chrome/131.0.0.0 Safari/537.36 Anixapp/${ver} (${OAUTH_APP_DEVICE_LABEL})`
  );
}

/** Подмена «неизвестном устройстве» и похожих фраз на экранах OAuth. */
function buildDeviceLabelScript() {
  return `(() => {
  const LABEL = ${JSON.stringify(OAUTH_APP_DEVICE_LABEL)};

  function fixString(s) {
    if (!s || typeof s !== 'string') return s;
    let out = s.replace(
      /на[\\s\\u00a0\\u202f\\u2009]+неизвестн[а-яё]*[\\s\\u00a0\\u202f\\u2009]+устройств[а-яё]*/gi,
      'через ' + LABEL,
    );
    out = out.replace(
      /неизвестн[а-яё]*[\\s\\u00a0\\u202f\\u2009]+устройств[а-яё]*/gi,
      LABEL,
    );
    out = out.replace(/unknown\\s+device|unrecognized\\s+device/gi, LABEL);
    return out;
  }

  function looksUnknown(s) {
    return /неизвестн[а-яё]*[\\s\\u00a0\\u202f\\u2009]*устройств/i.test(s || '')
      || /unknown\\s+device/i.test(s || '');
  }

  function walk(node, depth) {
    if (!node || depth > 50) return;
    if (node.nodeType === 3) {
      const next = fixString(node.nodeValue);
      if (next !== node.nodeValue) node.nodeValue = next;
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node;
    const tag = (el.tagName || '').toLowerCase();
    if (tag === 'script' || tag === 'style' || tag === 'noscript' || tag === 'svg' || tag === 'textarea' || tag === 'input') {
      return;
    }

    for (const attr of ['aria-label', 'title', 'alt', 'placeholder']) {
      if (!el.hasAttribute || !el.hasAttribute(attr)) continue;
      const v = el.getAttribute(attr);
      const n = fixString(v);
      if (n !== v) el.setAttribute(attr, n);
    }

    if (el.childElementCount > 0 && el.childElementCount < 40) {
      const joined = (el.textContent || '').replace(/[\\s\\u00a0\\u202f\\u2009]+/g, ' ').trim();
      if (looksUnknown(joined)) {
        const fixed = fixString(el.textContent || '');
        if (fixed !== el.textContent) {
          const onlyPhrasing = Array.from(el.children).every((c) =>
            /^(SPAN|B|I|STRONG|EM|A|FONT|WBR|BR)$/i.test(c.tagName),
          );
          if (onlyPhrasing && !el.querySelector('input,button,img,svg,a[href]')) {
            el.textContent = fixed;
            return;
          }
        }
      }
    }

    if (el.shadowRoot) {
      for (const child of Array.from(el.shadowRoot.childNodes || [])) walk(child, depth + 1);
    }
    for (const child of Array.from(el.childNodes || [])) walk(child, depth + 1);
  }

  function run() {
    try { walk(document.documentElement || document.body, 0); } catch (e) {}
  }

  run();
  if (!window.__anixOAuthDevicePatch) {
    window.__anixOAuthDevicePatch = true;
    try {
      new MutationObserver(() => run()).observe(document.documentElement, {
        childList: true,
        subtree: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['aria-label', 'title', 'alt'],
      });
    } catch (e) {}
    setInterval(run, 350);
  }
})();`;
}

/** @type {{ reject: (e: Error) => void, timer: NodeJS.Timeout } | null} */
let pendingCancel = null;

/**
 * Ожидание внешнего OAuth (protocol / loopback).
 * @type {{
 *   resolve: (v: { url: string, params: Record<string, string> }) => void,
 *   reject: (e: Error) => void,
 *   timer: NodeJS.Timeout,
 * } | null}
 */
let pendingExternalOAuth = null;

function focusMainWindow() {
  const win = state.mainWindow;
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

function base64Url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
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
  const err = new Error(reason || 'cancelled');
  if (pendingCancel) {
    const p = pendingCancel;
    pendingCancel = null;
    clearTimeout(p.timer);
    p.reject(err);
  }
  if (pendingExternalOAuth) {
    const p = pendingExternalOAuth;
    pendingExternalOAuth = null;
    clearTimeout(p.timer);
    p.reject(err);
  }
}

/** Android Base64.DEFAULT без переносов строк (oauth2_params / stats_info). */
function base64StdNoWrap(obj) {
  return Buffer.from(JSON.stringify(obj), 'utf8')
    .toString('base64')
    .replace(/\r?\n/g, '');
}

function normalizeOAuthParams(url, params) {
  /** @type {Record<string, string>} */
  const out = { ...params };
  if (out.payload) {
    try {
      const raw = decodeURIComponent(out.payload);
      const payload = JSON.parse(raw);
      if (payload && typeof payload === 'object') {
        for (const [k, v] of Object.entries(payload)) {
          if (v != null && out[k] == null) out[k] = String(v);
        }
      }
    } catch {
      /* ignore */
    }
  }
  return out;
}

function isVkIdCallbackUrl(url) {
  return typeof url === 'string' && url.startsWith(`${VK_REDIRECT_SCHEME}://`);
}

function isAnixartOAuthCallbackUrl(url) {
  return typeof url === 'string' && (
    url.startsWith('anixart://oauth')
    || url.startsWith('anixart://oauth/')
  );
}

/**
 * Deep link / protocol callback из системного браузера.
 * @param {string} url
 */
function resolveExternalOAuthCallback(url) {
  if (!pendingExternalOAuth) return false;
  if (!isVkIdCallbackUrl(url) && !isAnixartOAuthCallbackUrl(url)) return false;
  const params = normalizeOAuthParams(url, parseParamsFromUrl(url));
  const p = pendingExternalOAuth;
  pendingExternalOAuth = null;
  clearTimeout(p.timer);
  if (pendingCancel) pendingCancel = null;
  focusMainWindow();
  p.resolve({ url, params });
  return true;
}

/**
 * OAuth во встроенном окне.
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
      title: opts.title || OAUTH_APP_DEVICE_LABEL,
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        // sandbox ломает SPA VK ID / некоторые oauth-страницы в Electron
        sandbox: false,
        partition: 'persist:anixapp-oauth',
        preload: path.join(__dirname, '..', 'oauth-device-label-preload.js'),
      },
    });

    try {
      const ua = getOAuthUserAgent();
      win.webContents.setUserAgent(ua);
      win.webContents.session.setUserAgent(ua);
    } catch {
      /* ignore */
    }

    const injectDeviceLabel = () => {
      if (settled || win.isDestroyed()) return;
      const script = buildDeviceLabelScript();
      const injectFrame = (frame) => {
        if (!frame) return;
        try {
          if (typeof frame.isDestroyed === 'function' && frame.isDestroyed()) return;
        } catch {
          return;
        }
        try {
          frame.executeJavaScript(script, true).catch(() => {});
        } catch {
          /* ignore */
        }
        try {
          const children = frame.frames || [];
          for (const child of children) injectFrame(child);
        } catch {
          /* ignore */
        }
      };
      try {
        injectFrame(win.webContents.mainFrame);
      } catch {
        win.webContents.executeJavaScript(script, true).catch(() => {});
      }
    };

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

    const normalizeParams = normalizeOAuthParams;

    const checkUrl = async (maybeUrl) => {
      if (settled || win.isDestroyed()) return;
      let url = typeof maybeUrl === 'string' && maybeUrl ? maybeUrl : '';
      if (
        !url.includes('access_token=') &&
        !url.includes('id_token=') &&
        !url.includes('error=') &&
        !url.includes('code=') &&
        !url.includes('payload=')
      ) {
        const href = await readPageHref(win.webContents);
        if (href) url = href;
      }
      if (settled || !url) return;
      const params = normalizeParams(url, parseParamsFromUrl(url));
      if (!opts.isDone(url, params)) return;
      finish(null, { url, params });
    };

    win.webContents.on('will-redirect', (_e, url) => {
      void checkUrl(url);
    });
    win.webContents.on('will-navigate', (_e, url) => {
      if (typeof url === 'string' && (isVkIdCallbackUrl(url) || url.startsWith('yxa'))) {
        _e.preventDefault();
      }
      void checkUrl(url);
    });
    win.webContents.on('did-navigate', (_e, url) => {
      injectDeviceLabel();
      void checkUrl(url);
    });
    win.webContents.on('did-navigate-in-page', (_e, url) => {
      injectDeviceLabel();
      void checkUrl(url);
    });
    win.webContents.on('dom-ready', () => {
      injectDeviceLabel();
    });
    win.webContents.on('did-finish-load', () => {
      injectDeviceLabel();
      void checkUrl();
    });
    win.webContents.on('did-frame-finish-load', () => {
      injectDeviceLabel();
      void checkUrl();
    });
    win.webContents.on('did-fail-load', (_e, _code, _desc, validatedURL) => {
      if (validatedURL) void checkUrl(validatedURL);
    });
    win.webContents.setWindowOpenHandler(({ url }) => {
      void checkUrl(url);
      return { action: 'deny' };
    });

    win.on('closed', () => {
      if (!settled) finish(new Error('cancelled'));
    });

    let loadStarted = false;
    const loadAuth = (attempt) => {
      if (win.isDestroyed() || settled) return;
      if (attempt === 0) {
        if (loadStarted) return;
        loadStarted = true;
      }
      win.loadURL(authUrl).catch((err) => {
        const msg = String(err?.message || err);
        if (attempt < 1 && /ERR_FAILED/i.test(msg)) {
          logger.warn('oauth', 'loadURL ERR_FAILED, retry', { attempt, msg: msg.slice(0, 160) });
          setTimeout(() => {
            if (!settled && !win.isDestroyed()) loadAuth(attempt + 1);
          }, 400);
          return;
        }
        finish(err);
      });
    };

    // Даём окну отрисоваться до навигации — иначе Electron иногда даёт ERR_FAILED (-2)
    const startLoad = () => setTimeout(() => loadAuth(0), 50);
    if (win.isVisible()) {
      startLoad();
    } else {
      win.once('ready-to-show', () => {
        try {
          win.show();
        } catch {
          /* ignore */
        }
        startLoad();
      });
      setTimeout(() => {
        if (!loadStarted && !settled && !win.isDestroyed()) {
          try {
            win.show();
          } catch {
            /* ignore */
          }
          startLoad();
        }
      }, 600);
    }
  });
}

function buildVkIdAuth() {
  // PKCE как в Vk ID SDK: Base64 URL_SAFE|NO_WRAP|NO_PADDING от 128 байт
  const codeVerifier = base64Url(crypto.randomBytes(128));
  const codeChallenge = base64Url(crypto.createHash('sha256').update(codeVerifier, 'latin1').digest());
  // State: 32 alphanumeric (StateGenerator)
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  let stateStr = '';
  const stateBytes = crypto.randomBytes(32);
  for (let i = 0; i < 32; i++) stateStr += alphabet[stateBytes[i] % alphabet.length];

  const sessionId = crypto.randomUUID();
  const statsObj = { flow_source: 'from_custom_auth', session_id: sessionId };
  const statsInfo = base64StdNoWrap(statsObj);
  const oauthParams = base64StdNoWrap({ scope: 'email' });
  const redirectUri = `${VK_REDIRECT_BASE}?oauth2_params=${oauthParams}`;

  const authUrl =
    'https://id.vk.ru/authorize?' +
    `client_id=${encodeURIComponent(VK_CLIENT_ID)}` +
    `&response_type=code` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&code_challenge_method=s256` +
    `&code_challenge=${encodeURIComponent(codeChallenge)}` +
    `&state=${encodeURIComponent(stateStr)}` +
    `&prompt=` +
    `&stats_info=${encodeURIComponent(statsInfo)}` +
    `&sdk_type=vkid` +
    `&v=${encodeURIComponent(VK_ID_SDK_VERSION)}` +
    `&scope=${encodeURIComponent('email')}`;

  return { authUrl, codeVerifier, state: stateStr, redirectUri };
}

async function exchangeVkIdCode({ code, codeVerifier, deviceId, state: oauthState, redirectUri }) {
  const body =
    `grant_type=authorization_code` +
    `&code=${encodeURIComponent(code)}` +
    `&code_verifier=${encodeURIComponent(codeVerifier)}` +
    `&client_id=${encodeURIComponent(VK_CLIENT_ID)}` +
    `&device_id=${encodeURIComponent(deviceId)}` +
    `&redirect_uri=${encodeURIComponent(redirectUri)}` +
    `&state=${encodeURIComponent(oauthState)}`;

  const res = await fetch('https://id.vk.ru/oauth2/auth', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error(
      (data && (data.error_description || data.error || data.error_msg)) ||
        `vk_token_http_${res.status}`,
    );
  }
  const accessToken = String(data?.access_token || data?.accessToken || '').trim();
  if (!accessToken) {
    logger.warn('oauth', 'vk id exchange empty token', { bodyPreview: text.slice(0, 240) });
    throw new Error('vk_no_token');
  }
  return accessToken;
}

/**
 * Ждём callback из системного браузера (protocol / loopback).
 * Показываем маленькое окно «дождитесь входа».
 * @param {string} authUrl
 * @param {{ title?: string, providerLabel?: string }} opts
 */
function waitSystemBrowserAuth(authUrl, opts = {}) {
  return new Promise((resolve, reject) => {
    cancelPending('cancelled');

    const label = opts.providerLabel || 'сервиса';
    const win = new BrowserWindow({
      width: 420,
      height: 220,
      parent: state.mainWindow && !state.mainWindow.isDestroyed() ? state.mainWindow : undefined,
      modal: !!(state.mainWindow && !state.mainWindow.isDestroyed()),
      show: true,
      autoHideMenuBar: true,
      resizable: false,
      title: opts.title || 'Авторизация',
      webPreferences: {
        nodeIntegration: false,
        contextIsolation: true,
        sandbox: true,
      },
    });

    let settled = false;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null;

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      pendingCancel = null;
      if (pendingExternalOAuth) {
        clearTimeout(pendingExternalOAuth.timer);
        pendingExternalOAuth = null;
      }
      try {
        if (!win.isDestroyed()) win.close();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(value);
    };

    timer = setTimeout(() => finish(new Error('timeout')), OAUTH_TIMEOUT_MS);

    pendingCancel = {
      reject: (e) => finish(e),
      timer,
    };

    pendingExternalOAuth = {
      resolve: (v) => finish(null, v),
      reject: (e) => finish(e),
      timer,
    };

    win.on('closed', () => {
      if (!settled) finish(new Error('cancelled'));
    });

    const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<style>
  body{margin:0;font-family:Segoe UI,system-ui,sans-serif;background:#141414;color:#eee;
    display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px;}
  p{margin:0 0 8px;line-height:1.4;font-size:14px}
  .m{opacity:.7;font-size:12px}
</style></head><body>
  <div>
    <p>Завершите вход во внешнем браузере</p>
    <p class="m">После разрешения ${label} вернёт вас в AnixApp.<br>Закройте это окно, чтобы отменить.</p>
  </div>
</body></html>`;

    win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {});

    shell.openExternal(authUrl).catch((err) => finish(err));
  });
}

/**
 * OAuth в системном браузере с redirect на localhost (implicit token в hash → bridge HTML).
 * @param {{
 *   title: string,
 *   providerLabel: string,
 *   buildAuthUrl: (redirectUri: string) => string,
 *   timeoutMs?: number,
 * }} opts
 */
function waitLoopbackSystemBrowserAuth(opts) {
  return new Promise((resolve, reject) => {
    cancelPending('cancelled');

    /** @type {import('http').Server | null} */
    let server = null;
    let settled = false;
    /** @type {ReturnType<typeof setTimeout> | null} */
    let timer = null;
    /** @type {BrowserWindow | null} */
    let win = null;
    const timeoutMs = opts.timeoutMs || OAUTH_TIMEOUT_MS;

    const cleanupServer = () => {
      if (!server) return;
      try {
        server.close();
      } catch {
        /* ignore */
      }
      server = null;
    };

    const finish = (err, value) => {
      if (settled) return;
      settled = true;
      if (timer) clearTimeout(timer);
      pendingCancel = null;
      if (pendingExternalOAuth) {
        clearTimeout(pendingExternalOAuth.timer);
        pendingExternalOAuth = null;
      }
      cleanupServer();
      try {
        if (win && !win.isDestroyed()) win.close();
      } catch {
        /* ignore */
      }
      if (err) reject(err);
      else resolve(value);
    };

    const onCapture = (rawUrl, params) => {
      finish(null, { url: rawUrl, params: normalizeOAuthParams(rawUrl, params) });
    };

    server = http.createServer((req, res) => {
      try {
        const host = `http://127.0.0.1`;
        const reqUrl = new URL(req.url || '/', host);
        if (reqUrl.pathname === '/callback') {
          // Implicit flow кладёт токен в #hash — браузер не шлёт hash на сервер.
          // Отдаём HTML, который пересылает hash на /done и дублирует в anixart://.
          res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
          res.end(`<!doctype html><html lang="ru"><head><meta charset="utf-8"><title>AnixApp</title>
<style>body{font-family:Segoe UI,system-ui,sans-serif;background:#141414;color:#eee;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;text-align:center;padding:24px}</style>
</head><body><p>Вход выполнен. Возвращаем в AnixApp…</p>
<script>
(function () {
  var data = (location.hash || '').replace(/^#/, '') || (location.search || '').replace(/^\\?/, '');
  if (!data) {
    document.body.innerHTML = '<p>Нет данных авторизации. Можно закрыть окно.</p>';
    return;
  }
  function goApp() {
    try { location.href = 'anixart://oauth/callback?' + data; } catch (e) {}
  }
  fetch('/done?' + data).then(function () {
    document.body.innerHTML = '<p>Готово. Можно закрыть это окно и вернуться в AnixApp.</p>';
    goApp();
  }).catch(function () {
    goApp();
    document.body.innerHTML = '<p>Готово. Можно закрыть это окно и вернуться в AnixApp.</p>';
  });
})();
</script></body></html>`);
          return;
        }
        if (reqUrl.pathname === '/done') {
          const params = {};
          for (const [k, v] of reqUrl.searchParams) params[k] = v;
          res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' });
          res.end('ok');
          const full = `http://127.0.0.1/done?${reqUrl.searchParams.toString()}`;
          onCapture(full, params);
          return;
        }
        res.writeHead(404);
        res.end('not found');
      } catch (err) {
        try {
          res.writeHead(500);
          res.end('error');
        } catch {
          /* ignore */
        }
        finish(err instanceof Error ? err : new Error(String(err)));
      }
    });

    server.listen(0, '127.0.0.1', () => {
      const addr = server.address();
      const port = addr && typeof addr === 'object' ? addr.port : 0;
      if (!port) {
        finish(new Error('loopback_bind_failed'));
        return;
      }
      const redirectUri = `http://127.0.0.1:${port}/callback`;
      let authUrl;
      try {
        authUrl = opts.buildAuthUrl(redirectUri);
      } catch (err) {
        finish(err instanceof Error ? err : new Error(String(err)));
        return;
      }

      timer = setTimeout(() => finish(new Error('timeout')), timeoutMs);
      pendingCancel = {
        reject: (e) => finish(e),
        timer,
      };
      pendingExternalOAuth = {
        resolve: (v) => finish(null, v),
        reject: (e) => finish(e),
        timer,
      };

      win = new BrowserWindow({
        width: 420,
        height: 220,
        parent: state.mainWindow && !state.mainWindow.isDestroyed() ? state.mainWindow : undefined,
        modal: !!(state.mainWindow && !state.mainWindow.isDestroyed()),
        show: true,
        autoHideMenuBar: true,
        resizable: false,
        title: opts.title || 'Авторизация',
        webPreferences: {
          nodeIntegration: false,
          contextIsolation: true,
          sandbox: true,
        },
      });

      win.on('closed', () => {
        if (!settled) finish(new Error('cancelled'));
      });

      const html = `<!doctype html><html lang="ru"><head><meta charset="utf-8">
<style>
  body{margin:0;font-family:Segoe UI,system-ui,sans-serif;background:#141414;color:#eee;
    display:flex;align-items:center;justify-content:center;height:100vh;text-align:center;padding:24px;}
  p{margin:0 0 8px;line-height:1.4;font-size:14px}
  .m{opacity:.7;font-size:12px}
</style></head><body>
  <div>
    <p>Завершите вход во внешнем браузере</p>
    <p class="m">После разрешения ${opts.providerLabel} вернёт вас в AnixApp.<br>Закройте это окно, чтобы отменить.</p>
  </div>
</body></html>`;

      win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`).catch(() => {});
      logger.info('oauth', 'loopback system browser', { port, title: opts.title });
      shell.openExternal(authUrl).catch((err) => finish(err));
    });

    server.on('error', (err) => finish(err));
  });
}

async function getVkAccessToken() {
  const { authUrl, codeVerifier, state: oauthState, redirectUri } = buildVkIdAuth();

  logger.info('oauth', 'vk id system browser', {
    clientId: VK_CLIENT_ID,
    redirectHost: 'vk.ru/blank.html',
  });

  const { url, params } = await waitSystemBrowserAuth(authUrl, {
    title: 'Вход через VK',
    providerLabel: 'VK',
  });

  if (params.error) {
    throw new Error(params.error_description || params.error || 'vk_error');
  }

  const returnedState = (params.state || '').trim();
  if (returnedState && returnedState !== oauthState) {
    throw new Error('vk_state_mismatch');
  }

  const implicit = (params.access_token || extractVkAccessToken(url) || '').trim();
  if (implicit && !params.code) {
    logger.info('oauth', 'vk token captured (implicit)', {
      len: implicit.length,
      prefix: implicit.slice(0, 6),
    });
    return implicit;
  }

  const code = (params.code || '').trim();
  if (!code) throw new Error('vk_no_code');

  const deviceId = (params.device_id || params.deviceId || '').trim() || crypto.randomUUID();
  const token = await exchangeVkIdCode({
    code,
    codeVerifier,
    deviceId,
    state: returnedState || oauthState,
    redirectUri,
  });

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

async function getGoogleViaBrowserWindow() {
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
  return googleIdToken;
}

async function getGoogleFirebaseIdToken() {
  // Web/Firebase client: системный браузер + localhost даёт redirect_uri mismatch.
  // Как Custom Tab на Android — окно Chromium с официальным Firebase redirect.
  const googleIdToken = await getGoogleViaBrowserWindow();
  logger.info('oauth', 'google id_token captured', { len: googleIdToken.length });

  try {
    return await exchangeGoogleTokenForFirebase(googleIdToken);
  } catch (err) {
    logger.warn('oauth', 'firebase exchange failed, trying raw google token', {
      error: String(err?.message || err),
    });
    return googleIdToken;
  }
}

async function exchangeTelegramCode(code, codeVerifier) {
  const body =
    `grant_type=authorization_code` +
    `&client_id=${encodeURIComponent(TELEGRAM_CLIENT_ID)}` +
    `&code=${encodeURIComponent(code)}` +
    `&redirect_uri=${encodeURIComponent(TELEGRAM_REDIRECT)}` +
    `&code_verifier=${encodeURIComponent(codeVerifier)}`;

  const res = await fetch('https://oauth.telegram.org/token', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Accept: 'application/json',
    },
    body,
  });
  const text = await res.text();
  let data = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = null;
  }
  if (!res.ok) {
    throw new Error((data && (data.error_description || data.error)) || `telegram_token_http_${res.status}`);
  }
  const idToken = (data?.id_token || '').trim();
  if (!idToken) throw new Error('telegram_no_id_token');
  return idToken;
}

async function getTelegramIdToken() {
  const verifierBytes = crypto.randomBytes(32);
  const codeVerifier = base64Url(verifierBytes);
  const challenge = base64Url(crypto.createHash('sha256').update(codeVerifier).digest());

  const authUrl =
    'https://oauth.telegram.org/auth?' +
    `client_id=${encodeURIComponent(TELEGRAM_CLIENT_ID)}` +
    `&response_type=code` +
    `&scope=${encodeURIComponent(TELEGRAM_SCOPE)}` +
    `&redirect_uri=${encodeURIComponent(TELEGRAM_REDIRECT)}` +
    `&code_challenge=${encodeURIComponent(challenge)}` +
    `&code_challenge_method=S256`;

  logger.info('oauth', 'telegram browserwindow');

  const { params } = await openAuthWindow(authUrl, {
    title: 'Вход через Telegram',
    isDone: (nextUrl, p) => {
      if (p.error) return true;
      if (p.code) return true;
      if (nextUrl.includes('tg.dev/tglogin') && (nextUrl.includes('code=') || nextUrl.includes('error='))) {
        return true;
      }
      return false;
    },
  });

  if (params.error) {
    throw new Error(params.error_description || params.error || 'telegram_error');
  }
  const code = (params.code || '').trim();
  if (!code) throw new Error('telegram_no_code');

  const idToken = await exchangeTelegramCode(code, codeVerifier);
  logger.info('oauth', 'telegram id_token captured', { len: idToken.length });
  return idToken;
}

async function getYandexViaBrowserWindow() {
  const authUrl =
    'https://oauth.yandex.ru/authorize?' +
    `response_type=token` +
    `&client_id=${encodeURIComponent(YANDEX_CLIENT_ID)}` +
    `&redirect_uri=${encodeURIComponent(YANDEX_REDIRECT)}` +
    `&force_confirm=yes`;

  logger.info('oauth', 'yandex browserwindow', { redirectUri: YANDEX_REDIRECT });

  const { url, params } = await openAuthWindow(authUrl, {
    title: 'Вход через Яндекс',
    isDone: (nextUrl, p) => {
      if (p.error) return true;
      if (p.access_token) return true;
      if (nextUrl.includes('/auth/finish') && nextUrl.includes('access_token=')) return true;
      if (nextUrl.includes('oauth.yandex.ru/verification_code') && nextUrl.includes('access_token=')) return true;
      return false;
    },
  });

  if (params.error) {
    throw new Error(params.error_description || params.error || 'yandex_error');
  }

  const token = (params.access_token || extractVkAccessToken(url) || '').trim();
  if (!token) throw new Error('yandex_no_token');
  return token;
}

async function getYandexAccessToken() {
  // Android-клиент Яндекса принимает только yxa… redirect — localhost не подойдёт.
  // Custom Tab → BrowserWindow с официальным redirect (перехват access_token в hash).
  const token = await getYandexViaBrowserWindow();
  logger.info('oauth', 'yandex token captured', { len: token.length, prefix: token.slice(0, 6) });
  return token;
}

/** Deep link: VK ID scheme или anixart://oauth/… */
function handleOAuthDeepLink(url) {
  if (!url || typeof url !== 'string') return false;
  if (resolveExternalOAuthCallback(url)) {
    logger.info('oauth', 'external callback received', { preview: url.slice(0, 96) });
    return true;
  }
  if (!url.startsWith('anixart://oauth')) return false;
  focusMainWindow();
  return true;
}

function completeOAuthFromUrl(url) {
  const token = extractVkAccessToken(url);
  return !!token;
}

function extractTokenFromPastedUrl(url) {
  return extractVkAccessToken(url);
}

module.exports = {
  getVkAccessToken,
  getGoogleFirebaseIdToken,
  getTelegramIdToken,
  getYandexAccessToken,
  handleOAuthDeepLink,
  completeOAuthFromUrl,
  extractTokenFromPastedUrl,
  cancelPending,
};
