'use strict';

const path = require('path');
const { BrowserWindow, ipcMain, shell, app } = require('electron');
const state = require('../lib/app-state');
const { getDevServerOrigin } = require('../lib/dev-server');
const { macTitleBarOptions, setupMacWindow } = require('../lib/mac-window');

const player = {
  createPlayerWindow: null,
};

function register(deps) {
  const {
    isDev,
    getIconPath,
    applyUiZoom,
    electronDir,
    discordRpc,
    config,
    discord,
    logger,
  } = deps;

/** Как в официальном Anixart WebPlayerActivity (IFRAME=true). */
const DEFAULT_IFRAME_EMBED_URL = 'https://anixmirai.com/iframe?url=';
const DEFAULT_ANIXART_APP_ORIGIN = 'https://anixart-app.com/';
let cachedIframeEmbedUrl = '';
let cachedAnixartAppReferer = '';

/** Последнее качество Kodik в веб-плеере (память + auth.json). */
let rememberedKodikQuality = '';
let qualityPersistTimer = null;

function isKodikEmbedHost(hostname) {
  return /kodikplayer\.com|kodik\.info|aniqit\.com|anixis\.com|aniqart\.com/i.test(String(hostname || ''));
}

function normalizeKodikQualityToken(raw) {
  const m = String(raw || '').trim().toLowerCase().match(/(\d{3,4})\s*p?/);
  if (!m) return '';
  return `${m[1]}p`;
}

function loadRememberedKodikQuality() {
  if (rememberedKodikQuality) return rememberedKodikQuality;
  try {
    const config = require('../lib/config-store');
    const q = normalizeKodikQualityToken(config.getRawConfig()?.sourceWebKodikQuality);
    if (q) rememberedKodikQuality = q;
  } catch (_) { /* ignore */ }
  return rememberedKodikQuality;
}

function persistRememberedKodikQuality(quality) {
  const q = normalizeKodikQualityToken(quality);
  if (!q) return;
  rememberedKodikQuality = q;
  if (qualityPersistTimer) clearTimeout(qualityPersistTimer);
  qualityPersistTimer = setTimeout(() => {
    qualityPersistTimer = null;
    try {
      require('../lib/config-store').saveConfig({ sourceWebKodikQuality: q });
    } catch (_) { /* ignore */ }
  }, 200);
}

function parseKodikQuality(url) {
  try {
    const m = new URL(url).pathname.match(/\/(\d{3,4}p)(?=\/|$)/i);
    return m ? m[1].toLowerCase() : '';
  } catch {
    return '';
  }
}

/** Подставить сохранённое качество в pathname Kodik (/720p → /480p). */
function applyKodikQuality(url, quality) {
  const q = normalizeKodikQualityToken(quality || loadRememberedKodikQuality());
  if (!url || !q) return url;
  try {
    const u = new URL(url);
    if (!isKodikEmbedHost(u.hostname)) return url;
    if (/\/\d{3,4}p(?=\/|$)/i.test(u.pathname)) {
      u.pathname = u.pathname.replace(/\/\d{3,4}p(?=\/|$)/i, `/${q}`);
    } else {
      u.pathname = `${u.pathname.replace(/\/$/, '')}/${q}`;
    }
    return `${u.origin}${u.pathname}`;
  } catch {
    return url;
  }
}

function rememberKodikQuality(quality, ctx) {
  const q = normalizeKodikQualityToken(quality);
  if (!q) return;
  persistRememberedKodikQuality(q);
  if (ctx) ctx.preferredQuality = q;
}

function rememberKodikQualityFromUrl(url, ctx) {
  rememberKodikQuality(parseKodikQuality(url), ctx);
}

function normalizeSourceEmbedUrl(raw) {
  const s = String(raw || '').trim();
  if (!s) return '';
  const abs = s.startsWith('http') ? s : (s.startsWith('//') ? `https:${s}` : '');
  if (!abs || !/^https?:\/\//i.test(abs)) return '';
  try {
    const u = new URL(abs);
    // Anixart кладёт d/s/ip в URL Kodik; проверка подписи часто даёт Error code: ds
    // (IP Anixart ≠ egress к Kodik). Встроенный плеер тоже режет query — origin+pathname.
    if (isKodikEmbedHost(u.hostname)) {
      return `${u.origin}${u.pathname}`;
    }
    return u.href;
  } catch {
    return '';
  }
}

function upsertHeader(headers, name, value) {
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) { headers[k] = value; return; }
  }
  headers[name] = value;
}

/** config/toggles → iframeEmbedUrl (официальный веб-плеер Anixart). */
async function resolveAnixartIframeEmbedPrefix(ses) {
  if (cachedIframeEmbedUrl) {
    return {
      iframeEmbedUrl: cachedIframeEmbedUrl,
      appReferer: cachedAnixartAppReferer || DEFAULT_ANIXART_APP_ORIGIN,
    };
  }
  const { DEFAULT_BASE_URL, ANIXART_UA } = require('../lib/constants');
  const bases = [DEFAULT_BASE_URL, 'https://api.anixsekai.com', 'https://api.anixart.app'];
  for (const base of bases) {
    try {
      const url = `${String(base).replace(/\/$/, '')}/config/toggles?version_code=26090418&is_beta=true`;
      const res = await (ses ? ses.fetch(url, {
        headers: { 'User-Agent': ANIXART_UA, Accept: 'application/json' },
      }) : fetch(url, {
        headers: { 'User-Agent': ANIXART_UA, Accept: 'application/json' },
      }));
      if (!res.ok) continue;
      const j = await res.json();
      const embed = typeof j?.iframeEmbedUrl === 'string' ? j.iframeEmbedUrl.trim() : '';
      if (embed.startsWith('http')) {
        cachedIframeEmbedUrl = embed.endsWith('=') || embed.endsWith('?') || embed.endsWith('&')
          ? embed
          : `${embed}${embed.includes('?') ? '&url=' : '?url='}`;
        cachedAnixartAppReferer = typeof j?.baseUrl === 'string' && j.baseUrl.startsWith('http')
          ? (j.baseUrl.endsWith('/') ? j.baseUrl : `${j.baseUrl}/`)
          : DEFAULT_ANIXART_APP_ORIGIN;
        return { iframeEmbedUrl: cachedIframeEmbedUrl, appReferer: cachedAnixartAppReferer };
      }
    } catch (_) { /* next */ }
  }
  cachedIframeEmbedUrl = DEFAULT_IFRAME_EMBED_URL;
  cachedAnixartAppReferer = DEFAULT_ANIXART_APP_ORIGIN;
  return { iframeEmbedUrl: cachedIframeEmbedUrl, appReferer: cachedAnixartAppReferer };
}

function wrapEpisodeInAnixartIframe(episodeUrl, iframeEmbedUrl) {
  const prefix = iframeEmbedUrl || DEFAULT_IFRAME_EMBED_URL;
  return `${prefix}${encodeURIComponent(episodeUrl)}`;
}

let cachedSourceWebLogoDataUri = null;

/** data: HTML не может грузить file:// — встраиваем логотип base64. */
function sourceWebLogoSrc() {
  if (cachedSourceWebLogoDataUri != null) return cachedSourceWebLogoDataUri;
  const fs = require('fs');
  const candidates = [
    path.join(electronDir, '../public/logo/512x512.png'),
    path.join(electronDir, '../dist/logo/512x512.png'),
  ];
  for (const p of candidates) {
    try {
      if (!fs.existsSync(p)) continue;
      const buf = fs.readFileSync(p);
      cachedSourceWebLogoDataUri = `data:image/png;base64,${buf.toString('base64')}`;
      return cachedSourceWebLogoDataUri;
    } catch (_) { /* next */ }
  }
  cachedSourceWebLogoDataUri = '';
  return '';
}

