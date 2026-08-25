'use strict';

const path = require('path');
const fs = require('fs');
const { app } = require('electron');
const { randomBytes } = require('crypto');

const {
  AUTH_FILE,
  DEFAULT_BASE_URL,
  LOG_DIR,
  UI_ZOOM_LEVELS,
  DISCORD_RPC_PAGE_KEYS,
} = require('./constants');

let _configCache = null;

function getConfigPath() {
  return path.join(app.getPath('userData'), AUTH_FILE);
}

function _readConfigFromDisk() {
  try {
    const p = getConfigPath();
    if (fs.existsSync(p)) return JSON.parse(fs.readFileSync(p, 'utf8'));
  } catch (_) {}
  return {};
}

function primeConfigCache() {
  if (_configCache === null) _configCache = _readConfigFromDisk();
}

function getMinimizeToTray() {
  const data = _configCache ?? _readConfigFromDisk();
  return data.minimizeToTray === true;
}

function getAdaptiveAcceleration() {
  const data = _configCache ?? _readConfigFromDisk();
  return data.adaptiveAcceleration !== false;
}

function getUiZoom() {
  const data = _configCache ?? _readConfigFromDisk();
  const z = Number(data.uiZoom);
  return UI_ZOOM_LEVELS.includes(z) ? z : 100;
}

function getDiscordRpcEnabled() {
  const data = _configCache ?? _readConfigFromDisk();
  return data.discordRpcEnabled !== false;
}

function getDiscordRpcShowBrowsing() {
  const data = _configCache ?? _readConfigFromDisk();
  return data.discordRpcShowBrowsing !== false;
}

function getDiscordRpcShowWatching() {
  const data = _configCache ?? _readConfigFromDisk();
  return data.discordRpcShowWatching !== false;
}

function getDiscordRpcShowProgress() {
  const data = _configCache ?? _readConfigFromDisk();
  return data.discordRpcShowProgress !== false;
}

function getDiscordRpcShowDubber() {
  const data = _configCache ?? _readConfigFromDisk();
  return data.discordRpcShowDubber !== false;
}

function getDiscordRpcShowImages() {
  const data = _configCache ?? _readConfigFromDisk();
  return data.discordRpcShowImages !== false;
}

function getDiscordRpcShowParty() {
  const data = _configCache ?? _readConfigFromDisk();
  return data.discordRpcShowParty !== false;
}

function readDiscordRpcPageFlags(data) {
  const out = {};
  for (const key of DISCORD_RPC_PAGE_KEYS) {
    out[key] = data[key] !== false;
  }
  return out;
}

function buildDiscordRpcSettingsPayload(data) {
  return {
    discordRpcEnabled: getDiscordRpcEnabled(),
    discordRpcShowBrowsing: getDiscordRpcShowBrowsing(),
    discordRpcShowWatching: getDiscordRpcShowWatching(),
    discordRpcShowProgress: getDiscordRpcShowProgress(),
    discordRpcShowDubber: getDiscordRpcShowDubber(),
    discordRpcShowImages: getDiscordRpcShowImages(),
    discordRpcShowParty: getDiscordRpcShowParty(),
    ...readDiscordRpcPageFlags(data),
  };
}

function getLogDir() {
  const dir = path.join(app.getPath('userData'), LOG_DIR);
  try {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  } catch (err) {
    console.error('Failed to ensure log dir', err);
  }
  return dir;
}

function appendLog(name, payload, isDev) {
  if (!isDev) return;
  try {
    const dir = getLogDir();
    const file = path.join(dir, `${name}.log`);
    const line = `[${new Date().toISOString()}] ${JSON.stringify(payload)}\n`;
    fs.appendFile(file, line, () => {});
  } catch (err) {
    console.error('Failed to write log', err);
  }
}

function loadConfig() {
  const raw = _readConfigFromDisk();
  const cfg = {
    token: raw.token || null,
    baseUrl: raw.baseUrl || DEFAULT_BASE_URL,
    profileId: raw.profileId ?? null,
    profileLogin: raw.profileLogin || null,
    profileAvatar: raw.profileAvatar || null,
    profileRaw: raw.profileRaw || null,
    deviceId: raw.deviceId || null,
  };
  if (_configCache === null) _configCache = raw;
  return cfg;
}

function saveConfig(updates) {
  try {
    const p = getConfigPath();
    const raw = _configCache ?? _readConfigFromDisk();
    const next = { ...raw, ...updates };
    fs.writeFileSync(p, JSON.stringify(next), 'utf8');
    _configCache = next;
  } catch (err) {
    console.error('Failed to save config', err);
  }
}

function getOrCreateDeviceId() {
  try {
    const current = loadConfig();
    if (current.deviceId && typeof current.deviceId === 'string') {
      return current.deviceId;
    }
    const id = randomBytes(16).toString('hex');
    saveConfig({ deviceId: id });
    return id;
  } catch (err) {
    console.error('Failed to get/create deviceId', err);
    return 'unknown-device';
  }
}

function loadSavedToken() {
  return loadConfig().token;
}

function getRawConfig() {
  return _configCache ?? _readConfigFromDisk();
}

