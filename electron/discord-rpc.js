'use strict';

/**
 * Discord Rich Presence service for AnixApp.
 * Gracefully degrades if @xhayper/discord-rpc is not installed or Discord is not running.
 *
 * App ID: 1483170633197027571
 * Required Discord assets (upload at discordapp.com/developers/applications):
 *   - logo  — app logo (1024×1024)
 *   - play  — play icon (512×512)
 *   - pause — pause icon (512×512)
 *
 * Activity types used:
 *   0 = Playing  → shown when browsing / viewing profiles / navigating pages
 *   3 = Watching → shown when watching anime (Discord may show as Playing for RPC, that's a Discord limitation)
 *
 * NOTE: Discord's local RPC protocol may force type=0 (Playing) regardless of what we set.
 *       We set type: 3 anyway in case Discord starts respecting it.
 */

const CLIENT_ID = '1483170633197027571';

let DiscordRpcLib = null;
try {
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
// activity that belongs to that window.
let _mainActivity   = null;   // last activity set for the main (browser) context
let _playerActivity = null;   // last activity set for the player context
let _focusedContext = 'main'; // 'main' | 'player' — which window is in front

// ── Persistent party info ─────────────────────────────────────────────────────
// When in a lobby, party info must persist across player state updates.
// Otherwise every play/pause would wipe the party/join info.
let _partyInfo = null; // { partyId, partySize, partyMax, joinSecret }

// ── Last known poster URL for the currently playing anime ─────────────────────
let _lastPosterUrl = null;

/** @returns {object|null} The activity that is currently visible in Discord. */
function _currentActivity() {
  return _focusedContext === 'player' ? _playerActivity : _mainActivity;
}

// ──────────────────────────────────────────────────────────────────────────────

/** Pass the main BrowserWindow reference so ACTIVITY_JOIN can focus/open it. */
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

      // Subscribe to activity events for party invites
      _subscribeEvents();

      // Re-apply the currently visible activity after reconnect
      const act = _currentActivity();
      if (act) _applyActivity(act);
    });

    rpc.on('connected', () => {
      connected = true;
    });

    rpc.on('disconnected', () => {
      connected = false;
      rpc = null;
      if (!destroyed) scheduleReconnect();
    });

    // When someone clicks "Ask to Join" / accepts our invite in Discord
    rpc.on('ACTIVITY_JOIN', (data) => {
      const secret = typeof data === 'string' ? data : data?.secret;
      console.log('[Discord RPC] ACTIVITY_JOIN secret:', secret);
      if (mainWindowRef && !mainWindowRef.isDestroyed() && secret) {
        try {
          mainWindowRef.webContents.send('discord:joinLobby', { roomCode: String(secret) });
          mainWindowRef.show();
          mainWindowRef.focus();
        } catch (_) {}
      }
    });

    // Auto-accept join requests
    rpc.on('ACTIVITY_JOIN_REQUEST', (data) => {
      console.log('[Discord RPC] ACTIVITY_JOIN_REQUEST from:', data?.user?.username);
      // Auto-accept: respond with SEND_ACTIVITY_JOIN_INVITE
      try {
        if (rpc && data?.user?.id) {
          rpc.request('SEND_ACTIVITY_JOIN_INVITE', { user_id: data.user.id }).catch(() => {});
        }
      } catch (_) {}
    });

    await rpc.login();
  } catch (err) {
    console.warn('[Discord RPC] Failed to connect:', err.message ?? String(err));
    rpc = null;
    connected = false;
    if (!destroyed) scheduleReconnect();
  }
}