/** Оболочка: titlebar как у встроенного плеера + селектор серий + iframe. */
function sourceWebPlayerShellHtml(episodeUrl, opts = {}) {
  const src = String(episodeUrl || '')
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
  const initialTitle = String(opts.title || 'AnixApp')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const logo = sourceWebLogoSrc()
    .replace(/&/g, '&amp;')
    .replace(/"/g, '&quot;');
  const isMac = process.platform === 'darwin';
  return `data:text/html;charset=utf-8,${encodeURIComponent(
    `<!DOCTYPE html><html class="${isMac ? 'platform-darwin' : ''}"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,maximum-scale=1,user-scalable=no">
<title>${initialTitle}</title>
<style>
*{box-sizing:border-box}
html,body{margin:0;padding:0;width:100%;height:100%;overflow:hidden;background:#0d0d0d;display:flex;flex-direction:column;font-family:system-ui,-apple-system,Segoe UI,sans-serif;color:#c8c8c8}
.player-titlebar{display:flex;align-items:center;justify-content:space-between;height:40px;min-height:40px;flex-shrink:0;background:#141414;border-bottom:1px solid #1f1f1f;-webkit-app-region:drag;user-select:none}
.player-titlebar__drag{display:flex;align-items:center;gap:8px;padding:0 12px;min-width:0;flex:1;-webkit-app-region:drag}
.player-titlebar__logo{width:22px;height:22px;border-radius:5px;background:#3a3a3a;overflow:hidden;flex-shrink:0;display:flex;align-items:center;justify-content:center}
.player-titlebar__logo img{width:100%;height:100%;object-fit:contain;display:block}
.player-titlebar__title{font-size:15px;font-weight:600;color:#9a9a9a;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:min(46vw,520px)}
.player-titlebar__mid{display:flex;align-items:center;gap:8px;padding:0 8px;-webkit-app-region:no-drag;flex-shrink:0}
.player-titlebar__ep{max-width:min(42vw,280px);height:28px;padding:0 8px;border:1px solid #333;border-radius:8px;background:#1c1c1c;color:#ddd;font:600 12px/1 system-ui,sans-serif;cursor:pointer}
.player-titlebar__ep:hover{border-color:#555;color:#fff}
.player-titlebar__ep:disabled{opacity:.55;cursor:wait}
.player-titlebar__ep:focus{outline:none;border-color:#c45c26}
.player-titlebar__controls{display:flex;align-items:stretch;-webkit-app-region:no-drag;flex-shrink:0}
.player-titlebar__btn{width:46px;height:40px;display:flex;align-items:center;justify-content:center;border:none;background:transparent;color:#9a9a9a;cursor:pointer}
.player-titlebar__btn:hover{background:#222;color:#eee}
.player-titlebar__btn--pin-active{color:#eee}
.player-titlebar__btn--close{position:relative}
.player-titlebar__btn--close:hover{background:#e81123;color:#fff}
.player-titlebar__btn--close::before,.player-titlebar__btn--close::after{content:'';position:absolute;width:13px;height:1px;background:currentColor;left:50%;top:50%;transform:translate(-50%,-50%) rotate(45deg)}
.player-titlebar__btn--close::after{transform:translate(-50%,-50%) rotate(-45deg)}
.platform-darwin .player-titlebar__btn--min,.platform-darwin .player-titlebar__btn--close{display:none}
.platform-darwin .player-titlebar__drag{padding-left:78px}
#anix-stage{flex:1 1 auto;position:relative;min-height:0;background:#000}
#anix-player{position:absolute;inset:0;width:100%;height:100%;border:0;display:block;background:#000}
</style></head><body>
<header class="player-titlebar" role="banner">
  <div class="player-titlebar__drag">
    <span class="player-titlebar__logo" aria-hidden="true">${logo ? `<img src="${logo}" alt="">` : ''}</span>
    <span class="player-titlebar__title" id="anix-title">${initialTitle}</span>
  </div>
  <div class="player-titlebar__mid">
    <label class="sr-only" for="anix-ep-select" style="position:absolute;width:1px;height:1px;overflow:hidden;clip:rect(0,0,0,0)">Серия</label>
    <select id="anix-ep-select" class="player-titlebar__ep" aria-label="Серия" hidden></select>
  </div>
  <div class="player-titlebar__controls">
    <button type="button" class="player-titlebar__btn player-titlebar__btn--pin" id="anix-pin" aria-label="Поверх всех окон" title="Поверх всех окон">
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/></svg>
    </button>
    <button type="button" class="player-titlebar__btn player-titlebar__btn--min" id="anix-min" aria-label="Свернуть" title="Свернуть">
      <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M5 12h14"/></svg>
    </button>
    <button type="button" class="player-titlebar__btn player-titlebar__btn--close" id="anix-close" aria-label="Закрыть" title="Закрыть"></button>
  </div>
</header>
<div id="anix-stage">
<iframe id="anix-player" src="${src}" allowfullscreen allow="autoplay; fullscreen; picture-in-picture; encrypted-media"></iframe>
</div>
<script>
(() => {
  const frame = document.getElementById('anix-player');
  const select = document.getElementById('anix-ep-select');
  const titleEl = document.getElementById('anix-title');
  const pinBtn = document.getElementById('anix-pin');
  let current = null;
  let busy = false;
  let pinned = false;

  function epLabel(ep) {
    const pos = Number(ep.position);
    const name = String(ep.name || '').trim();
    if (!name || /^\\d+$/.test(name) || new RegExp('^' + pos + '\\\\s*серия$', 'i').test(name) || /^\\d+\\s*серия$/i.test(name)) {
      return pos + ' серия';
    }
    return pos + '. ' + name;
  }

  async function pickEpisode(pos) {
    if (!window.anixSourceWeb || busy || pos === Number(current)) return;
    busy = true;
    select.disabled = true;
    try {
      const res = await window.anixSourceWeb.selectEpisode(pos);
      if (res && res.ok && res.url) {
        current = pos;
        frame.src = res.url;
        select.value = String(pos);
        if (res.title && titleEl) titleEl.textContent = res.title;
        document.title = res.title || ('Серия ' + pos);
      } else if (select) {
        select.value = String(current);
      }
    } finally {
      busy = false;
      select.disabled = false;
    }
  }

  function render(data) {
    if (!select || !data) return;
    const eps = Array.isArray(data.episodes) ? data.episodes : [];
    current = data.current;
    select.innerHTML = '';
    for (const ep of eps) {
      const opt = document.createElement('option');
      opt.value = String(ep.position);
      opt.textContent = epLabel(ep);
      if (Number(ep.position) === Number(current)) opt.selected = true;
      select.appendChild(opt);
    }
    select.hidden = eps.length < 2;
    if (data.title && titleEl) titleEl.textContent = data.title;
  }

  select?.addEventListener('change', () => {
    const pos = Number(select.value);
    if (Number.isFinite(pos)) void pickEpisode(pos);
  });

  document.getElementById('anix-min')?.addEventListener('click', () => window.anixSourceWeb?.minimize?.());
  document.getElementById('anix-close')?.addEventListener('click', () => window.anixSourceWeb?.close?.());
  pinBtn?.addEventListener('click', async () => {
    if (!window.anixSourceWeb?.toggleAlwaysOnTop) return;
    pinned = !!(await window.anixSourceWeb.toggleAlwaysOnTop());
    pinBtn.classList.toggle('player-titlebar__btn--pin-active', pinned);
    pinBtn.title = pinned ? 'Открепить окно' : 'Поверх всех окон';
  });

  if (window.anixSourceWeb?.onPlaylist) window.anixSourceWeb.onPlaylist(render);
})();
</script>
</body></html>`,
  )}`;
}

const SOURCE_WEB_FILL_CSS = `
html, body {
  margin: 0 !important;
  padding: 0 !important;
  width: 100% !important;
  height: 100% !important;
  overflow: hidden !important;
  background: #0d0d0d !important;
}
#anix-player, #anix-stage iframe, #anix-stage video {
  max-width: 100% !important;
  max-height: 100% !important;
}
`;

let cachedAdblockPatterns = null;

function loadSourceWebAdblockPatterns() {
  if (cachedAdblockPatterns) return cachedAdblockPatterns;
  const fs = require('fs');
  const candidates = [
    path.join(electronDir, 'assets', 'adblock.txt'),
    path.join(__dirname, '..', 'assets', 'adblock.txt'),
  ];
  const raw = [];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) {
        raw.push(...fs.readFileSync(p, 'utf8').split(/\r?\n/));
        break;
      }
    } catch (_) { /* next */ }
  }
  // Слишком короткие/широкие паттерны из APK ломают легитимные хосты.
  const skip = new Set(['in.net', 'gstatic.com', 'dev.null', '']);
  cachedAdblockPatterns = [...new Set(
    raw.map((l) => l.trim().toLowerCase()).filter((l) => l && !l.startsWith('#') && !skip.has(l) && l.length >= 5),
  )];
  return cachedAdblockPatterns;
}

function isSourceWebAdUrl(url) {
  const patterns = loadSourceWebAdblockPatterns();
  if (!patterns.length) return false;
  let host = '';
  let href = '';
  try {
    const u = new URL(url);
    host = u.hostname.toLowerCase();
    href = u.href.toLowerCase();
  } catch {
    href = String(url || '').toLowerCase();
  }
  if (/adfox|adsystem|adservice|googlesyndication|doubleclick|imasdk|vast[\./]|\/ads?[\/.?]/.test(href)) {
    if (!/kodikplayer\.com|kodik\.info|aniqit\.com|kodik-cdn|kodik-storage|solodcdn|anixmirai|anixart/i.test(host)) {
      return true;
    }
  }
  for (const p of patterns) {
    if (host === p || host.endsWith(`.${p}`)) return true;
    if (href.includes(p)) return true;
  }
  return false;
}

/** Как WebPlayerActivity.shouldInterceptRequest + adblock.txt. */
function installSourceWebAdblock(ses) {
  loadSourceWebAdblockPatterns();
  ses.webRequest.onBeforeRequest({ urls: ['http://*/*', 'https://*/*'] }, (details, callback) => {
    if (isSourceWebAdUrl(details.url)) {
      callback({ cancel: true });
      return;
    }
    callback({});
  });
}

/** Заголовки как у Android WebView: Referer anixmirai для Kodik. */
function installAnixartWebPlayerHeaders(ses, appReferer) {
  const { BROWSER_UA } = require('../cdn-proxy');
  const ref = appReferer || DEFAULT_ANIXART_APP_ORIGIN;
  const urls = [
    '*://anixmirai.com/*', '*://*.anixmirai.com/*',
    '*://anixart-app.com/*', '*://*.anixart-app.com/*',
    '*://kodikplayer.com/*', '*://*.kodikplayer.com/*',
    '*://kodik.info/*', '*://*.kodik.info/*',
    '*://aniqit.com/*', '*://*.aniqit.com/*',
    '*://kodik-cdn.com/*', '*://*.kodik-cdn.com/*',
    '*://kodik-storage.com/*', '*://*.kodik-storage.com/*',
    '*://solodcdn.com/*', '*://*.solodcdn.com/*',
  ];
  ses.webRequest.onBeforeSendHeaders({ urls }, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    let host = '';
    try { host = new URL(details.url).hostname; } catch (_) { /* ignore */ }
    const isWrapper = /anixmirai|anixart-app/i.test(host);
    upsertHeader(requestHeaders, 'Referer', isWrapper ? ref : 'https://anixmirai.com/');
    if (isWrapper) upsertHeader(requestHeaders, 'Origin', ref.replace(/\/$/, ''));
    upsertHeader(requestHeaders, 'User-Agent', BROWSER_UA);
    callback({ requestHeaders });
  });
}

/** Вписать Kodik-кадр в #anix-stage (полоса серий сверху не перекрывается). */
function installSourceWebFit(win) {
  const { webFrameMain } = require('electron');
  const fillScript = `(() => {
    try {
      const css = ${JSON.stringify(SOURCE_WEB_FILL_CSS)};
      if (!document.getElementById('anix-source-web-fit')) {
        const s = document.createElement('style');
        s.id = 'anix-source-web-fit';
        s.textContent = css;
        (document.head || document.documentElement).appendChild(s);
      }
      // Оболочка с titlebar — не трогаем; только кадр Kodik внутри iframe.
      if (!document.querySelector('.player-titlebar')) {
        document.documentElement.style.overflow = 'hidden';
        if (document.body) {
          document.body.style.margin = '0';
          document.body.style.overflow = 'hidden';
          document.body.style.height = '100%';
        }
        const root = document.getElementById('player')
          || document.querySelector('.player, .app-player, [class*="player-container"]');
        if (root && root.style) {
          root.style.width = '100%';
          root.style.height = '100%';
          root.style.maxHeight = '100%';
        }
      }
    } catch (_) {}
  })();`;

  const fillFrame = async (frame) => {
    if (!frame || frame.isDestroyed?.()) return;
    try {
      await frame.executeJavaScript(fillScript, true);
    } catch (_) { /* ignore */ }
  };

  const onMain = () => {
    try { void win.webContents.insertCSS(SOURCE_WEB_FILL_CSS); } catch (_) { /* ignore */ }
    try {
      const main = win.webContents.mainFrame;
      if (main) void fillFrame(main);
      else void win.webContents.executeJavaScript(fillScript, true);
    } catch (_) {
      void win.webContents.executeJavaScript(fillScript, true).catch(() => {});
    }
  };

  win.webContents.on('did-finish-load', onMain);
  win.webContents.on('dom-ready', onMain);
  win.webContents.on('did-frame-finish-load', (_event, isMainFrame, frameProcessId, frameRoutingId) => {
    if (isMainFrame) {
      onMain();
      return;
    }
    try {
      const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
      void fillFrame(frame);
    } catch (_) { /* ignore */ }
  });
}

async function listSourceWebEpisodes(releaseId, dubberId, sourceId) {
  if (releaseId == null || sourceId == null || dubberId == null || dubberId === '') return [];
  try {
    const { getAnixart } = require('../services/anix-client');
    const client = getAnixart();
    const data = await client.endpoints.release.getEpisodes(
      Number(releaseId),
      Number(dubberId),
      Number(sourceId),
    );
    const list = Array.isArray(data?.episodes) ? data.episodes : [];
    return list
      .map((e) => {
        const position = Number(e?.position);
        if (!Number.isFinite(position)) return null;
        return {
          position,
          name: typeof e?.name === 'string' ? e.name : '',
          url: normalizeSourceEmbedUrl(e?.url || ''),
        };
      })
      .filter(Boolean)
      .sort((a, b) => a.position - b.position);
  } catch (_) {
    return [];
  }
}

function sourceWebEpisodeLabel(params, position, episodeName) {
  const { episodePlaylistTitle } = require('../lib/external-playlist');
  return episodePlaylistTitle(params?.title, position, episodeName);
}

let sourceWebIpcRegistered = false;

function registerSourceWebIpc() {
  if (sourceWebIpcRegistered) return;
  sourceWebIpcRegistered = true;
  ipcMain.handle('source-web:selectEpisode', async (event, position) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    const ctx = win && !win.isDestroyed() ? win._anixSourceWeb : null;
    if (!ctx) return { ok: false, reason: 'no-context' };
    const ep = Number(position);
    if (!Number.isFinite(ep)) return { ok: false, reason: 'bad-episode' };

    let embed = '';
    const known = (ctx.episodes || []).find((e) => Number(e.position) === ep);
    if (known?.url) embed = known.url;
    if (!embed && ctx.ses) {
      embed = await resolveSourceEmbedInSession(ctx.ses, ctx.releaseId, ctx.sourceId, ep).catch(() => '');
    }
    if (!embed) {
      embed = await nodeDirectEmbedHint(ctx.releaseId, ctx.sourceId, ep);
    }
    if (!embed) return { ok: false, reason: 'no-url' };

    const preferred = ctx.preferredQuality || loadRememberedKodikQuality();
    embed = applyKodikQuality(embed, preferred);
    if (preferred) rememberKodikQuality(preferred, ctx);

    ctx.currentEp = ep;
    if (known) known.url = embed;
    else ctx.episodes.push({ position: ep, name: '', url: embed });
    if (state.currentPlayerPlayback) {
      state.currentPlayerPlayback.ep = String(ep);
      state.currentPlayerPlayback.sourceEmbedUrl = embed;
    }
    const title = sourceWebEpisodeLabel(ctx.params, ep, known?.name);
    try { win.setTitle(title); } catch (_) { /* ignore */ }
    return { ok: true, url: embed, title, position: ep };
  });
}

/**
 * Kodik при adblock блокирует 720/1080 (badUser). URL от Anixart всегда .../720p —
 * нельзя брать качество из pathname (перетирает выбор). Читаем data-quality из UI.
 */
const KODIK_QUALITY_HOOK_JS = `(() => {
  if (window.__anixQualityHook) return;
  window.__anixQualityHook = true;
  const want = String(window.__anixWantQuality || '').toLowerCase();
  const norm = (s) => {
    const m = String(s || '').toLowerCase().match(/(\\d{3,4})\\s*p?/);
    return m ? (m[1] + 'p') : '';
  };
  const send = (raw) => {
    const q = norm(raw);
    if (q) console.info('[anix-kodik-quality]' + q);
  };
  const unlock = () => {
    try {
      document.querySelectorAll('.fp-quality-dropdown div.blocked').forEach((el) => {
        el.classList.remove('blocked');
        el.removeAttribute('title');
      });
    } catch (_) {}
  };
  const readUi = () => {
    unlock();
    const cur = document.querySelector(
      '.fp-quality-dropdown div.current[data-quality], .fp-quality-dropdown .current[data-quality], .fp-quality-dropdown div.current'
    );
    if (cur) {
      const q = norm(cur.getAttribute('data-quality') || cur.textContent);
      if (q) return q;
    }
    return '';
  };
  const applyWant = () => {
    if (!want) return;
    unlock();
    const n = parseInt(want, 10);
    if (!Number.isFinite(n)) return;
    const el = document.querySelector('.fp-quality-dropdown div[data-quality="' + n + '"]');
    if (!el) return;
    if (el.classList.contains('current')) {
      send(want);
      return;
    }
    try { el.click(); } catch (_) {}
    send(want);
  };
  document.addEventListener('click', (e) => {
    const t = e.target && e.target.closest
      ? e.target.closest('.fp-quality-dropdown div[data-quality], [data-quality]')
      : null;
    if (!t) return;
    const q = norm(t.getAttribute('data-quality') || t.textContent);
    if (q) send(q);
  }, true);
  const mo = new MutationObserver(() => {
    unlock();
    const q = readUi();
    if (q) send(q);
  });
  try {
    mo.observe(document.documentElement, {
      subtree: true,
      childList: true,
      attributes: true,
      attributeFilter: ['class', 'data-quality'],
    });
  } catch (_) {}
  unlock();
  setTimeout(applyWant, 400);
  setTimeout(applyWant, 1200);
  setTimeout(applyWant, 2500);
  setTimeout(() => { const q = readUi(); if (q) send(q); }, 800);
})();`;

function kodikQualityHookWithWant(quality) {
  const q = normalizeKodikQualityToken(quality);
  return `window.__anixWantQuality=${JSON.stringify(q)};${KODIK_QUALITY_HOOK_JS}`;
}

/** Когда в Kodik меняют качество — UI data-quality (не pathname Anixart). */
function installSourceWebQualityTracker(win) {
  const { webFrameMain } = require('electron');
  win.webContents.on('console-message', (...args) => {
    let message = '';
    const first = args[0];
    if (first && typeof first === 'object' && first.message != null && args.length === 1) {
      message = String(first.message ?? '');
    } else {
      message = String(args[2] ?? '');
    }
    const m = message.match(/\[anix-kodik-quality\](\d{3,4}p)/i);
    if (!m || !win._anixSourceWeb) return;
    rememberKodikQuality(m[1], win._anixSourceWeb);
  });
  win.webContents.on('did-frame-finish-load', async (_event, isMainFrame, frameProcessId, frameRoutingId) => {
    if (isMainFrame || win.isDestroyed()) return;
    try {
      const frame = webFrameMain.fromId(frameProcessId, frameRoutingId);
      if (!frame || frame.isDestroyed?.()) return;
      const frameUrl = String(frame.url || '');
      if (!isKodikEmbedHost((() => { try { return new URL(frameUrl).hostname; } catch { return ''; } })())) return;
      const want = win._anixSourceWeb?.preferredQuality || loadRememberedKodikQuality();
      await frame.executeJavaScript(kodikQualityHookWithWant(want), true);
    } catch (_) { /* ignore */ }
  });
}

function installSourceWebDevtoolsShortcut(win) {
  win.webContents.on('before-input-event', (event, input) => {
    if (input.type !== 'keyDown' || win.isDestroyed()) return;
    const key = String(input.key || '').toLowerCase();
    const ctrl = !!(input.control || input.meta);
    const isCtrlI = ctrl && !input.alt && key === 'i';
    const isF12 = key === 'f12';
    if (!isCtrlI && !isF12) return;
    event.preventDefault();
    try {
      if (win.webContents.isDevToolsOpened()) win.webContents.closeDevTools();
      else win.webContents.openDevTools({ mode: 'detach' });
    } catch (_) { /* ignore */ }
  });
}

async function prepareSourceWebSession() {
  const { session } = require('electron');
  const { BROWSER_UA } = require('../cdn-proxy');
  // persist — чтобы Kodik сохранял качество в localStorage между открытиями.
  const partition = 'persist:anix-source-web';
  const ses = session.fromPartition(partition);
  try {
    ses.setUserAgent(BROWSER_UA);
  } catch (_) { /* ignore */ }
  loadRememberedKodikQuality();
  return { partition, ses };
}

/** episode/target через ту же session. Только api-s — не backup (чужой ip=). */
async function resolveSourceEmbedInSession(ses, releaseId, sourceId, ep) {
  const config = require('../lib/config-store');
  const { DEFAULT_BASE_URL, ANIXART_UA } = require('../lib/constants');
  const { token } = config.loadConfig();
  if (!token) return '';

  const base = String(DEFAULT_BASE_URL || '').replace(/\/$/, '');
  const url = new URL(`${base}/episode/target/${Number(releaseId)}/${Number(sourceId)}/${Number(ep)}`);
  url.searchParams.set('token', token);

  const res = await ses.fetch(url.href, {
    method: 'GET',
    headers: {
      'User-Agent': ANIXART_UA,
      Accept: 'application/json',
    },
  });
  if (!res.ok) throw new Error(`episode/target HTTP ${res.status}`);
  const data = await res.json();
  return normalizeSourceEmbedUrl(data?.episode?.url || '');
}

async function nodeDirectEmbedHint(releaseId, sourceId, ep) {
  try {
    const { createAnixClient } = require('../services/anix-client');
    const configStore = require('../lib/config-store');
    const { DEFAULT_BASE_URL } = require('../lib/constants');
    const { token } = configStore.loadConfig();
    const client = createAnixClient({
      baseUrl: DEFAULT_BASE_URL,
      token: token || undefined,
      backupFailover: false,
    });
    const data = await client.endpoints.release.getEpisode(
      Number(releaseId),
      Number(sourceId),
      Number(ep),
    );
    return normalizeSourceEmbedUrl(data?.episode?.url || '');
  } catch (_) {
    return '';
  }
}

function sourceWebLoadingHtml(message) {
  const text = String(message || 'Загрузка…');
  return `data:text/html;charset=utf-8,${encodeURIComponent(
    `<!DOCTYPE html><html><head><meta charset="utf-8"><title>AnixApp</title></head>
<body style="margin:0;background:#0d0d0d;color:#ccc;font:15px system-ui;display:flex;align-items:center;justify-content:center;height:100vh">
<p>${text.replace(/</g, '&lt;')}</p></body></html>`,
  )}`;
}

/** Как WebPlayerActivity: anixmirai.com/iframe?url= + episodeUrl. */
function loadAnixartWebPlayer(win, playerUrl, appReferer) {
  const { BROWSER_UA } = require('../cdn-proxy');
  try {
    win.webContents.setUserAgent(BROWSER_UA);
  } catch (_) { /* ignore */ }
  return win.loadURL(playerUrl, {
    httpReferrer: appReferer || DEFAULT_ANIXART_APP_ORIGIN,
    userAgent: BROWSER_UA,
  });
}

function isSourceEmbedPlayerWindow(win) {
  if (!win || win.isDestroyed()) return false;
  try {
    const u = win.webContents.getURL() || '';
    if (!u || u === 'about:blank') return !!state.currentPlayerPlayback?.sourceEmbedUrl;
    return !/\/player\.html(?:\?|$)/i.test(u) && /^https?:\/\//i.test(u);
  } catch {
    return !!state.currentPlayerPlayback?.sourceEmbedUrl;
  }
}

function destroyPlayerWindow() {
  const win = state.playerWindowRef;
  state.playerWindowRef = null;
  state.currentPlayerPlayback = null;
  if (win && !win.isDestroyed()) {
    try { win.destroy(); } catch (_) { /* ignore */ }
  }
}

function attachPlayerWindowLifecycle(playerWindow, { isSourceWeb, sourceEmbedUrl, params }) {
  state.playerWindowRef = playerWindow;
  state.currentPlayerPlayback = {
    releaseId: String(params.releaseId ?? ''),
    sourceId: String(params.sourceId ?? ''),
    ep: String(params.ep ?? ''),
    dubberId: String(params.dubberId ?? ''),
    ...(params.externalUrl ? { externalUrl: String(params.externalUrl) } : {}),
    ...(isSourceWeb && sourceEmbedUrl ? { sourceEmbedUrl } : {}),
  };
  playerWindow.on('closed', () => {
    state.playerWindowRef = null;
    state.currentPlayerPlayback = null;
    try {
      require('../lib/download-queue').setStreamingHold(false);
    } catch (_) { /* ignore */ }
    if (discordRpc && config.getDiscordRpcEnabled()) {
      discordRpc.focusWindow('main');
      if (config.getDiscordRpcShowBrowsing()) {
        discordRpc.setBrowsing(state.discordSessionStart);
      } else {
        discord.setDiscordGenericInApp();
      }
    }
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('player:closed');
    }
  });
  playerWindow.on('focus', () => { if (discordRpc) discordRpc.focusWindow('player'); });
  if (!isSourceWeb) {
    playerWindow.on('enter-full-screen', () => playerWindow.webContents.send('player:fullscreen', true));
    playerWindow.on('leave-full-screen', () => playerWindow.webContents.send('player:fullscreen', false));
  }
}

async function createSourceWebPlayerWindow(params) {
  registerSourceWebIpc();
  const iconPath = getIconPath();
  const hintUrl = normalizeSourceEmbedUrl(params.sourceEmbedUrl);
  const currentEp = Number(params.ep);

  // Параллельно: session, episode URL, список серий, iframeEmbedUrl.
  const sessionP = prepareSourceWebSession();
  const nodeUrlP = hintUrl
    ? Promise.resolve(hintUrl)
    : nodeDirectEmbedHint(params.releaseId, params.sourceId, params.ep);
  const iframeCfgP = resolveAnixartIframeEmbedPrefix(null);
  const episodesP = listSourceWebEpisodes(params.releaseId, params.dubberId, params.sourceId);

  const prepared = await sessionP;

  const playerWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 280,
    minHeight: 158,
    frame: false,
    titleBarStyle: 'hidden',
    ...macTitleBarOptions(),
    title: String(params.title || 'AnixApp — Веб-плеер'),
    backgroundColor: '#0d0d0d',
    show: true,
    webPreferences: {
      preload: path.join(electronDir, 'preload-source-web.js'),
      partition: prepared.partition,
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
    ...(iconPath && { icon: iconPath }),
  });
  setupMacWindow(playerWindow);
  try { playerWindow.setMenu(null); } catch (_) { /* ignore */ }

  attachPlayerWindowLifecycle(playerWindow, {
    isSourceWeb: true,
    sourceEmbedUrl: hintUrl,
    params,
  });

  try {
    playerWindow.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  } catch (_) { /* ignore */ }

  void playerWindow.loadURL(sourceWebLoadingHtml('Загрузка…')).catch(() => {});

  const sessionUrlP = resolveSourceEmbedInSession(
    prepared.ses,
    params.releaseId,
    params.sourceId,
    params.ep,
  ).catch(() => '');

  const [fromSes, fromNode, iframeCfg, episodes] = await Promise.all([
    sessionUrlP,
    nodeUrlP,
    iframeCfgP,
    episodesP,
  ]);
  let embed = fromSes || fromNode || '';
  if (!embed) {
    const fromList = episodes.find((e) => Number(e.position) === currentEp);
    if (fromList?.url) embed = fromList.url;
  }

  if (!embed) {
    await playerWindow.loadURL(sourceWebLoadingHtml(
      'Не удалось получить ссылку на плеер источника.',
    )).catch(() => {});
    return;
  }

  // Дополнить список текущей серией, если getEpisodes пустой/без url.
  const episodeList = episodes.length
    ? episodes.map((e) => (
      Number(e.position) === currentEp && !e.url ? { ...e, url: embed } : e
    ))
    : [{ position: currentEp, name: '', url: embed }];

  const savedQuality = loadRememberedKodikQuality();
  const initialQuality = savedQuality || parseKodikQuality(embed);
  if (initialQuality) {
    embed = applyKodikQuality(embed, initialQuality);
    rememberKodikQuality(initialQuality, null);
  }

  playerWindow._anixSourceWeb = {
    ses: prepared.ses,
    releaseId: params.releaseId,
    sourceId: params.sourceId,
    dubberId: params.dubberId,
    params,
    episodes: episodeList,
    currentEp: Number.isFinite(currentEp) ? currentEp : episodeList[0]?.position,
    preferredQuality: initialQuality || '',
  };

  installSourceWebAdblock(prepared.ses);
  installAnixartWebPlayerHeaders(prepared.ses, iframeCfg.appReferer);
  installSourceWebFit(playerWindow);
  installSourceWebQualityTracker(playerWindow);
  installSourceWebDevtoolsShortcut(playerWindow);
  const initialTitle = sourceWebEpisodeLabel(
    params,
    Number.isFinite(currentEp) ? currentEp : episodeList[0]?.position,
    episodeList.find((e) => Number(e.position) === currentEp)?.name,
  );
  const playerUrl = sourceWebPlayerShellHtml(embed, { title: initialTitle });

  if (state.currentPlayerPlayback) {
    state.currentPlayerPlayback.sourceEmbedUrl = embed;
  }
  syncDownloadHoldForPlayback(params);
  try {
    logger?.info?.('player', 'source web shell', {
      episodePath: (() => {
        try {
          const u = new URL(embed);
          return `${u.host}${u.pathname}`;
        } catch {
          return '';
        }
      })(),
      episodes: episodeList.length,
      adblockRules: loadSourceWebAdblockPatterns().length,
    });
  } catch (_) { /* ignore */ }

  const pushPlaylist = () => {
    if (playerWindow.isDestroyed()) return;
    try {
      const title = sourceWebEpisodeLabel(
        params,
        playerWindow._anixSourceWeb.currentEp,
        episodeList.find((e) => Number(e.position) === Number(playerWindow._anixSourceWeb.currentEp))?.name,
      );
      playerWindow.webContents.send('source-web:playlist', {
        current: playerWindow._anixSourceWeb.currentEp,
        title,
        episodes: episodeList.map((e) => ({ position: e.position, name: e.name || '' })),
      });
      playerWindow.setTitle(title);
    } catch (_) { /* ignore */ }
  };

  await loadAnixartWebPlayer(playerWindow, playerUrl, iframeCfg.appReferer).catch(() => {});
  playerWindow.webContents.once('did-finish-load', () => {
    pushPlaylist();
    setTimeout(pushPlaylist, 120);
  });
  setTimeout(pushPlaylist, 80);
}

async function createPlayerWindow(params) {
  const iconPath = getIconPath();
  const wantsSourceWeb = params.sourceWeb === true || !!normalizeSourceEmbedUrl(params.sourceEmbedUrl);
  if (wantsSourceWeb) {
    await createSourceWebPlayerWindow(params);
    return;
  }

  const playerWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 280,
    minHeight: 158,
    frame: false,
    titleBarStyle: 'hidden',
    ...macTitleBarOptions(),
    title: 'AnixApp — Просмотр',
    backgroundColor: '#0d0d0d',
    show: false,
    webPreferences: {
      preload: path.join(electronDir, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      backgroundThrottling: false,
    },
    ...(iconPath && { icon: iconPath }),
  });
  setupMacWindow(playerWindow);
  attachPlayerWindowLifecycle(playerWindow, { isSourceWeb: false, sourceEmbedUrl: '', params });
  playerWindow.once('ready-to-show', () => {
    applyUiZoom(config.getUiZoom());
    playerWindow.show();
  });

  const queryParams = {
    releaseId: params.releaseId ?? '',
    sourceId: params.sourceId ?? '',
    ep: params.ep ?? '',
    title: params.title ?? '',
    sourceName: params.sourceName ?? '',
    ...(params.dubberName != null && params.dubberName !== '' ? { dubberName: params.dubberName } : {}),
    ...(params.dubberId != null && params.dubberId !== '' ? { dubberId: params.dubberId } : {}),
    ...(params.lobbyIdle ? { lobbyIdle: '1' } : {}),
    ...(typeof params.currentTime === 'number' && Number.isFinite(params.currentTime) && params.currentTime > 0
      ? { t: String(params.currentTime) }
      : {}),
    ...(params.paused != null ? { paused: params.paused ? '1' : '0' } : {}),
    ...(params.applyRoomPlayback ? { applyRoomPlayback: '1' } : {}),
  };
  const hasLocalFile = typeof params.localFile === 'string' && params.localFile.trim() !== '';
  const hasExternalUrl = typeof params.externalUrl === 'string' && params.externalUrl.trim() !== '';
  if (hasLocalFile) queryParams.playbackMode = 'local';
  if (hasExternalUrl) queryParams.playbackMode = 'external';
  if (isDev) {
    const q = new URLSearchParams(queryParams).toString();
    playerWindow.loadURL(`${getDevServerOrigin()}/player.html?${q}`);
  } else {
    const playerPath = path.join(electronDir, '../dist/player.html');
    playerWindow.loadFile(playerPath, { query: queryParams });
  }
  if (hasLocalFile) {
    playerWindow.webContents.once('did-finish-load', () => {
      if (state.playerWindowRef === playerWindow && !playerWindow.isDestroyed()) {
        playerWindow.webContents.send('player:changeContent', {
          releaseId: queryParams.releaseId,
          sourceId: queryParams.sourceId,
          ep: queryParams.ep,
          title: queryParams.title,
          sourceName: queryParams.sourceName,
          dubberName: queryParams.dubberName || '',
          dubberId: queryParams.dubberId || '',
          localFile: String(params.localFile),
          local: true,
        });
      }
    });
  } else if (hasExternalUrl) {
    playerWindow.webContents.once('did-finish-load', () => {
      if (state.playerWindowRef === playerWindow && !playerWindow.isDestroyed()) {
        playerWindow.webContents.send('player:changeContent', {
          title: queryParams.title,
          sourceName: queryParams.sourceName || 'FetchAApp',
          externalUrl: String(params.externalUrl),
          referer: String(params.referer || ''),
          pageUrl: String(params.pageUrl || ''),
          cookies: String(params.cookies || ''),
        });
      }
    });
  } else if (params.applyRoomPlayback || params.paused != null || params.currentTime != null) {
    playerWindow.webContents.once('did-finish-load', () => {
      if (state.playerWindowRef === playerWindow && !playerWindow.isDestroyed()) {
        playerWindow.webContents.send('player:applySync', {
          ...params,
          action: 'seek',
        });
      }
    });
  }
  syncDownloadHoldForPlayback(params);
}

function isSamePlaybackContent(a, b) {
  if (!a || !b) return false;
  if (a.sourceEmbedUrl || b.sourceEmbedUrl) return a.sourceEmbedUrl === b.sourceEmbedUrl;
  if (a.externalUrl || b.externalUrl) return a.externalUrl === b.externalUrl;
  return a.releaseId === b.releaseId && a.sourceId === b.sourceId && a.ep === b.ep && (a.dubberId || '') === (b.dubberId || '');
}

/** Онлайн-стрим → пауза загрузок; локальный файл → можно качать. */
function syncDownloadHoldForPlayback(params) {
  try {
    const local = typeof params?.localFile === 'string' && params.localFile.trim() !== '';
    require('../lib/download-queue').setStreamingHold(!local);
  } catch (e) {
    console.warn('syncDownloadHoldForPlayback:', e?.message || e);
  }
}

function waitPlayerClosed() {
  return new Promise((resolve) => {
    if (!state.playerWindowRef || state.playerWindowRef.isDestroyed()) {
      resolve();
      return;
    }
    state.playerWindowRef.once('closed', resolve);
    state.playerWindowRef.close();
  });
}

function focusPlayerWindow() {
  const win = state.playerWindowRef;
  if (!win || win.isDestroyed()) return;
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

async function openPlayerWithParams(params) {
  if (!params || typeof params !== 'object') return;
  const applyRoomPlayback = !!params.applyRoomPlayback;
  const sourceEmbedUrl = normalizeSourceEmbedUrl(params.sourceEmbedUrl);
  const wantsSourceWeb = params.sourceWeb === true || params.webPlayer === true || !!sourceEmbedUrl;
  const safe = {
    releaseId: String(params.releaseId ?? ''),
    sourceId: String(params.sourceId ?? ''),
    ep: String(params.ep ?? ''),
    title: String(params.title ?? ''),
    sourceName: String(params.sourceName ?? ''),
    ...(params.dubberName != null && params.dubberName !== '' ? { dubberName: String(params.dubberName) } : {}),
    ...(params.dubberId != null && params.dubberId !== '' ? { dubberId: String(params.dubberId) } : {}),
    ...(params.localFile ? { localFile: String(params.localFile) } : {}),
    ...(params.externalUrl ? { externalUrl: String(params.externalUrl) } : {}),
    ...(params.referer ? { referer: String(params.referer) } : {}),
    ...(params.pageUrl ? { pageUrl: String(params.pageUrl) } : {}),
    ...(params.cookies ? { cookies: String(params.cookies) } : {}),
    ...(params.lobbyIdle ? { lobbyIdle: true } : {}),
    ...(typeof params.currentTime === 'number' ? { currentTime: params.currentTime } : {}),
    ...(params.paused != null ? { paused: !!params.paused } : {}),
    ...(applyRoomPlayback ? { applyRoomPlayback: true } : {}),
    ...(wantsSourceWeb ? { sourceWeb: true } : {}),
    ...(sourceEmbedUrl ? { sourceEmbedUrl } : {}),
  };
  const existing = state.playerWindowRef && !state.playerWindowRef.isDestroyed()
    ? state.playerWindowRef
    : null;
  const existingIsSource = existing ? isSourceEmbedPlayerWindow(existing) : false;

  // Веб-плеер источника — top-level Kodik; URL берём в той же Chromium-session.
  if (wantsSourceWeb) {
    if (existing) destroyPlayerWindow();
    await createPlayerWindow(safe);
    return;
  }

  if (existing) {
    // Со встроенного окна источника нельзя слать player:changeContent — пересоздаём.
    if (existingIsSource) {
      destroyPlayerWindow();
      await createPlayerWindow(safe);
      return;
    }
    if (safe.externalUrl) {
      const incomingContent = { releaseId: '', sourceId: '', ep: '', dubberId: '', externalUrl: safe.externalUrl };
      if (isSamePlaybackContent(state.currentPlayerPlayback, incomingContent)) {
        focusPlayerWindow();
        return;
      }
      state.currentPlayerPlayback = incomingContent;
      state.playerWindowRef.webContents.send('player:changeContent', {
        title: safe.title,
        sourceName: safe.sourceName || 'FetchAApp',
        externalUrl: safe.externalUrl,
        referer: safe.referer || '',
        pageUrl: safe.pageUrl || '',
        cookies: safe.cookies || '',
      });
      syncDownloadHoldForPlayback(safe);
      focusPlayerWindow();
      return;
    }
    if (safe.releaseId) {
      const incomingContent = {
        releaseId: safe.releaseId,
        sourceId: safe.sourceId,
        ep: safe.ep,
        dubberId: safe.dubberId || '',
      };
      if (!applyRoomPlayback && isSamePlaybackContent(state.currentPlayerPlayback, incomingContent)) {
        focusPlayerWindow();
        return;
      }
      state.currentPlayerPlayback = incomingContent;
      state.playerWindowRef.webContents.send('player:changeContent', {
        ...safe,
        local: !applyRoomPlayback,
      });
      syncDownloadHoldForPlayback(safe);
    }
    focusPlayerWindow();
    return;
  }
  await createPlayerWindow(safe);
}

function openExternalPlayback(payload) {
  const { parsePlayPayload, setExternalPlayContext } = require('../lib/external-play');
  const parsed = parsePlayPayload(payload);
  if (!parsed) return false;
  try {
    const { addExtraVideoHosts, hostsFromUrl, persistExtraVideoHosts } = require('../lib/extra-video-hosts');
    addExtraVideoHosts(hostsFromUrl(parsed.url));
    persistExtraVideoHosts();
  } catch { /* ignore */ }
  setExternalPlayContext({
    videoUrl: parsed.url,
    referer: parsed.referer || parsed.pageUrl,
    cookies: parsed.cookies,
  });
  openPlayerWithParams({
    releaseId: '',
    sourceId: '',
    ep: '1',
    title: parsed.title || 'FetchAApp',
    sourceName: 'FetchAApp',
    externalUrl: parsed.url,
    referer: parsed.referer || parsed.pageUrl,
    pageUrl: parsed.pageUrl,
    cookies: parsed.cookies,
  });
  return true;
}

ipcMain.handle('player:openWindow', async (_, params) => {
  await openPlayerWithParams(params);
});

ipcMain.on('player:syncState', async (_, playback) => {
  if (!playback || typeof playback !== 'object') return;
  const params = {
    releaseId: String(playback.releaseId ?? ''),
    sourceId: String(playback.sourceId ?? ''),
    ep: String(playback.ep ?? ''),
    title: String(playback.title ?? ''),
    sourceName: String(playback.sourceName ?? ''),
    ...(playback.dubberId != null && playback.dubberId !== '' ? { dubberId: String(playback.dubberId) } : {}),
    paused: !!playback.paused,
    currentTime: typeof playback.currentTime === 'number' ? playback.currentTime : 0,
    ...(playback.action ? { action: String(playback.action) } : {}),
  };
  const incomingContent = { releaseId: params.releaseId, sourceId: params.sourceId, ep: params.ep, dubberId: params.dubberId || '' };
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
    const sameContent = isSamePlaybackContent(state.currentPlayerPlayback, incomingContent);
    if (sameContent) {
      // Same content — just seek/pause sync
      state.playerWindowRef.webContents.send('player:applySync', params);
    } else {
      // Different content — change dynamically without closing/reopening
      state.currentPlayerPlayback = incomingContent;
      state.playerWindowRef.webContents.send('player:changeContent', {
        ...params,
        local: false,
      });
      syncDownloadHoldForPlayback(params);
    }
    return;
  }
  // No player window — create one
  await createPlayerWindow(params);
});

// ── Upscale settings sync: Main window → Player window ──
ipcMain.on('upscale:applySettings', (_, settings) => {
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
    state.playerWindowRef.webContents.send('upscale:settingsChanged', settings);
  }
});

// Hotkeys / seek settings: apply to player window immediately
ipcMain.on('player:applyHotkeys', (_, hotkeys) => {
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
    state.playerWindowRef.webContents.send('player:hotkeysChanged', hotkeys);
  }
});

// ── Lobby proposal IPC forwarding ──
// Main window → Player window (proposal events)
ipcMain.on('lobby:proposalToPlayer', (_, data) => {
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
    state.playerWindowRef.webContents.send('lobby:proposal', data);
  }
});

// Main window → Player window (activity feed & participant list)
ipcMain.on('lobby:activityToPlayer', (_, data) => {
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
    state.playerWindowRef.webContents.send('lobby:activityFeed', data);
  }
});

