/**
 * Presence in anixback: launch + heartbeat (~60 s) + quit.
 * Drives the «В AnixApp» badge (granted only after the server verifies the
 * Anixart token of a real launch) and the online / new-users analytics.
 * The ping goes through the bridge (`anixApi.client.appPresence`), which attaches the token.
 */
import { isCapacitorNative } from '../native/anix-api-native';
import { isMobileMode } from '../platform/mobile';
import { isTvMode } from '../platform/tv';
import { getAnixbackDirectOrigin } from './anixback-endpoint';
import { invalidateBadges } from './badges-api';

type PresenceEvent = 'launch' | 'heartbeat' | 'quit';

const INSTALL_ID_KEY = 'anixapp.installId';
const DEFAULT_HEARTBEAT_MS = 60_000;
/** Guests: send the launch anyway if no profile shows up in time. */
const GUEST_LAUNCH_DELAY_MS = 8_000;

let started = false;
let launched = false;
let lastUserId: number | null = null;
let heartbeatMs = DEFAULT_HEARTBEAT_MS;
let heartbeatTimer: ReturnType<typeof setInterval> | null = null;
let versionPromise: Promise<string | null> | null = null;

function randomId(): string {
  try {
    return crypto.randomUUID().replace(/-/g, '');
  } catch {
    return `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 12)}`;
  }
}

function installId(): string {
  try {
    const saved = localStorage.getItem(INSTALL_ID_KEY);
    if (saved && /^[A-Za-z0-9_-]{8,64}$/.test(saved)) return saved;
    const fresh = randomId();
    localStorage.setItem(INSTALL_ID_KEY, fresh);
    return fresh;
  } catch {
    return randomId();
  }
}

function platform(): string {
  if (isTvMode()) return 'android-tv';
  if (isMobileMode() || isCapacitorNative()) return 'android';
  const p = window.electron?.platform;
  if (p === 'win32') return 'windows';
  if (p === 'darwin') return 'macos';
  if (p === 'linux') return 'linux';
  return 'web';
}

function appVersion(): Promise<string | null> {
  if (!versionPromise) {
    versionPromise = (async () => {
      try {
        if (typeof window.electron?.getAppVersion === 'function') {
          const v = await window.electron.getAppVersion();
          if (v) return String(v);
        }
      } catch {
        /* fall through */
      }
      return typeof __ANIXAPP_VERSION__ === 'string' && __ANIXAPP_VERSION__ ? __ANIXAPP_VERSION__ : null;
    })();
  }
  return versionPromise;
}

function currentUserId(): number | null {
  const id = Number((window as { __anixProfile?: { id?: number } }).__anixProfile?.id ?? 0);
  return Number.isFinite(id) && id > 0 ? id : null;
}

async function ping(event: PresenceEvent): Promise<void> {
  const send = window.anixApi?.client?.appPresence;
  if (!send) return;
  const userId = currentUserId();
  try {
    const res = await send({
      origin: getAnixbackDirectOrigin(),
      install_id: installId(),
      platform: platform(),
      version: await appVersion(),
      event,
      user_id: userId,
    });
    if (res?.badge_granted && userId) {
      invalidateBadges(userId);
      window.dispatchEvent(new CustomEvent('anix:appBadgesChanged', { detail: { userId } }));
    }
    const sec = Number(res?.heartbeat_sec);
    if (Number.isFinite(sec) && sec >= 30 && sec * 1000 !== heartbeatMs) {
      heartbeatMs = sec * 1000;
      restartHeartbeat();
    }
  } catch {
    /* analytics must never affect the app */
  }
}

function restartHeartbeat(): void {
  if (heartbeatTimer) clearInterval(heartbeatTimer);
  heartbeatTimer = setInterval(() => {
    if (launched) void ping('heartbeat');
  }, heartbeatMs);
}

function sendLaunchOnce(): void {
  if (launched) return;
  launched = true;
  void ping('launch');
}

/** Call once after the app shell mounts. */
export function startAppPresence(): void {
  if (started || typeof window === 'undefined' || !window.anixApi?.client?.appPresence) return;
  started = true;

  const onProfile = () => {
    const id = currentUserId();
    if (!id || id === lastUserId) return;
    lastUserId = id;
    // Profile appeared after a guest launch (or account switch) → verify right away.
    if (launched) void ping('heartbeat');
    else sendLaunchOnce();
  };
  window.addEventListener('anix:profileUpdated', onProfile);
  onProfile();

  setTimeout(sendLaunchOnce, GUEST_LAUNCH_DELAY_MS);
  restartHeartbeat();
  window.addEventListener('pagehide', () => {
    if (launched) void ping('quit');
  });
}
