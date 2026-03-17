'use strict';

/**
 * Discord Rich Presence service for AnixApp.
 * Gracefully degrades if discord-rpc is not installed or Discord is not running.
 *
 * App ID: 1483170633197027571
 * Required Discord assets (upload at discordapp.com/developers/applications):
 *   - logo  — app logo (1024×1024)
 *   - play  — play icon (512×512)
 *   - pause — pause icon (512×512)
 *
 * Activity types used:
 *   0 = Playing  → shown when browsing / viewing profiles / navigating pages
 *   3 = Watching → shown when watching an episode or viewing an anime release page
 */

const CLIENT_ID = '1483170633197027571';

let DiscordRpcLib = null;
try {
  // Use modern maintained RPC client (same as PulseSync mod)
  DiscordRpcLib = require('@xhayper/discord-rpc');
} catch (_) {
  console.warn('[Discord RPC] @xhayper/discord-rpc module not found — Rich Presence disabled');
}

let rpc = null;
let connected = false;
let destroyed = false;
let reconnectTimer = null;
let mainWindowRef = null;

// ── Context-aware activity slots ──────────────────────────────────────────────
// We keep separate last-known activities for the main window and the player
// window. When the user brings a window into focus, we switch Discord to the
// activity that belongs to that window. This means switching tabs never shows
// stale / wrong state.
let _mainActivity   = null;   // last activity set for the main (browser) context
let _playerActivity = null;   // last activity set for the player context
let _focusedContext = 'main'; // 'main' | 'player' — which window is in front

/** @returns {object|null} The activity that is currently visible in Discord. */
function _currentActivity() {
  return _focusedContext === 'player' ? _playerActivity : _mainActivity;
}

// ──────────────────────────────────────────────────────────────────────────────

/** Pass the main BrowserWindow reference so JOIN_GAME can focus/open it. */
function setMainWindow(win) {
  mainWindowRef = win;
}

/** Connect to Discord IPC. Auto-reconnects every 30 s if Discord is not running. */
async function connect() {
  if (!DiscordRpcLib || destroyed || rpc) return;

  try {
    rpc = new DiscordRpcLib.Client({ clientId: CLIENT_ID, transport: { type: 'ipc' } });

    rpc.on('ready', () => {
      connected = true;
      console.log('[Discord RPC] Connected as', rpc.user?.username);
      const act = _currentActivity();
      if (act) _applyActivity(act);
    });

    rpc.on('connected', () => {
      connected = true;
      const act = _currentActivity();
      if (act) _applyActivity(act);
    });

    rpc.on('disconnected', () => {
      connected = false;
      rpc = null;
      if (!destroyed) scheduleReconnect();
    });

    // Game invite: when user clicks the Join button on our Rich Presence.
    // @xhayper/discord-rpc forwards the underlying ACTIVITY_JOIN event.
    rpc.on('ACTIVITY_JOIN', (secret) => {
      console.log('[Discord RPC] ACTIVITY_JOIN secret:', secret);
      if (mainWindowRef && !mainWindowRef.isDestroyed() && secret) {
        try {
          mainWindowRef.webContents.send('discord:joinLobby', { roomCode: String(secret) });
          mainWindowRef.show();
          mainWindowRef.focus();
        } catch (_) {}
      }
    });

    await rpc.login();
  } catch (err) {
    console.warn('[Discord RPC] Failed to connect:', err.message ?? String(err));
    rpc = null;
    connected = false;
    if (!destroyed) scheduleReconnect();
  }
}

function scheduleReconnect() {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    connect();
  }, 30_000);
}

async function _applyActivity(activity) {
  if (!connected || !rpc) return;
  try {
    await rpc.user.setActivity(activity);
  } catch (err) {
    console.warn('[Discord RPC] setActivity error:', err.message ?? String(err));
  }
}

/**
 * Store an activity for the given context and apply it to Discord if that
 * context is currently the focused one.
 * @param {'main'|'player'} context
 * @param {object} activity
 */
function _setForContext(context, activity) {
  if (context === 'player') {
    _playerActivity = activity;
  } else {
    _mainActivity = activity;
  }
  if (_focusedContext === context) {
    _applyActivity(activity);
  }
}

/**
 * Called by main.js when a window gains focus.
 * Switches Discord to the activity that belongs to the newly focused window.
 * @param {'main'|'player'} context
 */
function focusWindow(context) {
  if (_focusedContext === context) return;
  _focusedContext = context;
  const act = context === 'player' ? _playerActivity : _mainActivity;
  if (act) _applyActivity(act);
}

// ── Truncation helper (used by multiple functions below) ─────────────────────
const truncate = (s, max = 128) =>
  s && s.length > max ? s.substring(0, max - 1) + '…' : (s || '');

// ── Public presence setters ───────────────────────────────────────────────────

/**
 * User is browsing the app, not watching anything.
 * Activity type 0 = Playing → "Playing AnixApp"
 */
function setBrowsing(startTimestamp) {
  _setForContext('main', {
    type: 0,
    details: 'Просматривает аниме',
    state: 'В главном меню',
    largeImageKey: 'logo',
    largeImageText: 'AnixApp — Anixart клиент',
    startTimestamp: startTimestamp ?? Math.floor(Date.now() / 1000),
    instance: false,
  });
}

/**
 * User is on a specific app page (not watching).
 * Activity type 0 = Playing → "Playing AnixApp"
 */
function setPage({ details, state: pageState }) {
  _setForContext('main', {
    type: 0,
    details: details || 'В приложении',
    state: pageState || '',
    largeImageKey: 'logo',
    largeImageText: 'AnixApp — Anixart клиент',
    startTimestamp: Math.floor(Date.now() / 1000),
    instance: false,
  });
}

