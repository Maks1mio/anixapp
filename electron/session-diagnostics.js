'use strict';

/**
 * Central diagnostics: console + network from every BrowserWindow / webContents,
 * plus main-process console. No renderer instrumentation required.
 */

const { app, session, BrowserWindow, dialog, screen } = require('electron');
const fs = require('fs');
const path = require('path');
const os = require('os');
const zlib = require('zlib');

const MAX_ENTRIES = 8_000;
const CONSOLE_LEVELS = ['debug', 'info', 'warn', 'error'];
const DIAG_DIR_NAME = 'diagnostics';
const LEGACY_LIVE_NAME = 'live.jsonl';
const CURRENT_POINTER = 'current.txt';
/** Keep recent dated session files; older ones are removed. */
const MAX_SESSION_FILES = 40;

/** @type {Array<Record<string, unknown>>} */
let entries = [];
let seq = 0;
let installed = false;
/** @type {Set<number>} */
const subscribers = new Set();
/** url|error → last push ts — throttle identical network noise */
const recentNetErrors = new Map();
const NET_ERROR_THROTTLE_MS = 15_000;

/** @type {string | null} */
let logsDir = null;
/** @type {string | null} */
let liveLogFile = null;
/** @type {Promise<void>} */
let writeChain = Promise.resolve();

const REDACT_RE = [
  /([?&](?:token|access_token|refresh_token|authorization|password|passwd|api[_-]?key)=)[^&]+/gi,
  /(Bearer\s+)[A-Za-z0-9\-._~+/]+=*/gi,
  /("(?:token|password|profileToken|Authorization)"\s*:\s*")[^"]+"/gi,
];

function sanitise(text) {
  let out = String(text ?? '');
  for (const re of REDACT_RE) {
    out = out.replace(re, (_m, p1) => `${p1}[REDACTED]`);
  }
  if (out.length > 4_000) out = `${out.slice(0, 4_000)}…`;
  return out;
}

function nowIso() {
  return new Date().toISOString();
}

function sessionStamp(date = new Date()) {
  return date.toISOString().replace(/[:.]/g, '-').slice(0, 19);
}

function writeReadme(dir) {
  const marker = path.join(dir, 'README.txt');
  try {
    fs.writeFileSync(
      marker,
      [
        'AnixApp — папка диагностики',
        '',
        'live-YYYY-MM-DDTHH-mm-ss.jsonl  — журнал одной сессии запуска',
        `${CURRENT_POINTER}                 — имя текущего файла сессии`,
        '',
        'При каждом запуске (и после «Очистить») создаётся новый файл.',
        'Старые сессии не затираются — после краша их можно открыть снова.',
        'Хранятся последние ~40 файлов live-*.jsonl.',
        '',
        'ZIP-архивы пользователь сохраняет вручную (по умолчанию в «Документы»).',
        'Токены и пароли в логах маскируются.',
        '',
      ].join('\n'),
      'utf8',
    );
  } catch { /* ignore */ }
}

function writeCurrentPointer(dir, filePath) {
  try {
    fs.writeFileSync(path.join(dir, CURRENT_POINTER), `${path.basename(filePath)}\n`, 'utf8');
  } catch { /* ignore */ }
}

function migrateLegacyLive(dir) {
  const legacy = path.join(dir, LEGACY_LIVE_NAME);
  try {
    if (!fs.existsSync(legacy)) return;
    const st = fs.statSync(legacy);
    if (!st.isFile() || st.size === 0) {
      fs.unlinkSync(legacy);
      return;
    }
    const stamped = path.join(dir, `live-${sessionStamp(st.mtime)}-legacy.jsonl`);
    fs.renameSync(legacy, stamped);
  } catch { /* ignore */ }
}