ipcMain.on('lobby:participantsToPlayer', (_, participants) => {
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
    state.playerWindowRef.webContents.send('lobby:participantsList', participants);
  }
});

ipcMain.on('lobby:sessionToPlayer', (_, session) => {
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
    state.playerWindowRef.webContents.send('lobby:session', session);
  }
});

ipcMain.on('lobby:chatToPlayer', (_, msg) => {
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
    state.playerWindowRef.webContents.send('lobby:chatToPlayer', msg);
  }
});

ipcMain.on('lobby:chatHistoryToPlayer', (_, messages) => {
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
    state.playerWindowRef.webContents.send('lobby:chatHistoryToPlayer', messages ?? []);
  }
});

ipcMain.on('lobby:chooserErrorToPlayer', (_, msg) => {
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
    state.playerWindowRef.webContents.send('lobby:chooserErrorToPlayer', msg);
  }
});

ipcMain.on('lobby:createFromPlayer', (_, payload) => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('lobby:createFromPlayer', payload ?? null);
  }
});

ipcMain.on('lobby:joinFromPlayer', (_, code) => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('lobby:joinFromPlayer', code);
  }
});

ipcMain.on('lobby:leaveFromPlayer', () => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('lobby:leaveFromPlayer');
  }
});

ipcMain.on('lobby:chatFromPlayer', (_, text) => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('lobby:chatFromPlayer', text);
  }
});

