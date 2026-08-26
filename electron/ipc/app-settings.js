'use strict';

const path = require('path');
const fs = require('fs');
const { ipcMain, app, BrowserWindow } = require('electron');
const config = require('../lib/config-store');
const state = require('../lib/app-state');

function register(deps) {
  const {
    applyUiZoom,
    discordRpc,
    discord,
  } = deps;

// ——— App settings ———

function normalizePlayerHotkeys(raw) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const allowedSeek = [5, 10, 15, 30, 60, 90];
  const seekRaw = typeof src.seekSeconds === 'number' ? src.seekSeconds : 10;
  let seekSeconds = 10;
  let best = Infinity;
  for (const n of allowedSeek) {
    const d = Math.abs(n - seekRaw);
    if (d < best) { best = d; seekSeconds = n; }
  }
  const pick = (value, fallback) => (typeof value === 'string' ? value : fallback);
  return {
    seekBackCode: pick(src.seekBackCode, 'ArrowLeft'),
    seekForwardCode: pick(src.seekForwardCode, 'ArrowRight'),
    playPauseCode: pick(src.playPauseCode, 'Space'),
    volumeUpCode: pick(src.volumeUpCode, 'ArrowUp'),
    volumeDownCode: pick(src.volumeDownCode, 'ArrowDown'),
    fullscreenCode: pick(src.fullscreenCode, 'KeyF'),
    alwaysOnTopCode: pick(src.alwaysOnTopCode, 'KeyP'),
    seekSeconds,
    ctrlWheelSpeed: src.ctrlWheelSpeed !== false,
  };
}

ipcMain.handle('app:getSettings', () => {
  try {
    const p = config.getConfigPath();
    const data = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
    return {
      minimizeToTray: config.getMinimizeToTray(),
      adaptiveAcceleration: config.getAdaptiveAcceleration(),
      upscaleEnabled: data.upscaleEnabled === true,
      upscaleMode: typeof data.upscaleMode === 'number' ? data.upscaleMode : 15,
      upscaleType: typeof data.upscaleType === 'string' ? data.upscaleType : undefined,
      upscaleIntensity: typeof data.upscaleIntensity === 'string' ? data.upscaleIntensity : undefined,
      upscaleTargetRes: typeof data.upscaleTargetRes === 'string' ? data.upscaleTargetRes : undefined,
      audioSurround: typeof data.audioSurround === 'string' ? data.audioSurround : 'off',
      audioEqGains: data.audioEqGains && typeof data.audioEqGains === 'object' && !Array.isArray(data.audioEqGains)
        ? { ...data.audioEqGains }
        : undefined,
      audioEqLevel: typeof data.audioEqLevel === 'number' ? data.audioEqLevel : 0,
      playerDebugOverlay: data.playerDebugOverlay === true,
      adaptiveQualityByWindow: data.adaptiveQualityByWindow === true,
      playerHotkeys: normalizePlayerHotkeys(data.playerHotkeys),
      uiZoom: config.getUiZoom(),
      ...config.buildDiscordRpcSettingsPayload(data),
    };
  } catch (_) {
    return {
      minimizeToTray: config.getMinimizeToTray(),
      adaptiveAcceleration: config.getAdaptiveAcceleration(),
      upscaleEnabled: false,
      upscaleMode: 15,
      upscaleType: undefined,
      upscaleIntensity: undefined,
      upscaleTargetRes: undefined,
      audioSurround: 'off',
      audioEqGains: undefined,
      audioEqLevel: 0,
      playerDebugOverlay: false,
      adaptiveQualityByWindow: false,
      playerHotkeys: normalizePlayerHotkeys(null),
      uiZoom: 100,
      ...config.buildDiscordRpcSettingsPayload({}),
    };
  }
});

ipcMain.handle('app:saveSettings', (_, settings) => {
  if (settings && typeof settings === 'object') {
    const payload = { ...settings };
    if (settings.playerHotkeys && typeof settings.playerHotkeys === 'object') {
      payload.playerHotkeys = normalizePlayerHotkeys(settings.playerHotkeys);
    }
    config.saveConfig(payload);
    if (payload.playerHotkeys) {
      for (const win of BrowserWindow.getAllWindows()) {
        if (!win.isDestroyed()) {
          win.webContents.send('player:hotkeysChanged', payload.playerHotkeys);
        }
      }
    }
    if (typeof settings.uiZoom === 'number') {
      applyUiZoom(settings.uiZoom);
    }
    if (typeof settings.discordRpcEnabled === 'boolean' && discordRpc) {
      discordRpc.setPaused(!settings.discordRpcEnabled);
      if (settings.discordRpcEnabled && state.mainWindow && !state.mainWindow.isDestroyed()) {
        discordRpc.setMainWindow(state.mainWindow);
        if (config.getDiscordRpcShowBrowsing()) {
          discordRpc.setBrowsing(state.discordSessionStart);
        }
      }
    }
    if (typeof settings.discordRpcShowBrowsing === 'boolean' && discordRpc && config.getDiscordRpcEnabled()) {
      if (config.getDiscordRpcShowBrowsing()) {
        discordRpc.setBrowsing(state.discordSessionStart);
      } else {
        discord.setDiscordGenericInApp();
      }
    }
    if (
      settings.discordRpcShowWatching !== undefined
      || settings.discordRpcShowProgress !== undefined
      || settings.discordRpcShowDubber !== undefined
      || settings.discordRpcShowImages !== undefined
    ) {
      discord.applyDiscordRpcOptionsFromSettings();
    }
    if (typeof settings.playerDebugOverlay === 'boolean' && state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
      state.playerWindowRef.webContents.send('player:debugOverlay', settings.playerDebugOverlay);
    }
    if (typeof settings.adaptiveQualityByWindow === 'boolean' && state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
      state.playerWindowRef.webContents.send('player:adaptiveQuality', settings.adaptiveQualityByWindow);
    }
  }
});
}

module.exports = { register };