function pruneOldSessions(dir) {
  try {
    const files = fs.readdirSync(dir)
      .filter((n) => /^live-.+\.jsonl$/i.test(n))
      .map((name) => {
        const full = path.join(dir, name);
        let mtime = 0;
        try { mtime = fs.statSync(full).mtimeMs; } catch { /* ignore */ }
        return { name, full, mtime };
      })
      .sort((a, b) => b.mtime - a.mtime);
    for (const f of files.slice(MAX_SESSION_FILES)) {
      try { fs.unlinkSync(f.full); } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
}

function startNewSessionFile() {
  try {
    logsDir = path.join(app.getPath('userData'), DIAG_DIR_NAME);
    fs.mkdirSync(logsDir, { recursive: true });
    migrateLegacyLive(logsDir);
    writeReadme(logsDir);
    liveLogFile = path.join(logsDir, `live-${sessionStamp()}.jsonl`);
    fs.writeFileSync(liveLogFile, '', 'utf8');
    writeCurrentPointer(logsDir, liveLogFile);
    pruneOldSessions(logsDir);
  } catch (err) {
    console.error('[diagnostics] startNewSessionFile failed', err);
  }
  return { dir: logsDir, file: liveLogFile };
}

function ensureLogPaths() {
  if (logsDir && liveLogFile) return { dir: logsDir, file: liveLogFile };
  return startNewSessionFile();
}

function appendToLiveFile(entry) {
  const { file } = ensureLogPaths();
  if (!file) return;
  const line = `${JSON.stringify(entry)}\n`;
  writeChain = writeChain
    .then(() => fs.promises.appendFile(file, line, 'utf8'))
    .catch(() => { /* ignore disk errors */ });
}

function getPaths() {
  const { dir, file } = ensureLogPaths();
  let zipDefaultDir = '';
  try {
    zipDefaultDir = app.getPath('documents');
  } catch { /* ignore */ }
  return {
    dir: dir || '',
    file: file || '',
    zipDefaultDir,
  };
}

function openLogsDir() {
  const { dir } = ensureLogPaths();
  if (!dir) return { ok: false };
  try {
    const { shell } = require('electron');
    shell.openPath(dir);
    return { ok: true, path: dir };
  } catch {
    return { ok: false };
  }
}

function windowLabel(contents) {
  try {
    const win = BrowserWindow.fromWebContents(contents);
    if (win && !win.isDestroyed()) {
      const title = win.getTitle();
      if (title) return title.slice(0, 80);
    }
  } catch { /* ignore */ }
  try {
    const url = contents.getURL() || '';
    if (/player\.html/i.test(url)) return 'player';
    if (/admin/i.test(url)) return 'admin';
    if (/composer|create/i.test(url)) return 'composer';
    if (/tool|upscale/i.test(url)) return 'tool';
    if (url) {
      try { return new URL(url).pathname.slice(0, 60) || 'window'; } catch { /* ignore */ }
    }
  } catch { /* ignore */ }
  return contents.getType?.() || 'window';
}

function push(entry) {
  seq += 1;
  const full = {
    id: `d-${seq}`,
    ts: Date.now(),
    iso: nowIso(),
    ...entry,
  };
  if (typeof full.message === 'string') full.message = sanitise(full.message);
  if (typeof full.url === 'string') full.url = sanitise(full.url);
  entries.push(full);
  if (entries.length > MAX_ENTRIES) {
    entries = entries.slice(entries.length - MAX_ENTRIES);
  }
  appendToLiveFile(full);
  broadcast(full);
  return full;
}

function broadcast(entry) {
  if (!subscribers.size) return;
  for (const id of [...subscribers]) {
    try {
      const wins = BrowserWindow.getAllWindows();
      const win = wins.find((w) => !w.isDestroyed() && w.webContents.id === id);
      if (!win) {
        subscribers.delete(id);
        continue;
      }
      win.webContents.send('diagnostics:entry', entry);
    } catch {
      subscribers.delete(id);
    }
  }
}

/** Шум от ads/metrika в sandbox iframe (Kodik и т.п.) — не полезен в диагностике. */
function isNoisyConsoleMessage(message, sourceId = '') {
  const msg = String(message || '');
  const src = String(sourceId || '');
  if (/Blocked script execution/i.test(msg) && /sandboxed/i.test(msg) && /allow-scripts/i.test(msg)) {
    return true;
  }
  if (/Blocked script execution/i.test(msg) && /data:text\/html/i.test(msg)) {
    return true;
  }
  // Метрика/счётчики внутри data: или пустых about:blank фреймов.
  if (/data:text\/html/i.test(src) && /yandex|metrika|mc\.yandex/i.test(msg)) {
    return true;
  }
  return false;
}

function attachConsole(contents) {
  if (!contents || contents.isDestroyed?.()) return;
  if (contents.__anixDiagConsole) return;
  contents.__anixDiagConsole = true;

  contents.on('console-message', (...args) => {
    // Electron 28+: (event) with details; older: (event, level, message, line, sourceId)
    let level = 1;
    let message = '';
    let line = 0;
    let sourceId = '';
    const first = args[0];
    if (first && typeof first === 'object' && (first.message != null || first.level != null) && args.length === 1) {
      level = Number(first.level ?? 1);
      message = String(first.message ?? '');
      line = Number(first.lineNumber ?? first.line ?? 0);
      sourceId = String(first.sourceId ?? '');
    } else {
      level = Number(args[1] ?? 1);
      message = String(args[2] ?? '');
      line = Number(args[3] ?? 0);
      sourceId = String(args[4] ?? '');
    }
    if (isNoisyConsoleMessage(message, sourceId)) return;
    const kind = CONSOLE_LEVELS[Math.min(3, Math.max(0, level))] || 'info';
    push({
      channel: 'console',
      level: kind,
      message,
      source: sourceId,
      line,
      window: windowLabel(contents),
      wcId: contents.id,
    });
  });

  contents.on('did-fail-load', (_e, errorCode, errorDescription, validatedURL, isMainFrame) => {
    if (!isMainFrame && errorCode === -3) return; // aborted subframe
    push({
      channel: 'navigation',
      level: 'error',
      message: `${errorDescription || 'fail-load'} (${errorCode})`,
      url: validatedURL || '',
      window: windowLabel(contents),
      wcId: contents.id,
    });
  });
}

function attachNetwork(ses) {
  if (!ses || ses.__anixDiagNet) return;
  ses.__anixDiagNet = true;

  const finish = (details, level, extra = {}) => {
    const url = String(details.url || '');
    // Skip noisy local scheme noise
    if (/^(devtools:|chrome-extension:|data:|blob:)/i.test(url)) return;
    // AnixBack settings health probes — intentional, not useful in the live feed.
    if (/\/health(?:\?|$)/i.test(url) && /anixapp\.com|localhost|127\.0\.0\.1|:8787/i.test(url)) {
      return;
    }

    const err = String(extra.error || '');
    // Chromium font/cache probes — not real failures worth flooding the UI.
    if (/ERR_CACHE_MISS/i.test(err)) return;
    if (/ERR_ABORTED/i.test(err) && /font|stylesheet|image|script/i.test(String(details.resourceType || ''))) {
      return;
    }

    if (level === 'error' || level === 'warn') {
      const key = `${details.method || 'GET'}|${url}|${err || details.statusCode || ''}`;
      const last = recentNetErrors.get(key) || 0;
      const now = Date.now();
      if (now - last < NET_ERROR_THROTTLE_MS) return;
      recentNetErrors.set(key, now);
      if (recentNetErrors.size > 400) {
        const oldest = [...recentNetErrors.entries()].sort((a, b) => a[1] - b[1]).slice(0, 100);
        for (const [k] of oldest) recentNetErrors.delete(k);
      }
    }

    push({
      channel: 'network',
      level,
      message: `${details.method || 'GET'} ${details.statusCode || extra.statusCode || ''} ${extra.error || ''}`.trim(),
      url,
      method: details.method || 'GET',
      status: details.statusCode || extra.statusCode || 0,
      fromCache: !!details.fromCache,
      mime: details.mimeType || '',
      resourceType: details.resourceType || '',
      error: extra.error || '',
      window: 'session',
    });
  };

  try {
    ses.webRequest.onCompleted({ urls: ['*://*/*'] }, (details) => {
      const code = details.statusCode || 0;
      const level = code >= 500 ? 'error' : code >= 400 ? 'warn' : 'info';
      finish(details, level);
    });
  } catch { /* ignore */ }

  try {
    ses.webRequest.onErrorOccurred({ urls: ['*://*/*'] }, (details) => {
      finish(details, 'error', { error: details.error || 'net::ERR' });
    });
  } catch { /* ignore */ }
}

function patchMainConsole() {
  if (console.__anixDiagPatched) return;
  console.__anixDiagPatched = true;
  for (const level of ['log', 'info', 'warn', 'error', 'debug']) {
    const orig = console[level].bind(console);
    console[level] = (...args) => {
      try {
        const message = args.map((a) => {
          if (a instanceof Error) return `${a.message}${a.stack ? `\n${a.stack}` : ''}`;
          if (typeof a === 'string') return a;
          try { return JSON.stringify(a); } catch { return String(a); }
        }).join(' ');
        push({
          channel: 'main',
          level: level === 'log' ? 'info' : level,
          message,
          window: 'main',
        });
      } catch { /* ignore */ }
      orig(...args);
    };
  }
}

// ── Minimal ZIP (store + deflate) ───────────────────────────────────────────
const CRC_TABLE = (() => {
  const t = new Uint32Array(256);
  for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
    t[i] = c;
  }
  return t;
})();

function crc32(buf) {
  let c = 0xFFFFFFFF;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
  return (c ^ 0xFFFFFFFF) >>> 0;
}

function buildZip(fileEntries) {
  const locals = [];
  const cdirs = [];
  let offset = 0;
  for (const e of fileEntries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const data = Buffer.isBuffer(e.data) ? e.data : Buffer.from(e.data, 'utf8');
    const comp = zlib.deflateRawSync(data, { level: 6 });
    const crc = crc32(data);
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt16LE(0x0800, 6);
    local.writeUInt16LE(8, 8);
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    nameBuf.copy(local, 30);
    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0);
    cd.writeUInt16LE(20, 4);
    cd.writeUInt16LE(20, 6);
    cd.writeUInt16LE(0x0800, 8);
    cd.writeUInt16LE(8, 10);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt32LE(offset, 42);
    nameBuf.copy(cd, 46);
    locals.push(local, comp);
    cdirs.push(cd);
    offset += local.length + comp.length;
  }
  const cdBuf = Buffer.concat(cdirs);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(cdirs.length, 8);
  eocd.writeUInt16LE(cdirs.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

function install() {
  if (installed) return;
  installed = true;

  ensureLogPaths();
  patchMainConsole();
  attachNetwork(session.defaultSession);

  app.on('session-created', (_e, ses) => {
    attachNetwork(ses);
  });

  app.on('web-contents-created', (_e, contents) => {
    attachConsole(contents);
  });

  // Already-open contents (if any)
  try {
    for (const win of BrowserWindow.getAllWindows()) {
      if (!win.isDestroyed()) attachConsole(win.webContents);
    }
  } catch { /* ignore */ }

  push({
    channel: 'system',
    level: 'info',
    message: 'Diagnostics collector started',
    window: 'main',
    meta: {
      platform: process.platform,
      arch: process.arch,
      release: os.release(),
      cpus: (os.cpus() || []).length,
      totalMemGb: Math.round(os.totalmem() / (1024 ** 3) * 100) / 100,
      electron: process.versions.electron,
      chrome: process.versions.chrome,
      node: process.versions.node,
      app: app.getVersion(),
    },
  });
}

function getEntries({ channel, level, limit = 500, sinceId } = {}) {
  let list = entries;
  if (channel && channel !== 'all') list = list.filter((e) => e.channel === channel);
  if (level && level !== 'all') list = list.filter((e) => e.level === level);
  if (sinceId) {
    const idx = list.findIndex((e) => e.id === sinceId);
    list = idx >= 0 ? list.slice(idx + 1) : list;
  }
  const lim = Math.min(Math.max(1, Number(limit) || 500), MAX_ENTRIES);
  return list.slice(-lim);
}

function clear() {
  entries = [];
  recentNetErrors.clear();
  seq = 0;
  // New dated file — previous session logs stay on disk (crash-safe).
  startNewSessionFile();
  return { ok: true, count: 0 };
}

function subscribe(webContentsId) {
  const id = Number(webContentsId);
  if (Number.isFinite(id)) subscribers.add(id);
  return { ok: true, count: entries.length };
}

function unsubscribe(webContentsId) {
  subscribers.delete(Number(webContentsId));
  return { ok: true };
}

function stats() {
  const byChannel = {};
  const byLevel = {};
  for (const e of entries) {
    byChannel[e.channel] = (byChannel[e.channel] || 0) + 1;
    byLevel[e.level] = (byLevel[e.level] || 0) + 1;
  }
  return {
    total: entries.length,
    max: MAX_ENTRIES,
    subscribers: subscribers.size,
    byChannel,
    byLevel,
  };
}

function formatLine(e) {
  const t = new Date(e.ts).toISOString().slice(11, 23);
  const ch = String(e.channel || '').padEnd(9);
  const lv = String(e.level || '').padEnd(5);
  const win = e.window ? `[${e.window}] ` : '';
  if (e.channel === 'network') {
    return `${t}  ${ch}  ${lv}  ${win}${e.method || ''} ${e.status || ''} ${e.url || ''} ${e.error || ''}`.trim();
  }
  return `${t}  ${ch}  ${lv}  ${win}${e.message || ''}${e.source ? `  @ ${e.source}:${e.line || 0}` : ''}`;
}

function bytesToGb(n) {
  return Math.round((Number(n) || 0) / (1024 ** 3) * 100) / 100;
}

async function collectDeviceInfo() {
  const cpus = os.cpus() || [];
  const cpuModel = String(cpus[0]?.model || '').replace(/\s+/g, ' ').trim();

  let displays = [];
  try {
    const primaryId = screen.getPrimaryDisplay()?.id;
    displays = screen.getAllDisplays().map((d) => ({
      id: d.id,
      primary: d.id === primaryId,
      width: d.size?.width,
      height: d.size?.height,
      scaleFactor: d.scaleFactor,
      rotation: d.rotation,
      colorDepth: d.colorDepth,
      bounds: d.bounds,
    }));
  } catch { /* ignore */ }

  let gpu = null;
  try {
    gpu = await app.getGPUInfo('basic');
  } catch { /* ignore */ }

  let gpuFeatureStatus = null;
  try {
    gpuFeatureStatus = app.getGPUFeatureStatus?.() ?? null;
  } catch { /* ignore */ }

  let processMemory = null;
  try {
    processMemory = process.getSystemMemoryInfo?.() ?? null;
  } catch { /* ignore */ }

  let anixapi = '';
  try {
    anixapi = require('anixapi/package.json').version || '';
  } catch { /* ignore */ }

  return {
    collectedAt: nowIso(),
    app: {
      name: app.getName(),
      version: app.getVersion(),
      locale: app.getLocale(),
      systemLocale: typeof app.getSystemLocale === 'function' ? app.getSystemLocale() : '',
      isPackaged: app.isPackaged,
      anixapi,
    },
    os: {
      platform: os.platform(),
      type: os.type(),
      release: os.release(),
      arch: os.arch(),
      endianness: os.endianness(),
      uptimeSec: Math.round(os.uptime()),
      hostname: os.hostname(),
    },
    cpu: {
      model: cpuModel,
      cores: cpus.length,
      speedMHz: cpus[0]?.speed || 0,
    },
    memory: {
      totalBytes: os.totalmem(),
      freeBytes: os.freemem(),
      totalGb: bytesToGb(os.totalmem()),
      freeGb: bytesToGb(os.freemem()),
      process: processMemory,
    },
    displays,
    versions: { ...process.versions },
    gpu,
    gpuFeatureStatus,
  };
}

function buildReadme({ device, counts, eventCount }) {
  const cpu = device.cpu?.model || '—';
  const ram = `${device.memory?.totalGb ?? '—'} ГБ`;
  const osLine = `${device.os?.type || ''} ${device.os?.release || ''} (${device.os?.arch || ''})`.trim();
  const displayLine = (device.displays || [])
    .map((d) => `${d.width}×${d.height}@${d.scaleFactor}x${d.primary ? ' primary' : ''}`)
    .join(', ') || '—';
  const paths = getPaths();

  return [
    'AnixApp — диагностический архив',
    '================================',
    '',
    'Что внутри:',
    '  README.txt      — этот файл',
    '  device.json     — характеристики устройства (ОС, CPU, RAM, мониторы, GPU, версии)',
    '  meta.json       — сводка экспорта и счётчики событий',
    '  console.txt     — консоль renderer + main + system + navigation (текст)',
    '  network.txt     — сетевые запросы (метод, статус, URL)',
    '  events.jsonl    — полный журнал событий (по строке JSON на событие)',
    '',
    'На диске у пользователя (живой журнал):',
    `  Папка:  ${paths.dir || '—'}`,
    `  Файл:   ${paths.file || '—'}`,
    '',
    'Приватность:',
    '  Токены, пароли и Bearer в текстах/URL маскируются как [REDACTED].',
    '  Логины, пути домашней папки и содержимое файлов не включаются.',
    '',
    'Кратко об устройстве:',
    `  Приложение:  AnixApp ${device.app?.version || '—'}`,
    `  ОС:          ${osLine}`,
    `  CPU:         ${cpu} × ${device.cpu?.cores || '?'}`,
    `  RAM:         ${ram} (свободно ${device.memory?.freeGb ?? '—'} ГБ)`,
    `  Мониторы:    ${displayLine}`,
    `  Electron:    ${device.versions?.electron || '—'}`,
    `  Chrome:      ${device.versions?.chrome || '—'}`,
    '',
    `Событий в архиве: ${eventCount}`,
    counts?.byChannel
      ? `По каналам: ${Object.entries(counts.byChannel).map(([k, v]) => `${k}=${v}`).join(', ')}`
      : '',
    '',
    `Экспорт: ${device.collectedAt || nowIso()}`,
    '',
  ].filter(Boolean).join('\n');
}

const ZIP_CONTENTS_MESSAGE = [
  'В ZIP войдёт:',
  '',
  '• device.json — ОС, CPU, RAM, мониторы, GPU, версии Electron/Chrome/Node',
  '• meta.json — сводка и счётчики',
  '• console.txt — логи консоли (окна + main)',
  '• network.txt — сетевые запросы (URL без токенов)',
  '• events.jsonl — полный журнал событий',
  '• README.txt — описание содержимого',
  '',
  'Живой журнал также пишется в папку diagnostics внутри данных приложения.',
  'Пароли и токены маскируются. Учётные данные и файлы не копируются.',
].join('\n');

async function exportZipWithDialog(browserWindow) {
  const parent = browserWindow && !browserWindow.isDestroyed() ? browserWindow : undefined;

  const confirm = await dialog.showMessageBox(parent, {
    type: 'info',
    buttons: ['Сохранить ZIP', 'Отмена'],
    defaultId: 0,
    cancelId: 1,
    title: 'Диагностический ZIP',
    message: 'Собрать логи и характеристики устройства?',
    detail: ZIP_CONTENTS_MESSAGE,
    noLink: true,
  });
  if (confirm.response !== 0) return { ok: false, canceled: true };

  const stamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
  const defaultPath = path.join(app.getPath('documents'), `anixapp-diagnostics-${stamp}.zip`);
  const { canceled, filePath } = await dialog.showSaveDialog(parent, {
    title: 'Сохранить диагностику',
    defaultPath,
    filters: [{ name: 'ZIP', extensions: ['zip'] }],
  });
  if (canceled || !filePath) return { ok: false, canceled: true };

  const all = entries.slice();
  const counts = stats();
  const device = await collectDeviceInfo();
  const consoleLines = all
    .filter((e) => e.channel === 'console' || e.channel === 'main' || e.channel === 'system' || e.channel === 'navigation')
    .map(formatLine)
    .join('\n');
  const networkLines = all.filter((e) => e.channel === 'network').map(formatLine).join('\n');
  const meta = {
    exportedAt: nowIso(),
    appVersion: device.app?.version,
    electron: device.versions?.electron,
    chrome: device.versions?.chrome,
    node: device.versions?.node,
    platform: `${device.os?.platform || ''} ${device.os?.release || ''} ${device.os?.arch || ''}`.trim(),
    cpu: device.cpu,
    memoryGb: { total: device.memory?.totalGb, free: device.memory?.freeGb },
    displays: device.displays,
    logPaths: getPaths(),
    counts,
    contents: [
      'README.txt',
      'device.json',
      'meta.json',
      'console.txt',
      'network.txt',
      'events.jsonl',
    ],
  };

  const zip = buildZip([
    { name: 'README.txt', data: buildReadme({ device, counts, eventCount: all.length }) },
    { name: 'device.json', data: JSON.stringify(device, null, 2) },
    { name: 'meta.json', data: JSON.stringify(meta, null, 2) },
    { name: 'events.jsonl', data: all.map((e) => JSON.stringify(e)).join('\n') + '\n' },
    { name: 'console.txt', data: consoleLines + '\n' },
    { name: 'network.txt', data: networkLines + '\n' },
  ]);

  fs.writeFileSync(filePath, zip);
  return { ok: true, path: filePath, count: all.length, deviceSummary: {
    os: meta.platform,
    cpu: device.cpu?.model,
    ramGb: device.memory?.totalGb,
  } };
}

module.exports = {
  install,
  getEntries,
  clear,
  subscribe,
  unsubscribe,
  stats,
  exportZipWithDialog,
  collectDeviceInfo,
  getPaths,
  openLogsDir,
  formatLine,
};
