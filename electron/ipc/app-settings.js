'use strict';

const path = require('path');
const fs = require('fs');
const { ipcMain, app } = require('electron');
const config = require('../lib/config-store');
const state = require('../lib/app-state');

function register(deps) {
  const {
    applyUiZoom,
    discordRpc,
    discord,
  } = deps;

// ——— App settings ———

ipcMain.handle('app:getSettings', () => {
  try {
    const p = config.getConfigPath();
    const data = fs.existsSync(p) ? JSON.parse(fs.readFileSync(p, 'utf8')) : {};
    return {
      minimizeToTray: config.getMinimizeToTray(),
      adaptiveAcceleration: config.getAdaptiveAcceleration(),
      upscaleEnabled: data.upscaleEnabled === true,
      upscaleMode: typeof data.upscaleMode === 'number' ? data.upscaleMode : 15,
      playerDebugOverlay: data.playerDebugOverlay === true,
      uiZoom: config.getUiZoom(),
      ...config.buildDiscordRpcSettingsPayload(data),
    };
  } catch (_) {
    return {
      minimizeToTray: config.getMinimizeToTray(),
      adaptiveAcceleration: config.getAdaptiveAcceleration(),
      upscaleEnabled: false,
      upscaleMode: 15,
      playerDebugOverlay: false,
      uiZoom: 100,
      ...config.buildDiscordRpcSettingsPayload({}),
    };
  }
});

ipcMain.handle('app:saveSettings', (_, settings) => {
  if (settings && typeof settings === 'object') {
    config.saveConfig(settings);
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
  }
});
}

module.exports = { register };
