'use strict';

/**
 * РЈРІРµРґРѕРјР»РµРЅРёСЏ СѓСЃС‚СЂРѕР№СЃС‚РІР° (РЅР°С‚РёРІРЅС‹Рµ С‚РѕСЃС‚С‹ + Р±Р°РЅРЅРµСЂС‹ + Р·РІСѓРє).
 *
 * Р’РѕР·РјРѕР¶РЅРѕСЃС‚Рё:
 *   вЂў РќР°С‚РёРІРЅС‹Рµ СѓРІРµРґРѕРјР»РµРЅРёСЏ РћРЎ (Windows Action Center / macOS / Linux libnotify)
 *   вЂў РЎРІРѕРё Р±Р°РЅРЅРµСЂС‹ РїРѕРІРµСЂС… РѕРєРЅР° вЂ” РѕС‚РґРµР»СЊРЅРѕРµ РїСЂРѕР·СЂР°С‡РЅРѕРµ always-on-top РѕРєРЅРѕ
 *   вЂў Р’С‹Р±РѕСЂ Р·РІСѓРєР° СѓРІРµРґРѕРјР»РµРЅРёСЏ Рё РіСЂРѕРјРєРѕСЃС‚Рё (+ РїСЂРµРґРїСЂРѕСЃР»СѓС€РёРІР°РЅРёРµ РІ РЅР°СЃС‚СЂРѕР№РєР°С…)
 *   вЂў РњРёРіР°РЅРёРµ РёРєРѕРЅРєРё РІ РїР°РЅРµР»Рё Р·Р°РґР°С‡, РєР»РёРє в†’ РѕС‚РєСЂС‹С‚РёРµ РїСЂРёР»РѕР¶РµРЅРёСЏ
 *   вЂў РџРѕР·РёС†РёСЏ РЅР° СЌРєСЂР°РЅРµ Рё РєРѕР»РёС‡РµСЃС‚РІРѕ РѕРґРЅРѕРІСЂРµРјРµРЅРЅРѕ РІРёРґРёРјС‹С… Р±Р°РЅРЅРµСЂРѕРІ
 *
 * Р’СЃС‘ РїРѕРІРµРґРµРЅРёРµ РєРѕРЅС„РёРіСѓСЂРёСЂСѓРµС‚СЃСЏ РёР· РЅР°СЃС‚СЂРѕРµРє СѓСЃС‚СЂРѕР№СЃС‚РІР° (notificationSettings).
 */

const path = require('path');
const fs = require('fs');
const os = require('os');
const crypto = require('crypto');
const { pathToFileURL } = require('url');
const {
  BrowserWindow,
  Notification,
  ipcMain,
  screen,
  shell,
  nativeImage,
} = require('electron');
const state = require('../lib/app-state');
const config = require('../lib/config-store');
const { getDevServerOrigin } = require('../lib/dev-server');
const logger = require('../logger');
const { fetchRemoteImage } = require('../cdn-proxy');
const {
  getSoundsDir,
  soundAssetUrl,
} = require('../lib/notification-sound-protocol');

const BANNER_WIDTH = 400;
const BANNER_HEIGHT = 128;
const BANNER_ITEM_HEIGHT = 76;
const BANNER_ITEM_GAP = 10;
/** Р‘РµР· РІРЅРµС€РЅРёС… РїР°РґРґРёРЅРіРѕРІ СЃС‚РµРєР° вЂ” РєР»РёРєРё СЃРєРІРѕР·СЊ РїСѓСЃС‚РѕС‚Сѓ РѕРєРЅР°. */
const STACK_PADDING = 0;
const BANNER_MARGIN = 16;
const SAMPLE_POSTER = 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg';

/**
 * Картинка для баннера.
 * anix-cdn:// в CSS background-image окна-баннера не грузится — отдаём data: URL из main.
 */
const bannerImageDataCache = new Map();
const BANNER_IMAGE_CACHE_MAX = 64;
const BANNER_IMAGE_MAX_W = 480;

async function toBannerDisplayUrl(image) {
  if (typeof image !== 'string') return '';
  const s = image.trim();
  if (!s) return '';
  if (s.startsWith('data:') || s.startsWith('blob:')) return s;

  const https = toHttpsImageUrl(s);
  if (!https) return '';

  const cached = bannerImageDataCache.get(https);
  if (cached) return cached;

  try {
    const asset = await fetchRemoteImage(https);
    let buffer = Buffer.from(asset.data);
    let mime = String(asset.mimeType || 'image/jpeg').split(';')[0] || 'image/jpeg';

    try {
      let img = nativeImage.createFromBuffer(buffer);
      if (!img.isEmpty()) {
        const { width } = img.getSize();
        if (width > BANNER_IMAGE_MAX_W) {
          img = img.resize({ width: BANNER_IMAGE_MAX_W, quality: 'better' });
          buffer = img.toJPEG(84);
          mime = 'image/jpeg';
        }
      }
    } catch { /* leave original buffer */ }

    const dataUrl = `data:${mime};base64,${buffer.toString('base64')}`;
    bannerImageDataCache.set(https, dataUrl);
    if (bannerImageDataCache.size > BANNER_IMAGE_CACHE_MAX) {
      const oldest = bannerImageDataCache.keys().next().value;
      bannerImageDataCache.delete(oldest);
    }
    return dataUrl;
  } catch (err) {
    logger.warn('notifications', `banner image failed: ${err?.message || err}`);
    return '';
  }
}

async function hydrateBannerItemImages(items) {
  if (!Array.isArray(items) || items.length === 0) return items || [];
  return Promise.all(items.map(async (item) => {
    const image = await toBannerDisplayUrl(item?.image || '');
    return { ...item, image };
  }));
}

