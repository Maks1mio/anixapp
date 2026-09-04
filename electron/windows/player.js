'use strict';

const path = require('path');
const { BrowserWindow, ipcMain, shell, app } = require('electron');
const state = require('../lib/app-state');
const { getDevServerOrigin } = require('../lib/dev-server');

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

function createPlayerWindow(params) {
  const iconPath = getIconPath();
  const playerWindow = new BrowserWindow({
    width: 1280,
    height: 720,
    minWidth: 640,
    minHeight: 400,
    frame: false,
    titleBarStyle: 'hidden',
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
  state.playerWindowRef = playerWindow;
  state.currentPlayerPlayback = {
    releaseId: String(params.releaseId ?? ''),
    sourceId: String(params.sourceId ?? ''),
    ep: String(params.ep ?? ''),
    dubberId: String(params.dubberId ?? ''),
    ...(params.externalUrl ? { externalUrl: String(params.externalUrl) } : {}),
  };
  playerWindow.on('closed', () => {
    state.playerWindowRef = null;
    state.currentPlayerPlayback = null;
    try {
      require('../lib/download-queue').setStreamingHold(false);
    } catch (_) { /* ignore */ }
    // Revert Discord presence when player is closed
    if (discordRpc && config.getDiscordRpcEnabled()) {
      discordRpc.focusWindow('main');
      if (config.getDiscordRpcShowBrowsing()) {
        discordRpc.setBrowsing(state.discordSessionStart);
      } else {
        discord.setDiscordGenericInApp();
      }
    }
    // Notify main window so it can show the lobby "now watching" widget
    if (state.mainWindow && !state.mainWindow.isDestroyed()) {
      state.mainWindow.webContents.send('player:closed');
    }
  });
  playerWindow.once('ready-to-show', () => {
    applyUiZoom(config.getUiZoom());
    playerWindow.show();
  });
  // Focus tracking: when user brings the player window to front, switch Discord to watching activity
  playerWindow.on('focus', () => { if (discordRpc) discordRpc.focusWindow('player'); });
  playerWindow.on('enter-full-screen', () => playerWindow.webContents.send('player:fullscreen', true));
  playerWindow.on('leave-full-screen', () => playerWindow.webContents.send('player:fullscreen', false));

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

function openPlayerWithParams(params) {
  if (!params || typeof params !== 'object') return;
  const applyRoomPlayback = !!params.applyRoomPlayback;
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
  };
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
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
  createPlayerWindow(safe);
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
  openPlayerWithParams(params);
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
  createPlayerWindow(params);
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

ipcMain.on('lobby:createFromPlayer', (_, playback) => {
  if (state.mainWindow && !state.mainWindow.isDestroyed()) {
    state.mainWindow.webContents.send('lobby:createFromPlayer', playback ?? null);
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