ipcMain.on('lobby:kickFromPlayer', (_, payload) => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('lobby:kickFromPlayer', payload ?? null);
  }
});

ipcMain.on('lobby:transferHostFromPlayer', (_, payload) => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('lobby:transferHostFromPlayer', payload ?? null);
  }
});

ipcMain.on('lobby:requestSession', () => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('lobby:requestSession');
  }
});

ipcMain.on('lobby:bufferingStartFromPlayer', () => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('lobby:bufferingStartFromPlayer');
  }
});

ipcMain.on('lobby:requestCatchUpFromPlayer', () => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('lobby:requestCatchUpFromPlayer');
  }
});

ipcMain.on('lobby:playerSyncedFromPlayer', (_, payload) => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('lobby:playerSyncedFromPlayer', payload ?? null);
  }
});

ipcMain.on('fluo:previewFromPlayer', (_, payload) => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('fluo:previewFromPlayer', payload ?? null);
  }
});

ipcMain.on('lobby:waitingOverlayToPlayer', (_, payload) => {
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
    state.playerWindowRef.webContents.send('lobby:playerWaitingOverlay', payload);
  }
});

ipcMain.on('lobby:barrierSyncToPlayer', (_, playback) => {
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
    state.playerWindowRef.webContents.send('lobby:barrierSyncToPlayer', playback ?? null);
  }
});