/** HTTPS URL РєР°СЂС‚РёРЅРєРё РґР»СЏ СЃРєР°С‡РёРІР°РЅРёСЏ (РёР· anix-cdn / __cdn / http). */
function toHttpsImageUrl(image) {
  if (typeof image !== 'string') return '';
  let s = image.trim();
  if (!s) return '';
  if (s.startsWith('anix-cdn://')) {
    try { s = new URL(s).searchParams.get('u') || ''; } catch { return ''; }
  }
  if (s.startsWith('/__cdn/')) {
    try { s = new URL(s, 'http://localhost').searchParams.get('u') || ''; } catch { return ''; }
  }
  if (s.startsWith('http://') || s.startsWith('https://')) return s;
  if (!s.includes('/') && !s.includes('\\')) {
    return s.includes('.')
      ? `https://s.anixmirai.com/posters/${s}`
      : `https://s.anixmirai.com/posters/${s}.jpg`;
  }
  return '';
}

function escapeXml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** РљСЌС€ Р»РѕРєР°Р»СЊРЅС‹С… PNG РґР»СЏ СЃРёСЃС‚РµРјРЅС‹С… С‚РѕСЃС‚РѕРІ: https в†’ file path. */
const toastIconCache = new Map();

/**
 * РЎРєР°С‡РёРІР°РµС‚ Р°РІР°С‚Р°СЂ/РїРѕСЃС‚РµСЂ РІРѕ РІСЂРµРјРµРЅРЅС‹Р№ PNG РґР»СЏ Windows toast / Electron Notification.icon.
 * @returns {Promise<string|undefined>}
 */
async function resolveToastIconPath(image, fallbackPath) {
  const https = toHttpsImageUrl(image);
  if (!https) return fallbackPath || undefined;
  const cached = toastIconCache.get(https);
  if (cached && fs.existsSync(cached)) return cached;
  try {
    const asset = await fetchRemoteImage(https);
    const buffer = Buffer.from(asset.data);
    let img = nativeImage.createFromBuffer(buffer);
    if (img.isEmpty()) return fallbackPath || undefined;
    const size = img.getSize();
    if (size.width > 128 || size.height > 128) {
      img = img.resize({ width: 128, height: 128, quality: 'better' });
    }
    const hash = crypto.createHash('sha1').update(https).digest('hex').slice(0, 16);
    const out = path.join(os.tmpdir(), `anix-toast-${hash}.png`);
    fs.writeFileSync(out, img.toPNG());
    toastIconCache.set(https, out);
    return out;
  } catch (err) {
    logger.warn('notifications', `toast icon failed: ${err?.message || err}`);
    return fallbackPath || undefined;
  }
}

/** РЎРєРѕР»СЊРєРѕ РјРёР»Р»РёСЃРµРєСѓРЅРґ РѕРґРёРЅ Р±Р°РЅРЅРµСЂ РѕСЃС‚Р°С‘С‚СЃСЏ РЅР° СЌРєСЂР°РЅРµ. */
const BANNER_TTL_MS = 6000;
/** РњР°РєСЃРёРјСѓРј СѓРґРµСЂР¶РёРІР°РµРјС‹С… Р±Р°РЅРЅРµСЂРѕРІ (СЃС‚СЂР°С…РѕРІРєР° РѕС‚ СѓС‚РµС‡РµРє). */
const MAX_QUEUE = 12;

/** Список доступных звуков: id, подпись (файл в electron/assets/sounds). */
function listSounds() {
  return [
    { id: 'off', label: 'Выключен', file: null, desc: 'Без звука' },
    { id: 'system', label: 'Системный', file: null, desc: 'Звук операционной системы' },
    { id: 'chime', label: 'Chime', file: 'chime.wav', desc: 'Мягкий колокольчик' },
    { id: 'plub', label: 'Plub', file: 'plub.wav', desc: 'sa plub' },
    { id: 'rawr', label: 'Rawr', file: 'rawr.wav', desc: 'sa rawr' },
    { id: 'nya', label: 'Nya', file: 'nya.wav', desc: 'sa nya' },
    { id: 'bonk', label: 'Bonk', file: 'bonk.wav', desc: 'sa bonk' },
    { id: 'eh', label: 'Eh', file: 'eh.wav', desc: 'sa eh' },
    { id: 'gatcha', label: 'Gatcha', file: 'gatcha.wav', desc: 'sa gatcha' },
    { id: 'mambo', label: 'Mambo', file: 'mambo.wav', desc: 'sa mambo' },
    { id: 'pue', label: 'Pue', file: 'pue.wav', desc: 'sa pue' },
    { id: 'note', label: 'Note', file: 'note.wav', desc: 'sa note' },
  ];
}

function soundFileForId(soundsDir, soundId) {
  const entry = listSounds().find((s) => s.id === soundId);
  if (!entry || !entry.file) return null;
  const p = path.join(soundsDir, entry.file);
  return fs.existsSync(p) ? p : null;
}

