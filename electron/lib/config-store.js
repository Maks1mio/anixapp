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
};