ipcMain.on('lobby:syncResumeToPlayer', () => {
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
    state.playerWindowRef.webContents.send('lobby:syncResumeToPlayer');
  }
});

ipcMain.on('lobby:syncStateToPlayer', (_, syncState) => {
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
    state.playerWindowRef.webContents.send('lobby:syncStateToPlayer', syncState ?? {});
  }
});

ipcMain.on('lobby:actionLogToPlayer', (_, entry) => {
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
    state.playerWindowRef.webContents.send('lobby:actionLogEntry', entry);
  }
});

// Player window → Main window (vote)
ipcMain.on('lobby:voteFromPlayer', (_, proposalId, accept) => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('lobby:voteFromPlayer', { proposalId, accept });
  }
});

ipcMain.on('player:stateChanged', (event, payload) => {
  let playback = payload;
  if (payload && typeof payload === 'object' && payload.playback) {
    playback = payload.playback;
  }
  if (playback && typeof playback === 'object') {
    state.currentPlayerPlayback = {
      releaseId: String(playback.releaseId ?? ''),
      sourceId: String(playback.sourceId ?? ''),
      ep: String(playback.ep ?? ''),
      dubberId: String(playback.dubberId ?? ''),
    };
    // Update Discord presence with current watching state
    if (discordRpc && config.getDiscordRpcEnabled() && config.getDiscordRpcShowWatching()) {
      discord.applyDiscordRpcOptionsFromSettings();
      discordRpc.setWatching({
        title: String(playback.title ?? ''),
        ep: String(playback.ep ?? ''),
        sourceName: String(playback.sourceName ?? ''),
        dubberName: playback.dubberName ? String(playback.dubberName) : undefined,
        paused: !!playback.paused,
        currentTime: Number(playback.currentTime ?? 0),
        duration: playback.duration != null ? Number(playback.duration) : undefined,
        posterUrl: playback.posterUrl ? String(playback.posterUrl) : undefined,
      });
    }
  }
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('lobby:playerStateChanged', payload);
  }
});

