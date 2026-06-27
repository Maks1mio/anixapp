/**
 * Wraps extracted *-body.js snippets into register() modules.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

function transformBody(raw) {
  let s = raw;
  const replacements = [
    [/\bmainWindow\b/g, 'state.mainWindow'],
    [/\bplayerWindowRef\b/g, 'state.playerWindowRef'],
    [/\bcurrentPlayerPlayback\b/g, 'state.currentPlayerPlayback'],
    [/\btray\b/g, 'state.tray'],
    [/\banixart\b/g, 'state.anixart'],
    [/\bisQuitting\b/g, 'state.isQuitting'],
    [/\bthemeEditorWindow\b/g, 'state.themeEditorWindow'],
    [/\bupscaleToolWindow\b/g, 'state.upscaleToolWindow'],
    [/\boverviewEditorWindow\b/g, 'state.overviewEditorWindow'],
    [/\boverviewEditorPayload\b/g, 'state.overviewEditorPayload'],
    [/\bpendingInstallerPath\b/g, 'state.pendingInstallerPath'],
    [/\bupdateDownloadState\b/g, 'state.updateDownloadState'],
    [/\bffmpegPathCache\b/g, 'state.ffmpegPathCache'],
    [/\b_trayImage\b/g, 'state._trayImage'],
    [/\b_configCache\s*\?\?\s*_readConfigFromDisk\(\)/g, 'config.getRawConfig()'],
    [/\bsaveConfig\(/g, 'config.saveConfig('],
    [/\bloadConfig\(/g, 'config.loadConfig('],
    [/\bloadSavedToken\(/g, 'config.loadSavedToken('],
    [/\bgetOrCreateDeviceId\(/g, 'config.getOrCreateDeviceId('],
    [/\bgetMinimizeToTray\(/g, 'config.getMinimizeToTray('],
    [/\bgetUiZoom\(/g, 'config.getUiZoom('],
    [/\bgetAdaptiveAcceleration\(/g, 'config.getAdaptiveAcceleration('],
    [/\bgetDiscordRpcEnabled\(/g, 'config.getDiscordRpcEnabled('],
    [/\bgetDiscordRpcShowBrowsing\(/g, 'config.getDiscordRpcShowBrowsing('],
    [/\bgetDiscordRpcShowWatching\(/g, 'config.getDiscordRpcShowWatching('],
    [/\bgetDiscordRpcShowProgress\(/g, 'config.getDiscordRpcShowProgress('],
    [/\bgetDiscordRpcShowDubber\(/g, 'config.getDiscordRpcShowDubber('],
    [/\bgetDiscordRpcShowImages\(/g, 'config.getDiscordRpcShowImages('],
    [/\bgetDiscordRpcShowParty\(/g, 'config.getDiscordRpcShowParty('],
    [/\bbuildDiscordRpcSettingsPayload\(/g, 'config.buildDiscordRpcSettingsPayload('],
    [/\bapplyDiscordRpcOptionsFromSettings\(/g, 'discord.applyDiscordRpcOptionsFromSettings('],
    [/\bsetDiscordGenericInApp\(/g, 'discord.setDiscordGenericInApp('],
    [/\bappendLog\(/g, 'appendLog('],
    [/\bgetIconPath\(/g, 'getIconPath('],
    [/\bapplyUiZoom\(/g, 'applyUiZoom('],
    [/\bgetAnixart\(/g, 'getAnixart('],
    [/\bcreateAnixClient\(/g, 'createAnixClient('],
    [/\bhandleAnixError\(/g, 'handleAnixError('],
    [/\bloggedHandle\(/g, 'loggedHandle('],
    [/\bpath\.join\(__dirname,/g, 'path.join(electronDir,'],
  ];
  for (const [re, rep] of replacements) s = s.replace(re, rep);
  return s;
}

function wrap(outFile, bodyFile, header, footer) {
  const body = transformBody(fs.readFileSync(path.join(root, bodyFile), 'utf8'));
  fs.writeFileSync(path.join(root, outFile), header + body + footer);
  console.log('Wrote', outFile);
}

wrap('services/media.js', 'services/media-body.js', `'use strict';

const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const { session, net, dialog, shell, app, ipcMain } = require('electron');
const { SibnetParser } = require('anixapi');
const { BROWSER_UA } = require('../cdn-proxy');
const { ANIXART_UA } = require('../lib/constants');
const config = require('../lib/config-store');
const state = require('../lib/app-state');

const media = {
  getDownloadDirectory: null,
  setDownloadDirectory: null,
};

function register(deps) {
  const { appendLog } = deps;

`, `

  media.getDownloadDirectory = getDownloadDirectory;
  media.setDownloadDirectory = setDownloadDirectory;
}

module.exports = { register, media };
`);

wrap('windows/player.js', 'windows/player-body.js', `'use strict';

const path = require('path');
const { BrowserWindow, ipcMain, shell, app } = require('electron');
const state = require('../lib/app-state');

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

`, `

  player.createPlayerWindow = createPlayerWindow;
}

module.exports = { register, player };
`);

wrap('services/updater.js', 'services/updater-body.js', `'use strict';

const path = require('path');
const fs = require('fs');
const { app, ipcMain, shell, dialog } = require('electron');
const state = require('../lib/app-state');
const logger = require('../logger');

function register() {

`, `
}

module.exports = { register };
`);

wrap('windows/tools.js', 'windows/tools-body.js', `'use strict';

const path = require('path');
const fs = require('fs');
const { BrowserWindow, ipcMain, app } = require('electron');
const state = require('../lib/app-state');

function register(deps) {
  const { isDev, applyUiZoom, electronDir } = deps;

`, `
}

module.exports = { register };
`);

wrap('ipc/anix-api.js', 'ipc/anix-api-body.js', `'use strict';

const { ipcMain } = require('electron');
const { BookmarkType, BookmarkSortType } = require('anixapi');

function register(deps) {
  const {
    loggedHandle,
    handleAnixError,
    getAnixart,
    appendLog,
    homeCustomFilter,
    LIST_STATUS_TO_TYPE,
  } = deps;

`, `
}

module.exports = { register };
`);

wrap('ipc/auth.js', 'ipc/auth-body.js', `'use strict';

const { ipcMain } = require('electron');
const { DefaultResult } = require('anixapi');
const config = require('../lib/config-store');
const state = require('../lib/app-state');

function register(deps) {
  const {
    loggedHandle,
    handleAnixError,
    getAnixart,
    createAnixClient,
    resetAnixart,
    appendLog,
    logger,
  } = deps;

`, `
}

module.exports = { register };
`);

wrap('ipc/app-settings.js', 'ipc/app-settings-body.js', `'use strict';

const path = require('path');
const fs = require('fs');
const { ipcMain, app } = require('electron');
const config = require('../lib/config-store');
const state = require('../lib/app-state');

function register(deps) {
  const {
    applyUiZoom,
    applyDiscordRpcOptionsFromSettings,
    discordRpc,
    getUiZoom,
  } = deps;

`, `
}

module.exports = { register };
`);

wrap('ipc/window-controls.js', 'ipc/window-controls-body.js', `'use strict';

const { ipcMain } = require('electron');
const state = require('../lib/app-state');
const config = require('../lib/config-store');

function register() {

`, `
}

module.exports = { register };
`);

wrap('ipc/shell-logs.js', 'ipc/shell-logs-body.js', `'use strict';

const path = require('path');
const fs = require('fs');
const { ipcMain, shell, app } = require('electron');
const logger = require('../logger');

function register() {

`, `
}

module.exports = { register };
`);

wrap('setup/main-window.js', 'setup/main-window-body.js', `'use strict';

const path = require('path');
const { BrowserWindow } = require('electron');
const state = require('../lib/app-state');
const logger = require('../logger');

function createMainWindow(deps) {
  const { isDev, getIconPath, applyUiZoom, config, electronDir } = deps;

`, `
}

module.exports = { createMainWindow };
`);

wrap('setup/tray.js', 'setup/tray-body.js', `'use strict';

const path = require('path');
const { Tray, nativeImage, Menu, app } = require('electron');
const state = require('../lib/app-state');

function createTray(deps) {
  const { getIconPath } = deps;

`, `
}

module.exports = { createTray };
`);
