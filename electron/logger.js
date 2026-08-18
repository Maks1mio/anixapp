'use strict';
const fs   = require('fs');
const path = require('path');
const os   = require('os');
const zlib = require('zlib');

const MAX_SESSIONS    = 5;
const MAX_FILE_BYTES  = 4 * 1024 * 1024; // 4 MB per log file

// ── CRC-32 table (for ZIP) ───────────────────────────────────────────────────
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

// ── Minimal ZIP writer (no external deps) ───────────────────────────────────
function buildZip(entries) {
  // entries: [{ name: string, data: Buffer }]
  const locals = [];
  const cdirs  = [];
  let   offset = 0;

  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, 'utf8');
    const comp    = zlib.deflateRawSync(e.data, { level: 6 });
    const crc     = crc32(e.data);

    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0);   // local sig
    local.writeUInt16LE(20, 4);           // version needed
    local.writeUInt16LE(0x0800, 6);       // UTF-8 flag
    local.writeUInt16LE(8, 8);            // deflate
    local.writeUInt16LE(0, 10);           // mod time
    local.writeUInt16LE(0, 12);           // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(comp.length, 18);
    local.writeUInt32LE(e.data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28);
    nameBuf.copy(local, 30);

    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0);      // cd sig
    cd.writeUInt16LE(20, 4);             // made by
    cd.writeUInt16LE(20, 6);             // needed
    cd.writeUInt16LE(0x0800, 8);         // UTF-8
    cd.writeUInt16LE(8, 10);             // deflate
    cd.writeUInt16LE(0, 12);
    cd.writeUInt16LE(0, 14);
    cd.writeUInt32LE(crc, 16);
    cd.writeUInt32LE(comp.length, 20);
    cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); cd.writeUInt16LE(0, 32);
    cd.writeUInt16LE(0, 34); cd.writeUInt16LE(0, 36);
    cd.writeUInt32LE(0, 38);
    cd.writeUInt32LE(offset, 42);
    nameBuf.copy(cd, 46);

    locals.push(local, comp);
    cdirs.push(cd);
    offset += local.length + comp.length;
  }

  const cdBuf = Buffer.concat(cdirs);
  const eocd  = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(cdirs.length, 8);
  eocd.writeUInt16LE(cdirs.length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...locals, cdBuf, eocd]);
}

// ── Sanitise: strip tokens / passwords from a log string ────────────────────
const REDACT_RE = [
  /"token"\s*:\s*"[^"]{4,}"/gi,
  /"password"\s*:\s*"[^"]{1,}"/gi,
  /"profileToken"\s*:\s*\{[^}]+\}/gi,
  /Authorization:\s*\S+/gi,
  /Bearer\s+[A-Za-z0-9\-._~+/]+=*/g,
];
function sanitise(text) {
  let out = text;
  for (const re of REDACT_RE) out = out.replace(re, (m) => m.split(':')[0] + ':"[REDACTED]"');
  return out;
}

// ── System info (no hostname for privacy) ───────────────────────────────────
function buildSystemInfo(appVersion, electronVersion) {
  const cpus  = os.cpus();
  return {
    collected_at: new Date().toISOString(),
    app: { version: appVersion, electron: electronVersion, node: process.versions.node, chrome: process.versions.chrome },
    os:  { platform: os.platform(), arch: os.arch(), release: os.release(), type: os.type() },
    cpu: { model: cpus[0]?.model ?? 'unknown', cores: cpus.length, speedMHz: cpus[0]?.speed ?? 0 },
    memory: { totalMB: Math.round(os.totalmem() / 1024 / 1024), freeMB: Math.round(os.freemem() / 1024 / 1024) },
  };
}

// ── State ────────────────────────────────────────────────────────────────────
let _sessionsRoot = null;   // <userData>/logs/sessions/
let _sessionDir   = null;   // current session dir
let _logsRoot     = null;   // <userData>/logs
let _appVersion   = '';
let _electronVersion = '';