// Renderer sends lobby state to update Discord party presence
ipcMain.on('discord:update', (_, data) => {
  if (!data || typeof data !== 'object' || !discordRpc || !config.getDiscordRpcEnabled()) return;

  discord.applyDiscordRpcOptionsFromSettings();
  const showImages = data.showImages !== false && config.getDiscordRpcShowImages();

  if (data.type === 'watching') {
    if (!config.getDiscordRpcShowWatching()) return;
    discordRpc.setWatching({
      title: String(data.title ?? ''),
      ep: String(data.ep ?? ''),
      sourceName: String(data.sourceName ?? ''),
      dubberName: data.dubberName ? String(data.dubberName) : undefined,
      paused: !!data.paused,
      currentTime: Number(data.currentTime ?? 0),
      duration: data.duration != null ? Number(data.duration) : undefined,
      posterUrl: showImages && data.posterUrl ? String(data.posterUrl) : undefined,
    });
  } else if (data.type === 'partyInfo') {
    if (!config.getDiscordRpcShowParty()) {
      discordRpc.setPartyInfo(null);
      return;
    }
    if (data.partyId) {
      discordRpc.setPartyInfo({
        partyId: String(data.partyId),
        partySize: Number(data.partySize ?? 1),
        partyMax: Number(data.partyMax ?? 10),
        joinSecret: data.joinSecret ? String(data.joinSecret) : undefined,
      });
    } else {
      discordRpc.setPartyInfo(null);
    }
  } else if (data.type === 'posterUrl') {
    if (showImages && data.posterUrl) {
      discordRpc.setPosterUrl(String(data.posterUrl));
    }
  } else if (
    data.type === 'page'
    || data.type === 'release'
    || data.type === 'profile'
    || data.type === 'collection'
    || data.type === 'browsing'
  ) {
    if (!config.getDiscordRpcShowBrowsing()) {
      discord.setDiscordGenericInApp();
      return;
    }
    if (data.type === 'page') {
      discordRpc.setPage({
        details: String(data.details ?? ''),
        state: String(data.state ?? ''),
      });
    } else if (data.type === 'release') {
      discordRpc.setViewingRelease({
        title: String(data.title ?? ''),
        posterUrl: showImages && data.posterUrl ? String(data.posterUrl) : null,
        state: data.state ? String(data.state) : undefined,
      });
    } else if (data.type === 'profile') {
      discordRpc.setViewingProfile({
        username: data.username ? String(data.username) : '',
        avatarUrl: showImages && data.avatarUrl ? String(data.avatarUrl) : null,
        isSelf: !!data.isSelf,
        state: data.state ? String(data.state) : undefined,
      });
    } else if (data.type === 'collection') {
      discordRpc.setViewingCollection({
        title: String(data.title ?? ''),
        imageUrl: showImages && data.imageUrl ? String(data.imageUrl) : null,
        state: data.state ? String(data.state) : undefined,
      });
    } else if (data.type === 'browsing') {
      discord.setDiscordGenericInApp();
    }
  }
});