/**
 * User is viewing an anime release page (not playing yet).
 * Activity type 3 = Watching → "Watching AnixApp"
 *
 * @param {object}  opts
 * @param {string}        opts.title      Anime title
 * @param {string|null}   [opts.posterUrl] Full HTTPS URL of the poster (used as large image)
 */
function setViewingRelease({ title, posterUrl }) {
  _setForContext('main', {
    type: 3,
    details: truncate(title || 'Аниме'),
    state: 'Просматривает страницу аниме',
    // Discord supports full HTTPS URLs as largeImageKey
    largeImageKey: posterUrl || 'logo',
    largeImageText: truncate(title || 'AnixApp', 128),
    smallImageKey: 'logo',
    smallImageText: 'AnixApp',
    instance: false,
  });
}

/**
 * User is viewing a profile page.
 * Activity type 0 = Playing → "Playing AnixApp"
 * The user's avatar is shown as the large image.
 *
 * @param {object}  opts
 * @param {string}        opts.username   Profile login/name
 * @param {string|null}   [opts.avatarUrl] Full HTTPS URL of the user's avatar
 * @param {boolean}       [opts.isSelf]   true = own profile, false = another user's profile
 */
function setViewingProfile({ username, avatarUrl, isSelf }) {
  const displayName = truncate(username || 'Пользователь', 64);
  _setForContext('main', {
    type: 0,
    details: isSelf ? 'Свой профиль' : `Профиль: ${displayName}`,
    state: isSelf ? 'Просматривает свой профиль' : 'Просматривает профиль пользователя',
    largeImageKey: avatarUrl || 'logo',
    largeImageText: displayName,
    smallImageKey: 'logo',
    smallImageText: 'AnixApp',
    instance: false,
  });
}

/**
 * User is watching an episode (optionally in a lobby).
 * Activity type 3 = Watching → "Watching AnixApp"
 *
 * @param {object}  opts
 * @param {string}        opts.title        Release title
 * @param {string}        opts.ep           Episode number/position
 * @param {string}        opts.sourceName   Dubbing / source name
 * @param {boolean}       opts.paused
 * @param {number}        opts.currentTime  Playback position in seconds
 * @param {number|null}   [opts.duration]   Total episode duration in seconds (enables progress bar)
 * @param {string|null}   [opts.posterUrl]  Anime poster URL (for large image during watch)
 * @param {string|null}   [opts.partyId]    Lobby room ID (for Discord party)
 * @param {number|null}   [opts.partySize]  Number of lobby participants
 * @param {string|null}   [opts.joinSecret] Room invite code (legacy join, not used here)
 * @param {string|null}   [opts.joinUrl]    URL/protocol for "Join" button
 */
function setWatching({ title, ep, sourceName, paused, currentTime, duration, posterUrl, partyId, partySize, joinSecret, joinUrl }) {
  const nowMs = Date.now();
  const ct    = Math.max(0, Math.floor(currentTime ?? 0));

  const epStr  = ep != null ? `Серия ${ep}` : '';
  const srcStr = sourceName ? ` · Озвучка: ${sourceName}` : '';
  const state  = truncate(`${epStr}${srcStr}` || 'Смотрит аниме');

  const activity = {
    type: 3,   // Watching → "Watching AnixApp"
    details: truncate(title || 'Аниме'),
    state,
    // If a poster URL is supplied use it; otherwise fall back to logo asset
    largeImageKey:  posterUrl || 'logo',
    largeImageText: truncate(title || 'AnixApp', 128),
    smallImageKey:  paused ? 'pause' : 'play',
    smallImageText: paused ? 'На паузе' : 'Воспроизводится',
    instance: false,
  };

  // Прогресс‑бар: показываем только когда видео ИДЁТ.
  // При паузе Discord не должен продолжать двигать таймер/полоску,
  // поэтому таймштампы не ставим вовсе.
  if (!paused && duration && duration > 0) {
    const startMs = nowMs - ct * 1000;
    activity.startTimestamp = new Date(startMs);
    const durSec = Math.floor(duration);
    const endMs = startMs + durSec * 1000;
    activity.endTimestamp = new Date(endMs);
  }

  // Discord party info (официальная схема RPC: party + secrets/buttons)
  if (partyId && partySize && partySize > 0) {
    activity.party = {
      id: String(partyId),
      size: [partySize, Math.max(partySize, 10)],
    };
  }

  // Вариант 1: joinUrl → кнопка "Присоединиться"
  if (joinUrl) {
    activity.buttons = [
      {
        label: 'Присоединиться к совместному просмотру',
        url: String(joinUrl),
      },
    ];
    activity.instance = true;
  } else if (joinSecret) {
    // Вариант 2: joinSecret (старый flow)
    activity.secrets = {
      ...(activity.secrets || {}),
      join: String(joinSecret),
    };
    activity.instance = true;
  }

  _setForContext('player', activity);
}

/** Clear all Rich Presence data (both contexts). */
function clearActivity() {
  _mainActivity   = null;
  _playerActivity = null;
  if (connected && rpc) {
    rpc.user.clearActivity().catch(() => {});
  }
}

/** Graceful shutdown — called on app quit. */
function destroy() {
  destroyed = true;
  if (reconnectTimer) {
    clearTimeout(reconnectTimer);
    reconnectTimer = null;
  }
  if (rpc) {
    rpc.destroy().catch(() => {});
    rpc = null;
  }
  connected = false;
}

module.exports = {
  connect,
  setMainWindow,
  focusWindow,
  setBrowsing,
  setPage,
  setViewingRelease,
  setViewingProfile,
  setWatching,
  clearActivity,
  destroy,
};