// ── Helpers ─────────────────────────────────────────────────────────────────
function sessionTimestamp() {
  const d = new Date();
  const pad = (n, l = 2) => String(n).padStart(l, '0');
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}T${pad(d.getHours())}-${pad(d.getMinutes())}-${pad(d.getSeconds())}`;
}

function pruneSessions(root) {
  try {
    const dirs = fs.readdirSync(root)
      .filter(n => /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(n))
      .sort();                          // oldest first (alphabetical = chronological)
    while (dirs.length >= MAX_SESSIONS) {
      const old = dirs.shift();
      fs.rmSync(path.join(root, old), { recursive: true, force: true });
    }
  } catch (_) {}
}

function rotateIfNeeded(filePath) {
  try {
    if (fs.statSync(filePath).size >= MAX_FILE_BYTES) {
      fs.renameSync(filePath, filePath.replace(/\.log$/, '.1.log'));
    }
  } catch (_) {}
}

function writeLobbyPlain(line) {
  const text = String(line || '').replace(/\r?\n/g, ' ').trim();
  if (!text) return;
  const row = `${text}\n`;
  const targets = [];
  if (_sessionDir) targets.push(path.join(_sessionDir, 'lobby.txt'));
  if (_logsRoot) targets.push(path.join(_logsRoot, 'lobby.txt'));
  for (const fp of targets) {
    try { fs.appendFile(fp, row, 'utf8', () => {}); } catch (_) {}
  }
}

function writeLobbyHeader() {
  const header = [
    'AnixApp — журнал совместного просмотра',
    `сессия: ${_sessionDir || ''}`,
    `старт: ${new Date().toISOString()}`,
    'колонки: время | кто | действие | серия/таймкод',
    '---',
    '',
  ].join('\n');
  const files = [];
  if (_sessionDir) files.push(path.join(_sessionDir, 'lobby.txt'));
  if (_logsRoot) files.push(path.join(_logsRoot, 'lobby.txt'));
  for (const fp of files) {
    try { fs.writeFileSync(fp, header, 'utf8'); } catch (_) {}
  }
}

function writeLog(file, level, ch, msg, data, sync = false) {
  if (!_sessionDir) return;
  try {
    const fp   = path.join(_sessionDir, `${file}.log`);
    rotateIfNeeded(fp);
    const entry = { ts: new Date().toISOString(), level, ch, msg };
    if (data !== undefined && data !== null) entry.data = data;
    const line = JSON.stringify(entry) + '\n';
    if (sync) { fs.appendFileSync(fp, line, 'utf8'); }
    else       { fs.appendFile(fp, line, 'utf8', () => {}); }
    if (level === 'ERROR' && file !== 'errors') {
      const errFp = path.join(_sessionDir, 'errors.log');
      rotateIfNeeded(errFp);
      fs.appendFileSync(errFp, line, 'utf8');
    }
  } catch (_) {}
}

// ── Public API ───────────────────────────────────────────────────────────────
function init(userData, appVer, electronVer) {
  _appVersion      = appVer || '';
  _electronVersion = electronVer || '';
  _logsRoot        = path.join(userData, 'logs');
  _sessionsRoot    = path.join(_logsRoot, 'sessions');

  try { fs.mkdirSync(_sessionsRoot, { recursive: true }); } catch (_) {}

  pruneSessions(_sessionsRoot);

  const ts     = sessionTimestamp();
  _sessionDir  = path.join(_sessionsRoot, ts);
  try { fs.mkdirSync(_sessionDir, { recursive: true }); } catch (_) {}
  writeLobbyHeader();

  // Process-level capture
  process.on('uncaughtException',   (err) => writeLog('errors', 'ERROR', 'process', 'uncaughtException',   { message: err.message, stack: err.stack }, true));
  process.on('unhandledRejection',  (r)   => {
    const msg   = r instanceof Error ? r.message : String(r);
    const stack = r instanceof Error ? r.stack   : undefined;
    writeLog('errors', 'ERROR', 'process', 'unhandledRejection', { message: msg, stack }, true);
  });
}

function patchConsole() {
  const origErr  = console.error.bind(console);
  const origWarn = console.warn.bind(console);
  console.error = (...args) => {
    origErr(...args);
    const msg = args.map(a => (a instanceof Error ? `${a.message}\n${a.stack}` : String(a))).join(' ');
    writeLog('errors', 'ERROR', 'main', msg, undefined, true);
  };
  console.warn = (...args) => {
    origWarn(...args);
    writeLog('main', 'WARN', 'main', args.map(String).join(' '), undefined, false);
  };
}

// Returns list of {id, ts, path} for all sessions (newest first)
function getSessions() {
  if (!_sessionsRoot) return [];
  try {
    return fs.readdirSync(_sessionsRoot)
      .filter(n => /^\d{4}-\d{2}-\d{2}T\d{2}-\d{2}-\d{2}$/.test(n))
      .sort().reverse()
      .map(n => ({ id: n, ts: n, dir: path.join(_sessionsRoot, n) }));
  } catch { return []; }
}

// Returns parsed log entries for a session + file (last N lines)
function getSessionLog(sessionId, file, limit = 500) {
  if (!_sessionsRoot) return [];
  const safeName = path.basename(sessionId);
  if (file === 'lobby') {
    const txt = path.join(_sessionsRoot, safeName, 'lobby.txt');
    try {
      if (!fs.existsSync(txt)) return [];
      const lines = fs.readFileSync(txt, 'utf8').split('\n').filter(Boolean);
      return lines.slice(-limit).map((msg) => ({ ts: '', level: 'INFO', ch: 'lobby', msg }));
    } catch { return []; }
  }
  const fp = path.join(_sessionsRoot, safeName, `${file}.log`);
  try {
    if (!fs.existsSync(fp)) return [];
    const lines = fs.readFileSync(fp, 'utf8').trim().split('\n').filter(Boolean);
    return lines.slice(-limit).map(l => { try { return JSON.parse(l); } catch { return { ts: '', level: 'INFO', ch: 'raw', msg: l }; } });
  } catch { return []; }
}

// Build ZIP buffer: sanitised logs + system_info.json
function collectZip() {
  const sessions = getSessions();
  const entries  = [];
  const logs     = ['main.log', 'ipc.log', 'renderer.log', 'errors.log', 'lobby.txt'];

  for (const sess of sessions) {
    for (const logFile of logs) {
      const fp = path.join(sess.dir, logFile);
      if (!fs.existsSync(fp)) continue;
      try {
        const raw  = fs.readFileSync(fp, 'utf8');
        const safe = sanitise(raw);
        entries.push({ name: `${sess.id}/${logFile}`, data: Buffer.from(safe, 'utf8') });
      } catch (_) {}
    }
  }

  const sysInfo = buildSystemInfo(_appVersion, _electronVersion);
  entries.push({ name: 'system_info.json', data: Buffer.from(JSON.stringify(sysInfo, null, 2), 'utf8') });

  return buildZip(entries);
}

function getSystemInfo() {
  return buildSystemInfo(_appVersion, _electronVersion);
}

function getCurrentSessionDir() { return _sessionDir; }

function getLogsRootDir() {
  return _sessionsRoot ? path.dirname(_sessionsRoot) : null;
}

const logger = {
  init,
  patchConsole,
  debug:    (ch, msg, data) => writeLog('main',   'DEBUG', ch, msg, data),
  info:     (ch, msg, data) => writeLog('main',   'INFO',  ch, msg, data),
  warn:     (ch, msg, data) => writeLog('main',   'WARN',  ch, msg, data),
  error:    (ch, msg, data) => writeLog('errors', 'ERROR', ch, msg, data, true),
  ipc:      (ch, dir, data) => writeLog('ipc',    'INFO',  'ipc', `${dir} ${ch}`, data),
  update:   (msg, data)     => writeLog('main',   'INFO',  'update', msg, data),
  renderer: (level, ch, msg, data) => {
    if (ch === 'lobby' || String(ch).startsWith('lobby')) {
      writeLobbyPlain(msg);
      return;
    }
    const file = level === 'ERROR' ? 'errors' : 'renderer';
    writeLog(file, level, `renderer:${ch}`, msg, data, level === 'ERROR');
  },
  getSessions,
  getSessionLog,
  collectZip,
  getSystemInfo,
  getCurrentSessionDir,
  getLogsRootDir,
  getLobbyLogPath: () => {
    if (_sessionDir) return path.join(_sessionDir, 'lobby.txt');
    if (_logsRoot) return path.join(_logsRoot, 'lobby.txt');
    return null;
  },
  writeLobbyPlain,
};

module.exports = logger;