ipcMain.on('player:close', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (win && !win.isDestroyed()) win.close();
});

ipcMain.handle('player:toggleFullScreen', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return false;
  const next = !win.isFullScreen();
  win.setFullScreen(next);
  event.sender.send('player:fullscreen', next);
  return next;
});

function playerWindowTitle(payload) {
  const title = String(payload?.title ?? '').trim();
  const episode = String(payload?.episode ?? '').trim();
  if (title && episode) return `${title} · ${episode}`;
  return title || 'AnixApp — Просмотр';
}

ipcMain.on('player:setWindowTitle', (event, payload) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return;
  const title = playerWindowTitle(payload);
  win.setTitle(title);
  if (!win.webContents.isDestroyed()) win.webContents.send('player:windowTitle', title);
});

ipcMain.handle('player:toggleAlwaysOnTop', (event) => {
  const win = BrowserWindow.fromWebContents(event.sender);
  if (!win || win.isDestroyed()) return false;
  const next = !win.isAlwaysOnTop();
  win.setAlwaysOnTop(next, 'floating');
  return next;
});

ipcMain.handle('player:isOpen', () => {
  return !!(state.playerWindowRef && !state.playerWindowRef.isDestroyed());
});

  player.createPlayerWindow = createPlayerWindow;
  player.openExternalPlayback = openExternalPlayback;
}

module.exports = { register, player };