function createService(deps) {
  const { isDev, electronDir, getIconPath } = deps;
  const soundsDir = getSoundsDir(electronDir);

  /** @type {BrowserWindow | null} */
  let bannerWindow = null;
  /** @type {Array<{id:string,payload:object,hovered?:boolean,expireTimer:any}>} */
  let queue = [];
  /** true вЂ” РѕРєРЅРѕ Р±Р°РЅРЅРµСЂРѕРІ РіРѕС‚РѕРІРѕ РїСЂРёРЅРёРјР°С‚СЊ РєРѕРЅС‚РµРЅС‚. */
  let bannerReady = false;
  /** РљСЌС€ РЅР°С‚РёРІРЅРѕРіРѕ СѓРІРµРґРѕРјР»РµРЅРёСЏ вЂ” Electron С‚СЂРµР±СѓРµС‚ С…СЂР°РЅРёС‚СЊ СЃСЃС‹Р»РєСѓ, РёРЅР°С‡Рµ С‚РѕСЃС‚ РёСЃС‡РµР·Р°РµС‚. */
  const liveNative = new Set();

  // вЂ”вЂ”вЂ” Р—Р°РіСЂСѓР·РєР° Р±Р°РЅРЅРµСЂРЅРѕРіРѕ РѕРєРЅР° вЂ”вЂ”вЂ”

  function bannerUrl() {
    if (isDev) return `${getDevServerOrigin()}/notification-banner.html`;
    return null;
  }

  function createBannerWindow() {
    if (bannerWindow && !bannerWindow.isDestroyed()) return bannerWindow;
    const iconPath = getIconPath();
    bannerWindow = new BrowserWindow({
      width: BANNER_WIDTH,
      height: BANNER_HEIGHT,
      show: false,
      frame: false,
      transparent: true,
      backgroundColor: '#00000000',
      resizable: false,
      movable: false,
      minimizable: false,
      maximizable: false,
      fullscreenable: false,
      skipTaskbar: true,
      focusable: false,
      hasShadow: false,
      acceptFirstMouse: true,
      alwaysOnTop: true,
      ...(iconPath && { icon: iconPath }),
      webPreferences: {
        preload: path.join(electronDir, 'notification-banner-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
      },
    });
    bannerWindow.setAlwaysOnTop(true, 'screen-saver');
    bannerWindow.setVisibleOnAllWorkspaces(true, { visibleOnFullScreen: true });
    // РџСѓСЃС‚РѕС‚Р° РѕРєРЅР° РїСЂРѕР·СЂР°С‡РЅР° РґР»СЏ РєР»РёРєРѕРІ; РЅР°Рґ РєР°СЂС‚РѕС‡РєРѕР№ РІРєР»СЋС‡Р°РµРј СЃРЅРѕРІР° РёР· СЂРµРЅРґРµСЂРµСЂР°.
    bannerWindow.setIgnoreMouseEvents(true, { forward: true });

    bannerWindow.webContents.once('did-finish-load', () => {
      bannerReady = true;
      flushBanners();
    });
    bannerWindow.on('closed', () => {
      bannerWindow = null;
      bannerReady = false;
    });

    const url = bannerUrl();
    if (url) {
      bannerWindow.loadURL(url);
    } else {
      bannerWindow.loadFile(path.join(electronDir, '../dist/notification-banner.html'));
    }
    return bannerWindow;
  }

  // вЂ”вЂ”вЂ” РџРѕР·РёС†РёРѕРЅРёСЂРѕРІР°РЅРёРµ РѕРєРЅР° Р±Р°РЅРЅРµСЂРѕРІ вЂ”вЂ”вЂ”

  /** РўРµРєСѓС‰Р°СЏ РІС‹СЃРѕС‚Р° РѕРєРЅР° Р±Р°РЅРЅРµСЂРѕРІ (РІ px). */
  let bannerHeight = BANNER_HEIGHT;

  /**
   * РџСЂРµРІСЊСЋ СѓРіР»Р° РёР· РЅР°СЃС‚СЂРѕРµРє: { position, items } | null.
   * РџРѕРєР° Р°РєС‚РёРІРЅРѕ вЂ” РїРµСЂРµРєСЂС‹РІР°РµС‚ РѕР±С‹С‡РЅСѓСЋ РѕС‡РµСЂРµРґСЊ (Р±РµР· Р·РІСѓРєР°/native).
   */
  let cornerPreview = null;
  /** РРЅРєСЂРµРјРµРЅС‚ РѕС‚РјРµРЅСЏРµС‚ РЅРµР·Р°РІРµСЂС€С‘РЅРЅСѓСЋ СЃРјРµРЅСѓ СѓРіР»Р°. */
  let cornerPreviewGen = 0;

  function resolveBannerPosition(settings) {
    return cornerPreview?.position || settings.position || 'bottom-right';
  }

  function buildCornerPreviewItems(position, count, customItems) {
    const settings = config.getNotificationSettings();
    const n = Math.min(5, Math.max(1, count || 3));
    const fallback = [
      {
        title: 'РЎРµСЂРёСЏ',
        body: 'Р’С‹С€Р»Р° В«11 СЃРµСЂРёСЏВ» В«РќРµРѕР±СЉСЏС‚РЅС‹Р№ РѕРєРµР°РЅ 3В» В· JAM CLUB В· Kodik',
        kind: 'episode',
        image: SAMPLE_POSTER,
      },
      {
        title: 'РљРѕРјРјРµРЅС‚Р°СЂРёР№',
        body: 'В«PIKA_4YВ»: Р·Р°С†РµРЅРё РЅРѕРІСѓСЋ СЃРµСЂРёСЋ!',
        kind: 'comment',
        image: SAMPLE_POSTER,
      },
      {
        title: 'Р”СЂСѓР·СЊСЏ',
        body: 'В«FlexHunterZВ» РґРѕР±Р°РІРёР» РІР°СЃ РІ РґСЂСѓР·СЊСЏ',
        kind: 'friend',
        image: SAMPLE_POSTER,
      },
      {
        title: 'Р—Р°РїРёСЃСЊ',
        body: 'В«РњР°СЃС‚РµСЂСЃРєР°СЏ РњРёР·РѕСЂРёВ»: СЃРІРµР¶РёР№ РїРѕСЃС‚ РІ Р»РµРЅС‚Рµ',
        kind: 'article',
        image: SAMPLE_POSTER,
      },
      {
        title: 'Р РµР»РёР·',
        body: 'Р”РѕР±Р°РІР»РµРЅР° СЃС‚СЂР°РЅРёС†Р° СЂРµР»РёР·Р° В«РљР°Рµ РЅРµ СЃС‚СЂР°С€РЅРѕВ»',
        kind: 'related',
        image: SAMPLE_POSTER,
      },
    ];
    const rawList = Array.isArray(customItems) && customItems.length
      ? customItems.map((s) => ({
        title: String(s?.title || 'AnixApp'),
        body: String(s?.body || ''),
        kind: String(s?.kind || 'default'),
        image: typeof s?.image === 'string' && s.image ? s.image : SAMPLE_POSTER,
        time: typeof s?.time === 'number' ? s.time : undefined,
      }))
      : fallback;
    const now = Date.now();
    return rawList.slice(0, n).map((s, i) => ({
      ...s,
      id: `corner-preview-${position}-${i}-${now}`,
      image: s.image || SAMPLE_POSTER,
      time: typeof s.time === 'number' ? s.time : now - i * 4000,
      style: settings.bannerStyle,
    }));
  }

  async function showCornerPreviewItems(position, items, stackH) {
    const gen = cornerPreviewGen;
    cornerPreview = { position, items: items.map((it) => ({ ...it, image: '' })) };
    positionBannerWindow(stackH);
    if (bannerReady) flushBanners();
    const hydrated = await hydrateBannerItemImages(items);
    if (gen !== cornerPreviewGen) return;
    cornerPreview = { position, items: hydrated };
    if (bannerReady) flushBanners();
  }

  /**
   * Р Р°СЃРїРѕР»РѕР¶РёС‚СЊ РѕРєРЅРѕ Р±Р°РЅРЅРµСЂРѕРІ РЅР° СЌРєСЂР°РЅРµ.
   * @param {number} height вЂ” Р¶РµР»Р°РµРјР°СЏ РІС‹СЃРѕС‚Р° РѕРєРЅР° РІ px
   */
  function positionBannerWindow(height) {
    if (!bannerWindow || bannerWindow.isDestroyed()) return;
    const settings = config.getNotificationSettings();
    const position = resolveBannerPosition(settings);
    const { alwaysOnTop } = settings;
    const display = screen.getPrimaryDisplay();
    const area = display.workArea;
    const width = BANNER_WIDTH;
    const h = Math.max(BANNER_HEIGHT, Math.round(height || bannerHeight));
    bannerHeight = h;

    let x = area.x + area.width - width - BANNER_MARGIN;
    let y = area.y + BANNER_MARGIN;

    switch (position) {
      case 'top-left':
        x = area.x + BANNER_MARGIN;
        y = area.y + BANNER_MARGIN;
        break;
      case 'bottom-left':
        x = area.x + BANNER_MARGIN;
        y = area.y + area.height - h - BANNER_MARGIN;
        break;
      case 'bottom-right':
        x = area.x + area.width - width - BANNER_MARGIN;
        y = area.y + area.height - h - BANNER_MARGIN;
        break;
      case 'top-right':
      default:
        x = area.x + area.width - width - BANNER_MARGIN;
        y = area.y + BANNER_MARGIN;
        break;
    }

    bannerWindow.setBounds({ x: Math.round(x), y: Math.round(y), width, height: h });
    bannerWindow.setAlwaysOnTop(!!alwaysOnTop, 'screen-saver');
  }

  // вЂ”вЂ”вЂ” РћС‚РїСЂР°РІРєР° РєРѕРЅС‚РµРЅС‚Р° РІ Р±Р°РЅРЅРµСЂРЅРѕРµ РѕРєРЅРѕ вЂ”вЂ”вЂ”

  let hideBannerTimer = null;
  let shrinkBannerTimer = null;

  function flushBanners() {
    if (!bannerWindow || bannerWindow.isDestroyed()) return;
    const settings = config.getNotificationSettings();
    const items = cornerPreview
      ? (cornerPreview.items || [])
      : queue.map((q) => q.payload);
    const position = resolveBannerPosition(settings);
    const visible = items.length;
    const styleKey = settings.bannerStyle === 'rich' ? 'compact' : settings.bannerStyle;
    const styleH = ({ full: 300, compact: 72, minimal: 72 })[styleKey] || BANNER_ITEM_HEIGHT;
    const gap = BANNER_ITEM_GAP;
    const desiredHeight = visible > 0
      ? STACK_PADDING * 2 + visible * styleH + (visible - 1) * gap
      : styleH + STACK_PADDING * 2;

    // РЎРЅР°С‡Р°Р»Р° РєРѕРЅС‚РµРЅС‚ вЂ” leave/FLIP РІ СЂРµРЅРґРµСЂРµСЂРµ; РІС‹СЃРѕС‚Сѓ РѕРєРЅР° РЅРµ СѓРјРµРЅСЊС€Р°РµРј СЂРµР·РєРѕ (РјРµСЂС†Р°РЅРёРµ).
    bannerWindow.webContents.send('notification-banner:update', {
      items,
      position,
      style: settings.bannerStyle,
    });

    if (hideBannerTimer) {
      clearTimeout(hideBannerTimer);
      hideBannerTimer = null;
    }
    if (shrinkBannerTimer) {
      clearTimeout(shrinkBannerTimer);
      shrinkBannerTimer = null;
    }

    if (visible > 0) {
      if (!bannerWindow.isVisible()) bannerWindow.showInactive();
      // РўРѕР»СЊРєРѕ СЂРѕСЃС‚ вЂ” СѓРјРµРЅСЊС€РµРЅРёРµ bounds РЅР° РЅРёР¶РЅРёС… СѓРіР»Р°С… РґРІРёРіР°РµС‚ РІРµСЃСЊ СЃС‚РµРє.
      if (desiredHeight > bannerHeight) {
        positionBannerWindow(desiredHeight);
      } else if (desiredHeight === bannerHeight) {
        positionBannerWindow(desiredHeight);
      } else {
        // Р”РµСЂР¶РёРј С‚РµРєСѓС‰СѓСЋ РІС‹СЃРѕС‚Сѓ, РїРѕРєР° РєР°СЂС‚РѕС‡РєРё РЅР° СЌРєСЂР°РЅРµ.
        positionBannerWindow(bannerHeight);
      }
    } else if (cornerPreview) {
      // РџСѓСЃС‚РѕР№ РїСЂРµРІСЊСЋ РїСЂРё СЃРјРµРЅРµ СѓРіР»Р°: РќР• СѓРјРµРЅСЊС€Р°РµРј РѕРєРЅРѕ, С‚РѕР»СЊРєРѕ Р¶РґС‘Рј РЅРѕРІС‹Рµ РєР°СЂС‚РѕС‡РєРё.
      if (!bannerWindow.isVisible()) bannerWindow.showInactive();
    } else {
      // Fade СЃС‚РµРєР° (~320ms), РїРѕС‚РѕРј hide. Bounds РЅРµ С‚СЂРѕРіР°РµРј РґРѕ СЃРєСЂС‹С‚РёСЏ.
      hideBannerTimer = setTimeout(() => {
        if (queue.length === 0 && !cornerPreview && bannerWindow && !bannerWindow.isDestroyed()) {
          bannerWindow.hide();
          bannerHeight = BANNER_HEIGHT;
          try {
            const { position: pos, alwaysOnTop } = config.getNotificationSettings();
            void pos;
            bannerWindow.setAlwaysOnTop(!!alwaysOnTop, 'screen-saver');
          } catch { /* ignore */ }
        }
      }, 360);
    }
  }

  function setCornerPreview(position, customItems) {
    const allowed = new Set(['top-left', 'top-right', 'bottom-left', 'bottom-right']);
    if (!allowed.has(position)) return false;
    const settings = config.getNotificationSettings();
    const hasCustom = Array.isArray(customItems) && customItems.length > 0;
    // Всегда лимит из настроек — customItems только контент, не количество.
    const count = Math.min(5, Math.max(1, settings.bannerCount || 3));
    const styleKey = settings.bannerStyle === 'rich' ? 'compact' : settings.bannerStyle;
    const styleH = ({ full: 300, compact: 72, minimal: 72 })[styleKey] || BANNER_ITEM_HEIGHT;
    const gap = BANNER_ITEM_GAP;
    const stackH = STACK_PADDING * 2 + count * styleH + (count - 1) * gap;
    const gen = ++cornerPreviewGen;

    createBannerWindow();

    const prevPos = cornerPreview?.position;
    const prevCount = cornerPreview?.items?.length || 0;
    if (prevPos && prevPos !== position && !hasCustom) {
      // Fade на старом углу (высоту не трогаем) → окно в новый угол → появление.
      cornerPreview = { position: prevPos, items: [] };
      if (bannerReady) flushBanners();
      setTimeout(() => {
        if (gen !== cornerPreviewGen) return;
        cornerPreview = { position, items: [] };
        positionBannerWindow(Math.max(stackH, bannerHeight));
        setTimeout(() => {
          if (gen !== cornerPreviewGen) return;
          void showCornerPreviewItems(
            position,
            buildCornerPreviewItems(position, count, null),
            stackH,
          );
        }, 50);
      }, 280);
      return true;
    }

    // Тот же угол и тот же лимит — не дёргаем (кастомный контент обновляем при смене count).
    if (prevPos === position && prevCount === count && cornerPreview?.items?.length) {
      return true;
    }

    void showCornerPreviewItems(
      position,
      buildCornerPreviewItems(position, count, customItems),
      stackH,
    );
    return true;
  }

  function clearCornerPreview() {
    cornerPreviewGen += 1;
    if (!cornerPreview) return false;
    const pos = cornerPreview.position;
    // РћРґРёРЅ flush СЃ РїСѓСЃС‚С‹Рј СЃРїРёСЃРєРѕРј в†’ stack exit РІ СЂРµРЅРґРµСЂРµСЂРµ. РџРѕС‚РѕРј С‚РёС…Рѕ СЃРЅРёРјР°РµРј preview.
    cornerPreview = { position: pos, items: [] };
    if (bannerReady) flushBanners();
    const gen = cornerPreviewGen;
    setTimeout(() => {
      if (gen !== cornerPreviewGen) return;
      cornerPreview = null;
      if (!bannerWindow || bannerWindow.isDestroyed()) return;
      if (queue.length === 0) {
        bannerWindow.hide();
        bannerHeight = BANNER_HEIGHT;
      } else if (bannerReady) {
        flushBanners();
      }
    }, 360);
    return true;
  }

  function clearExpireTimer(entry) {
    if (!entry?.expireTimer) return;
    clearTimeout(entry.expireTimer);
    entry.expireTimer = null;
  }

  function armExpireTimer(entry) {
    if (!entry || entry.hovered) return;
    clearExpireTimer(entry);
    entry.expireTimer = setTimeout(() => removeBanner(entry.id), BANNER_TTL_MS);
  }

  /** Наведение: не удалять, таймер сбросить. */
  function pauseBanner(id) {
    const entry = queue.find((q) => q.id === id);
    if (!entry) return;
    entry.hovered = true;
    clearExpireTimer(entry);
  }

  /** Уход мыши: снова полный TTL. */
  function resumeBanner(id) {
    const entry = queue.find((q) => q.id === id);
    if (!entry) return;
    entry.hovered = false;
    armExpireTimer(entry);
  }

  function removeBanner(id) {
    // РџСЂРµРІСЊСЋ СѓРіР»Р° Р¶РёРІС‘С‚ РѕС‚РґРµР»СЊРЅРѕ РѕС‚ РѕС‡РµСЂРµРґРё вЂ” РєСЂРµСЃС‚РёРє РґРѕР»Р¶РµРЅ С‡РёСЃС‚РёС‚СЊ РµРіРѕ items.
    if (cornerPreview?.items?.length) {
      const next = cornerPreview.items.filter((item) => item.id !== id);
      if (next.length !== cornerPreview.items.length) {
        if (next.length === 0) {
          clearCornerPreview();
          return;
        }
        cornerPreview = { ...cornerPreview, items: next };
        if (bannerReady) flushBanners();
        return;
      }
    }
    const entry = queue.find((q) => q.id === id);
    clearExpireTimer(entry);
    queue = queue.filter((q) => q.id !== id);
    flushBanners();
  }

  function pushBanner(payload) {
    const { bannerCount } = config.getNotificationSettings();
    const id = payload.id || `n-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const rawImage = payload.image || '';
    const entry = {
      id,
      payload: { ...payload, id, image: '' },
      hovered: false,
      expireTimer: null,
    };
    armExpireTimer(entry);
    queue.push(entry);
    // Лимит одновременно видимых + страховка от утечек.
    const limit = Math.min(Math.max(1, bannerCount || 3), MAX_QUEUE);
    while (queue.length > limit) {
      const oldest = queue[0];
      clearExpireTimer(oldest);
      queue.shift();
    }
    createBannerWindow();
    if (bannerReady) flushBanners();

    void (async () => {
      const image = await toBannerDisplayUrl(rawImage);
      const live = queue.find((q) => q.id === id);
      if (!live) return;
      live.payload = { ...live.payload, image };
      if (bannerReady) flushBanners();
    })();

    return id;
  }

  function clearBanners() {
    for (const q of queue) clearExpireTimer(q);
    queue = [];
    flushBanners();
  }

  // вЂ”вЂ”вЂ” РќР°С‚РёРІРЅС‹Рµ СѓРІРµРґРѕРјР»РµРЅРёСЏ РћРЎ вЂ”вЂ”вЂ”

  /**
   * @param {Electron.NotificationConstructorOptions} opts
   * @param {Function} [onClick]
   */
  function presentNative(opts, onClick) {
    const notification = new Notification(opts);
    liveNative.add(notification);
    const cleanup = () => liveNative.delete(notification);
    notification.on('click', () => {
      focusMainWindow();
      onClick?.();
      cleanup();
    });
    notification.on('close', cleanup);
    notification.on('failed', (err) => {
      logger.warn('notifications', `native failed event: ${err?.message || err || 'unknown'}`);
      cleanup();
    });
    notification.show();
    return true;
  }

  async function showNative({ title, body, silent, onClick, image }) {
    if (!Notification.isSupported()) {
      logger.warn('notifications', 'native Notification.isSupported() === false');
      return false;
    }
    try {
      const fallback = getIconPath();
      const iconPath = await resolveToastIconPath(image, fallback);
      const safeTitle = title || 'AnixApp';
      const safeBody = body || '';

      /** @type {Electron.NotificationConstructorOptions} */
      const opts = {
        title: safeTitle,
        body: safeBody,
        silent: !!silent,
        icon: iconPath || undefined,
        timeoutType: 'default',
      };

      // Windows: круглая аватарка вместо иконки приложения
      if (process.platform === 'win32' && iconPath) {
        try {
          const src = pathToFileURL(iconPath).href;
          opts.toastXml = [
            '<toast>',
            '<visual><binding template="ToastGeneric">',
            `<text>${escapeXml(safeTitle)}</text>`,
            `<text>${escapeXml(safeBody)}</text>`,
            `<image placement="appLogoOverride" hint-crop="circle" src="${escapeXml(src)}"/>`,
            '</binding></visual>',
            '</toast>',
          ].join('');
          return presentNative(opts, onClick);
        } catch (toastErr) {
          logger.warn('notifications', `toastXml failed, fallback: ${toastErr?.message || toastErr}`);
          delete opts.toastXml;
        }
      }

      return presentNative(opts, onClick);
    } catch (err) {
      logger.warn('notifications', `native failed: ${err?.message || err}`);
      return false;
    }
  }

  // вЂ”вЂ”вЂ” Р—РІСѓРє вЂ”вЂ”вЂ”

  /**
   * Р’РѕСЃРїСЂРѕРёР·РІРѕРґРёС‚ Р·РІСѓРє СѓРІРµРґРѕРјР»РµРЅРёСЏ.
   * @param {string} [overrideId] вЂ” РїСЂРёРЅСѓРґРёС‚РµР»СЊРЅС‹Р№ id (РґР»СЏ РїСЂРµРґРїСЂРѕСЃР»СѓС€РёРІР°РЅРёСЏ)
   */
  function playSound(overrideId) {
    const settings = config.getNotificationSettings();
    const soundId = overrideId ?? settings.soundId;
    if (soundId === 'off') return;
    if (overrideId == null && (!settings.soundEnabled || settings.muted)) return;

    const volume = config.clampNotificationVolume(settings.volume);

    // РЎРёСЃС‚РµРјРЅС‹Р№ Р·РІСѓРє вЂ” beep РћРЎ.
    if (soundId === 'system') {
      try { shell.beep(); } catch { /* ignore */ }
      return;
    }

    const entry = listSounds().find((s) => s.id === soundId);
    if (!entry?.file || !soundFileForId(soundsDir, soundId)) return;

    const fileUrl = soundAssetUrl(entry.file);
    if (!fileUrl) return;
    const payload = { soundId, fileUrl, volume };

    // Р“Р»Р°РІРЅРѕРµ РѕРєРЅРѕ вЂ” РѕСЃРЅРѕРІРЅРѕР№ РєР°РЅР°Р» (user-gesture / Р±РµР· Р°РІС‚РѕРїР»РµР№-Р±Р»РѕРєРёСЂРѕРІРєРё).
    const main = state.mainWindow;
    if (main && !main.isDestroyed()) {
      main.webContents.send('notification-sound:playInApp', payload);
      return;
    }

    // Р—Р°РїР°СЃРЅРѕР№ РєР°РЅР°Р» вЂ” СЃРєСЂС‹С‚РѕРµ РѕРєРЅРѕ (РєРѕРіРґР° РіР»Р°РІРЅРѕРіРѕ РЅРµС‚).
    const win = createSoundWindow(volume);
    const send = () => {
      if (win.isDestroyed()) return;
      win.webContents.send('notification-sound:play', payload);
    };
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', send);
    } else {
      send();
    }
  }

  let soundWindow = null;
  let soundVolume = 100;
  function createSoundWindow(volume) {
    soundVolume = config.clampNotificationVolume(volume);
    if (soundWindow && !soundWindow.isDestroyed()) {
      soundWindow.webContents.setAudioMuted(false);
      return soundWindow;
    }
    soundWindow = new BrowserWindow({
      width: 1,
      height: 1,
      show: false,
      frame: false,
      skipTaskbar: true,
      webPreferences: {
        preload: path.join(electronDir, 'notification-sound-preload.js'),
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: false,
        backgroundThrottling: false,
      },
    });
    soundWindow.webContents.setAudioMuted(false);
    const url = isDev ? `${getDevServerOrigin()}/notification-sound.html` : null;
    if (url) soundWindow.loadURL(url);
    else soundWindow.loadFile(path.join(electronDir, '../dist/notification-sound.html'));
    soundWindow.on('closed', () => { soundWindow = null; });
    return soundWindow;
  }

  function getSoundVolume() {
    return soundVolume;
  }

  // вЂ”вЂ”вЂ” Р¤РѕРєСѓСЃ РіР»Р°РІРЅРѕРіРѕ РѕРєРЅР° вЂ”вЂ”вЂ”

  function focusMainWindow() {
    const win = state.mainWindow;
    if (!win || win.isDestroyed()) return;
    if (!win.isVisible()) win.show();
    if (win.isMinimized()) win.restore();
    win.focus();
  }

  // вЂ”вЂ”вЂ” РџСѓР±Р»РёС‡РЅС‹Р№ API вЂ”вЂ”вЂ”

  function resolveKindKey(kind) {
    switch (String(kind || '')) {
      case 'episode': return 'episode';
      case 'article': return 'article';
      case 'friend':
      case 'friend-accept': return 'friend';
      case 'comment': return 'comment';
      case 'related':
      case 'release': return 'release';
      default: return 'default';
    }
  }

  /**
   * Режим вызова для типа: both | banner | native | off.
   * Системные и баннеры приложения взаимоисключающие: при useNative — только ОС.
   */
  function resolveCallMode(settings, kind) {
    const key = resolveKindKey(kind);
    const mode = settings.typeChannels?.[key] || 'both';
    if (mode === 'off') return { wantNative: false, wantBanner: false, wantSound: false };

    // Глобальный переключатель ОС имеет приоритет над баннерами приложения.
    if (settings.useNativeNotifications) {
      return {
        wantNative: true,
        wantBanner: false,
        wantSound: false,
      };
    }

    const wantBanner = !!settings.customBannersEnabled;
    return {
      wantNative: false,
      wantBanner,
      wantSound: !!settings.soundEnabled && wantBanner,
    };
  }

  /**
   * РџРѕРєР°Р·Р°С‚СЊ СѓРІРµРґРѕРјР»РµРЅРёРµ СѓСЃС‚СЂРѕР№СЃС‚РІР°.
   * @param {{title?:string, body?:string, image?:string, deepLink?:{type:string,id:number}, kind?:string, id?:string, force?:boolean}} payload
   */
  function notify(payload = {}) {
    const settings = config.getNotificationSettings();
    if (!settings.desktopEnabled || settings.muted) return;

    const win = state.mainWindow;
    const focused = !!win && !win.isDestroyed() && win.isVisible() && win.isFocused();
    if (focused && !settings.showWhenFocused && !payload.force) return;

    const { wantNative, wantBanner, wantSound } = resolveCallMode(settings, payload.kind);
    if (!wantNative && !wantBanner && !wantSound) return;

    const title = payload.title || 'AnixApp';
    const displayBody = settings.showPreview
      ? (settings.bannerStyle === 'minimal' ? '' : (payload.body || ''))
      : 'РЈ РІР°СЃ РЅРѕРІРѕРµ СѓРІРµРґРѕРјР»РµРЅРёРµ';

    const openDeepLink = () => {
      if (payload.deepLink?.type && Number.isFinite(payload.deepLink.id)) {
        win?.webContents?.send('app:deepLink', payload.deepLink);
      }
    };
    const onClick = () => {
      focusMainWindow();
      openDeepLink();
    };

    if (wantNative) {
      // Системный тост: звук ОС. Мелодии приложения (nya и т.п.) не трогаем.
      void showNative({
        title,
        body: displayBody || title,
        silent: false,
        onClick,
        image: payload.image || '',
      });
    }

    if (wantBanner) {
      pushBanner({
        title,
        body: displayBody,
        image: payload.image || '',
        kind: payload.kind || 'default',
        url: payload.deepLink || null,
        id: payload.id,
        time: Date.now(),
        style: settings.bannerStyle,
      });
    }

    if (wantSound) {
      playSound();
    }

    if (settings.flashTaskbar && !focused && win && !win.isDestroyed()) {
      try { win.flashFrame(true); } catch { /* ignore */ }
      const stopFlash = () => {
        try { win.flashFrame(false); } catch { /* ignore */ }
        win.removeListener('focus', stopFlash);
      };
      win.once('focus', stopFlash);
    }
  }

  // вЂ”вЂ”вЂ” IPC вЂ”вЂ”вЂ”

  function registerIpc() {
    ipcMain.handle('notifications:show', (_, payload) => {
      notify(payload || {});
      return true;
    });
    ipcMain.handle('notifications:getSettings', () => config.getNotificationSettings());
    ipcMain.handle('notifications:saveSettings', (_, patch) => {
      const current = config.getNotificationSettings();
      const p = patch && typeof patch === 'object' ? patch : {};
      const merged = {
        ...current,
        ...p,
        typeChannels: {
          ...current.typeChannels,
          ...(p.typeChannels && typeof p.typeChannels === 'object' ? p.typeChannels : {}),
        },
      };
      const next = config.normalizeNotificationSettings(merged);
      config.saveConfig({ notificationSettings: next });
      if (bannerWindow && !bannerWindow.isDestroyed()) {
        positionBannerWindow(bannerHeight);
        flushBanners();
      }
      return next;
    });
    ipcMain.handle('notifications:listSounds', () => listSounds());
    ipcMain.handle('notifications:previewSound', (_, soundId) => {
      playSound(typeof soundId === 'string' ? soundId : undefined);
      return true;
    });
    ipcMain.handle('notifications:test', (_, kind) => {
      const samples = {
        episode: {
          title: 'РЎРµСЂРёСЏ',
          body: 'Р’С‹С€Р»Р° В«11 СЃРµСЂРёСЏВ» В«РќРµРѕР±СЉСЏС‚РЅС‹Р№ РѕРєРµР°РЅ 3В» В· JAM CLUB В· Kodik',
          kind: 'episode',
          image: SAMPLE_POSTER,
        },
        article: {
          title: 'Р—Р°РїРёСЃСЊ',
          body: 'В«РњР°СЃС‚РµСЂСЃРєР°СЏ РњРёР·РѕСЂРёВ»: СЃРІРµР¶РёР№ РїРѕСЃС‚ РІ Р»РµРЅС‚Рµ вЂ” Р·Р°РіР»СЏРЅРё',
          kind: 'article',
          image: SAMPLE_POSTER,
        },
        friend: {
          title: 'Р”СЂСѓР·СЊСЏ',
          body: 'В«PieyonВ» РґРѕР±Р°РІРёР» РІР°СЃ РІ РґСЂСѓР·СЊСЏ',
          kind: 'friend',
          image: SAMPLE_POSTER,
        },
        comment: {
          title: 'РљРѕРјРјРµРЅС‚Р°СЂРёР№',
          body: 'В«Р—РѕРІРёС‚Рµ РјРµРЅСЏ Р“СѓСЃС‚Р°РІВ»: Р·Р°С†РµРЅРё РЅРѕРІСѓСЋ СЃРµСЂРёСЋ!',
          kind: 'comment',
          image: SAMPLE_POSTER,
        },
        release: {
          title: 'Р РµР»РёР·',
          body: 'Р”РѕР±Р°РІР»РµРЅР° СЃС‚СЂР°РЅРёС†Р° СЂРµР»РёР·Р° В«РќРµРѕР±СЉСЏС‚РЅС‹Р№ РѕРєРµР°РЅ 3В»',
          kind: 'related',
          image: SAMPLE_POSTER,
        },
        default: {
          title: 'AnixApp',
          body: 'РџСЂРµРІСЊСЋ Р±Р°РЅРЅРµСЂР° Рё СЃРёСЃС‚РµРјРЅРѕРіРѕ С‚РѕСЃС‚Р°',
          kind: 'default',
          image: SAMPLE_POSTER,
        },
      };
      const key = typeof kind === 'string' && samples[kind] ? kind : 'episode';
      notify({ ...samples[key], force: true, id: `test-${key}-${Date.now()}` });
      return true;
    });
    ipcMain.handle('notifications:clear', () => {
      clearCornerPreview();
      clearBanners();
      return true;
    });
    ipcMain.handle('notifications:previewCorner', (_, position, items) => {
      if (typeof position !== 'string') return false;
      return setCornerPreview(position, items);
    });
    ipcMain.handle('notifications:endPreviewCorner', () => clearCornerPreview());
    ipcMain.handle('notifications:soundVolume', () => getSoundVolume());

    ipcMain.on('notification-banner:dismiss', (_, id) => {
      if (typeof id === 'string') removeBanner(id);
    });
    ipcMain.on('notification-banner:pause', (_, id) => {
      if (typeof id === 'string') pauseBanner(id);
    });
    ipcMain.on('notification-banner:resume', (_, id) => {
      if (typeof id === 'string') resumeBanner(id);
    });
    ipcMain.on('notification-banner:click', (_, payload) => {
      const { id, url } = payload || {};
      if (typeof id === 'string') removeBanner(id);
      focusMainWindow();
      if (url && typeof url === 'object' && Number.isFinite(url.id)) {
        const win = state.mainWindow;
        win?.webContents?.send('app:deepLink', { type: url.type, id: url.id });
      }
    });
    ipcMain.on('notification-banner:ready', () => {
      bannerReady = true;
      flushBanners();
    });
    ipcMain.on('notification-banner:height', (_, height) => {
      if (!bannerWindow || bannerWindow.isDestroyed()) return;
      const h = Math.max(BANNER_HEIGHT, Math.round(Number(height) || BANNER_HEIGHT));
      // РўРѕР»СЊРєРѕ СѓРІРµР»РёС‡РёРІР°РµРј вЂ” СѓРјРµРЅСЊС€РµРЅРёРµ bounds РЅР° РЅРёР¶РЅРёС… СѓРіР»Р°С… РґР°С‘С‚ РјРµСЂС†Р°РЅРёРµ.
      if (h > bannerHeight) positionBannerWindow(h);
    });
    ipcMain.on('notification-banner:setIgnoreMouse', (_, ignore) => {
      if (!bannerWindow || bannerWindow.isDestroyed()) return;
      try {
        if (ignore) {
          bannerWindow.setIgnoreMouseEvents(true, { forward: true });
        } else {
          bannerWindow.setIgnoreMouseEvents(false);
        }
      } catch { /* ignore */ }
    });
  }

  function destroy() {
    clearBanners();
    if (bannerWindow && !bannerWindow.isDestroyed()) bannerWindow.destroy();
    bannerWindow = null;
    if (soundWindow && !soundWindow.isDestroyed()) soundWindow.destroy();
    soundWindow = null;
    liveNative.clear();
  }

  return {
    registerIpc,
    notify,
    playSound,
    clearBanners,
    focusMainWindow,
    listSounds,
    destroy,
    _bannerWindow: () => bannerWindow,
  };
}

module.exports = { createService, listSounds, BANNER_WIDTH, BANNER_HEIGHT };
