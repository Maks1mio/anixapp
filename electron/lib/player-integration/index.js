'use strict';

const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

const vlc = require('./players/vlc');
const mpv = require('./players/mpv');
const potplayer = require('./players/potplayer');

/** Порядок в UI и приоритет автовыбора. Добавляй новых сюда. */
const REGISTRY = [vlc, mpv, potplayer];

/** Кэш детекта: прогревается при старте приложения. */
let installedCache = {
  at: 0,
  warmed: false,
  list: /** @type {import('./types').InstalledExternalPlayer[]} */ ([]),
};
/** После warm — отдаём кэш долго; fresh=true всё ещё пересканирует. */
const INSTALLED_CACHE_MS = 5 * 60 * 1000;

/**
 * Все известные интеграции (даже если не установлены).
 * @returns {import('./types').ExternalPlayerInfo[]}
 */
function listKnownPlayers() {
  return REGISTRY.map((p) => ({ ...p.info }));
}

/**
 * Только установленные на машине.
 * @param {{ fresh?: boolean }} [opts]
 * @returns {import('./types').InstalledExternalPlayer[]}
 */
function listInstalledPlayers(opts = {}) {
  const now = Date.now();
  if (
    !opts.fresh
    && installedCache.warmed
    && now - installedCache.at < INSTALLED_CACHE_MS
  ) {
    return installedCache.list.slice();
  }
  const out = [];
  for (const p of REGISTRY) {
    const found = p.detect();
    if (found) out.push(found);
  }
  installedCache = { at: now, warmed: true, list: out };
  return out.slice();
}

/**
 * Фоновый прогрев кэша при старте Electron — UI не ждёт реестр.
 * @returns {import('./types').InstalledExternalPlayer[]}
 */
function warmInstalledPlayersCache() {
  return listInstalledPlayers({ fresh: true });
}

/**
 * @param {string | null | undefined} preferredId
 * @returns {import('./types').InstalledExternalPlayer | null}
 */
function resolvePlayer(preferredId) {
  const installed = listInstalledPlayers();
  if (!installed.length) return null;
  if (preferredId) {
    const hit = installed.find((p) => p.id === preferredId);
    if (hit) return hit;
  }
  return installed[0];
}

/**
 * @param {string} executable
 * @param {string[]} args
 * @returns {Promise<{ ok: boolean, reason?: string }>}
 */
function spawnDetached(executable, args) {
  return new Promise((resolve) => {
    try {
      const cwd = path.dirname(executable);
      const child = spawn(executable, args, {
        detached: true,
        stdio: 'ignore',
        shell: false,
        cwd: fs.existsSync(cwd) ? cwd : undefined,
        windowsHide: false,
      });
      child.once('error', () => resolve({ ok: false, reason: 'launch-failed' }));
      child.once('spawn', () => { child.unref(); resolve({ ok: true }); });
    } catch {
      resolve({ ok: false, reason: 'launch-failed' });
    }
  });
}

/**
 * @param {import('./types').LaunchMedia & { playerId?: string }} opts
 * @returns {Promise<{ ok: boolean, reason?: string, player?: string, playlist?: number }>}
 */
async function launchExternalPlayer(opts = {}) {
  const player = resolvePlayer(opts.playerId);
  if (!player) return { ok: false, reason: 'player-not-found' };

  const adapter = REGISTRY.find((p) => p.info.id === player.id);
  if (!adapter) return { ok: false, reason: 'player-not-found' };

  try {
    const { args } = adapter.buildLaunchArgs({
      url: opts.url,
      title: opts.title,
      referer: opts.referer,
      userAgent: opts.userAgent,
      playlist: opts.playlist,
      startIndex: opts.startIndex,
    });
    const launched = await spawnDetached(player.path, args);
    if (!launched.ok) return launched;
    const playlistLen = Array.isArray(opts.playlist) ? opts.playlist.length : 0;
    return {
      ok: true,
      player: player.id,
      ...(playlistLen > 1 ? { playlist: playlistLen } : {}),
    };
  } catch (e) {
    if (e && e.code === 'invalid-url') return { ok: false, reason: 'invalid-url' };
    return { ok: false, reason: 'invalid-url' };
  }
}

module.exports = {
  REGISTRY,
  listKnownPlayers,
  listInstalledPlayers,
  warmInstalledPlayersCache,
  resolvePlayer,
  launchExternalPlayer,
};