function getDownloadDirectoryFromConfig() {
  const raw = _configCache ?? _readConfigFromDisk();
  return typeof raw.downloadDirectory === 'string' ? raw.downloadDirectory.trim() : '';
}

const BUILTIN_HLS_MODES = new Set(['max', 'balanced', 'safe', 'custom']);
const HLS_CONCURRENCY_MIN = 1;
const HLS_CONCURRENCY_MAX = 10000;
/** Сколько файлов качать одновременно. 1 = как Kodik-Download-Watch (быстрее всего). */
const PARALLEL_FILES_MIN = 1;
const PARALLEL_FILES_MAX = 50;

function clampHlsConcurrency(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 32;
  return Math.min(HLS_CONCURRENCY_MAX, Math.max(HLS_CONCURRENCY_MIN, v));
}

function clampParallelFiles(n) {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return 1;
  return Math.min(PARALLEL_FILES_MAX, Math.max(PARALLEL_FILES_MIN, v));
}

function normalizeHlsPresets(raw) {
  if (!Array.isArray(raw)) return [];
  const out = [];
  const seen = new Set();
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue;
    const id = typeof item.id === 'string' ? item.id.trim() : '';
    const name = typeof item.name === 'string' ? item.name.trim().slice(0, 40) : '';
    if (!id || !name || seen.has(id) || BUILTIN_HLS_MODES.has(id)) continue;
    seen.add(id);
    out.push({
      id,
      name,
      concurrency: clampHlsConcurrency(item.concurrency),
    });
    if (out.length >= 20) break;
  }
  return out;
}

/** @returns {'max'|'balanced'|'safe'|'custom'|string} */
function getDownloadHlsMode() {
  const raw = _configCache ?? _readConfigFromDisk();
  const mode = typeof raw.downloadHlsMode === 'string' ? raw.downloadHlsMode.trim() : '';
  if (BUILTIN_HLS_MODES.has(mode)) return mode;
  const presets = normalizeHlsPresets(raw.downloadHlsPresets);
  if (presets.some((p) => p.id === mode)) return mode;
  return 'max';
}

function getDownloadHlsConcurrency() {
  const raw = _configCache ?? _readConfigFromDisk();
  return clampHlsConcurrency(raw.downloadHlsConcurrency ?? 32);
}

function getDownloadHlsPresets() {
  const raw = _configCache ?? _readConfigFromDisk();
  return normalizeHlsPresets(raw.downloadHlsPresets);
}

/** Число параллельных сегментов — всегда max (все сегменты файла). */
function resolveDownloadHlsConcurrency() {
  return Number.POSITIVE_INFINITY;
}

/** true = качать все файлы сразу; false = по очереди (1 файл). */
function getDownloadAllAtOnce() {
  const raw = _configCache ?? _readConfigFromDisk();
  return raw.downloadAllAtOnce === true;
}

/** Сколько файлов качать одновременно. */
function getDownloadParallelFiles() {
  return getDownloadAllAtOnce() ? PARALLEL_FILES_MAX : 1;
}

function getDownloadOrganizeByTitle() {
  const raw = _configCache ?? _readConfigFromDisk();
  return raw.downloadOrganizeByTitle !== false;
}

function getDownloadAutoClearFinished() {
  const raw = _configCache ?? _readConfigFromDisk();
  return raw.downloadAutoClearFinished !== false;
}

function buildDownloadSettingsPayload(data) {
  const src = data && typeof data === 'object' ? data : (_configCache ?? _readConfigFromDisk());
  return {
    organizeByTitle: src.downloadOrganizeByTitle !== false,
    allAtOnce: src.downloadAllAtOnce === true,
    autoClearFinished: src.downloadAutoClearFinished !== false,
  };
}

module.exports = {
  _configCache: {
    get value() { return _configCache; },
    set value(v) { _configCache = v; },
  },
  getConfigPath,
  _readConfigFromDisk,
  primeConfigCache,
  getMinimizeToTray,
  getAdaptiveAcceleration,
  getUiZoom,
  getDiscordRpcEnabled,
  getDiscordRpcShowBrowsing,
  getDiscordRpcShowWatching,
  getDiscordRpcShowProgress,
  getDiscordRpcShowDubber,
  getDiscordRpcShowImages,
  getDiscordRpcShowParty,
  readDiscordRpcPageFlags,
  buildDiscordRpcSettingsPayload,
  getLogDir,
  appendLog,
  loadConfig,
  saveConfig,
  getOrCreateDeviceId,
  loadSavedToken,
  getRawConfig,
  getDownloadDirectoryFromConfig,
  getDownloadHlsMode,
  getDownloadHlsConcurrency,
  getDownloadHlsPresets,
  resolveDownloadHlsConcurrency,
  clampHlsConcurrency,
  clampParallelFiles,
  normalizeHlsPresets,
  getDownloadAllAtOnce,
  getDownloadParallelFiles,
  getDownloadOrganizeByTitle,
  getDownloadAutoClearFinished,
  buildDownloadSettingsPayload,
  HLS_CONCURRENCY_MIN,
  HLS_CONCURRENCY_MAX,
  PARALLEL_FILES_MIN,
  PARALLEL_FILES_MAX,
  BUILTIN_HLS_MODES,
};