/** Subscribe to activity events so Discord sends join/spectate events to us. */
async function _subscribeEvents() {
  if (!rpc || !connected) return;
  try {
    await rpc.subscribe('ACTIVITY_JOIN');
    console.log('[Discord RPC] Subscribed to ACTIVITY_JOIN');
  } catch (e) {
    console.warn('[Discord RPC] Failed to subscribe ACTIVITY_JOIN:', e.message);
  }
  try {
    await rpc.subscribe('ACTIVITY_JOIN_REQUEST');
    console.log('[Discord RPC] Subscribed to ACTIVITY_JOIN_REQUEST');
  } catch (e) {
    console.warn('[Discord RPC] Failed to subscribe ACTIVITY_JOIN_REQUEST:', e.message);
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

// ── Truncation helper ─────────────────────────────────────────────────────────
const truncate = (s, max = 128) =>
  s && s.length > max ? s.substring(0, max - 1) + '…' : (s || '');

// Ensure min length of 2 for Discord (they reject shorter strings)
const safeStr = (s) => {
  if (!s) return undefined;
  return s.length < 2 ? s + ' ' : s;
};

// ── Public presence setters ───────────────────────────────────────────────────

/**
 * User is browsing the app, not watching anything.
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
 */
function setPage({ details, state: pageState }) {
  _setForContext('main', {
    type: 0,
    details: safeStr(details) || 'В приложении',
    state: safeStr(pageState) || undefined,
    largeImageKey: 'logo',
    largeImageText: 'AnixApp — Anixart клиент',
    startTimestamp: Math.floor(Date.now() / 1000),
    instance: false,
  });
}

/**
 * User is viewing an anime release page (not playing yet).
 * Shows poster as large image.
 *
 * @param {object}  opts
 * @param {string}        opts.title      Anime title
 * @param {string|null}   [opts.posterUrl] Full HTTPS URL of the poster
 */
function setViewingRelease({ title, posterUrl }) {
  // Remember poster for when user starts watching
  if (posterUrl) _lastPosterUrl = posterUrl;

  _setForContext('main', {
    type: 3,
    details: safeStr(truncate(title || 'Аниме')),
    state: 'Просматривает страницу аниме',
    largeImageKey: posterUrl || 'logo',
    largeImageText: truncate(title || 'AnixApp', 128),
    smallImageKey: 'logo',
    smallImageText: 'AnixApp',
    instance: false,
  });
}

/**
 * User is viewing a profile page.
 * Shows the user's avatar as large image.
 *
 * @param {object}  opts
 * @param {string}        opts.username   Profile login/name
 * @param {string|null}   [opts.avatarUrl] Full HTTPS URL of the user's avatar
 * @param {boolean}       [opts.isSelf]   true = own profile
 */
function setViewingProfile({ username, avatarUrl, isSelf }) {
  const displayName = truncate(username || 'Пользователь', 64);
  _setForContext('main', {
    type: 0,
    details: isSelf ? 'Свой профиль' : `Профиль: ${displayName}`,
    state: isSelf ? 'Просматривает свой профиль' : 'Просматривает профиль',
    largeImageKey: avatarUrl || 'logo',
    largeImageText: displayName,
    smallImageKey: 'logo',
    smallImageText: 'AnixApp',
    instance: false,
  });
}

/**
 * Update persistent party info. Called when joining/creating a lobby or when
 * participants change. Passing null clears party info.
 *
 * @param {object|null} info
 * @param {string}      info.partyId    Lobby room ID
 * @param {number}      info.partySize  Current participant count
 * @param {number}      info.partyMax   Max participants (default 10)
 * @param {string}      info.joinSecret Room code for "Ask to Join"
 */
function setPartyInfo(info) {
  _partyInfo = info ? {
    partyId: String(info.partyId),
    partySize: info.partySize || 1,
    partyMax: info.partyMax || Math.max(info.partySize || 1, 10),
    joinSecret: info.joinSecret ? String(info.joinSecret) : undefined,
  } : null;
  console.log('[Discord RPC] Party info updated:', _partyInfo);

  // If player is active, re-apply its activity with updated party info
  if (_playerActivity && _focusedContext === 'player') {
    // Rebuild the player activity with new party info
    _applyActivity(_playerActivity);
  }
}

/**
 * Store the last poster URL (so watching can use it without needing it in every state update).
 */
function setPosterUrl(url) {
  _lastPosterUrl = url || null;
}

/**
 * User is watching an episode (optionally in a lobby).
 * Type 3 = Watching.
 *
 * @param {object}  opts
 * @param {string}        opts.title        Release title
 * @param {string}        opts.ep           Episode number/position
 * @param {string}        [opts.sourceName] Source player name (e.g. "Kodik")
 * @param {string}        [opts.dubberName] Dubbing studio name (e.g. "AniLib") — preferred for display
 * @param {boolean}       opts.paused
 * @param {number}        opts.currentTime  Playback position in seconds
 * @param {number|null}   [opts.duration]   Total episode duration in seconds (enables progress bar)
 * @param {string|null}   [opts.posterUrl]  Anime poster URL (overrides remembered poster)
 */
function setWatching({ title, ep, sourceName, dubberName, paused, currentTime, duration, posterUrl }) {
  const ct = Math.max(0, Math.floor(currentTime ?? 0));

  // Prefer dubber name over source name for the state line
  const displayName = dubberName || sourceName || '';
  const epStr  = ep != null ? `Серия ${ep}` : '';
  const srcStr = displayName ? ` · ${displayName}` : '';
  const stateText = safeStr(truncate(`${epStr}${srcStr}`) || 'Смотрит аниме');

  // Use provided poster, or remembered poster from release page
  const poster = posterUrl || _lastPosterUrl || 'logo';
  if (posterUrl) _lastPosterUrl = posterUrl;

  const activity = {
    type: 3,   // Watching
    details: safeStr(truncate(title || 'Аниме')),
    state: stateText,
    largeImageKey: poster,
    largeImageText: truncate(title || 'AnixApp', 128),
    smallImageKey: paused ? 'pause' : 'play',
    smallImageText: paused ? 'На паузе' : 'Воспроизводится',
    instance: false,
  };

  // Progress bar: Discord shows a countdown bar when both start + end timestamps are set.
  // start = now - currentTime (as if playback started at that moment)
  // end   = start + totalDuration
  // When paused: don't set timestamps (Discord would keep moving the bar)
  if (!paused && duration && duration > 0 && ct < duration) {
    const nowMs = Date.now();
    const startMs = nowMs - (ct * 1000);
    const endMs = startMs + Math.floor(duration) * 1000;
    activity.startTimestamp = new Date(startMs);
    activity.endTimestamp = new Date(endMs);
  } else if (!paused) {
    // No duration known — just show elapsed time
    activity.startTimestamp = Math.floor(Date.now() / 1000) - ct;
  }

  // Merge persistent party info (from lobby)
  if (_partyInfo) {
    activity.partyId   = _partyInfo.partyId;
    activity.partySize = _partyInfo.partySize;
    activity.partyMax  = _partyInfo.partyMax;
    if (_partyInfo.joinSecret) {
      activity.joinSecret = _partyInfo.joinSecret;
    }
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
  setPartyInfo,
  setPosterUrl,
  setWatching,
  clearActivity,
  destroy,
};
