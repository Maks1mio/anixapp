import { writable } from 'svelte/store';
import {
  ANIXBACK_LOCAL_ORIGIN,
  DEFAULT_ANIXBACK_MODE,
  originForMode,
  type AnixbackEndpointMode,
} from '../constants/anixbackEndpoints';

let currentMode: AnixbackEndpointMode = DEFAULT_ANIXBACK_MODE;

export const anixbackEndpointMode = writable<AnixbackEndpointMode>(currentMode);

function viteOriginOverride(): string | null {
  const raw =
    (import.meta.env.VITE_ANIXBACK_ORIGIN as string | undefined)?.trim()
    || (import.meta.env.VITE_ANNOUNCEMENTS_API as string | undefined)?.trim()?.replace(/\/api\/?$/, '');
  return raw || null;
}

/** Same-origin Vite proxy for local anixback (LAN/phone + CSP). */
function devAnixbackProxyOrigin(): string | null {
  if (!import.meta.env.DEV || typeof window === 'undefined') return null;
  if (viteOriginOverride()) return null;
  if (currentMode !== 'local') return null;
  return `${window.location.origin}/__anixback`;
}

/**
 * Origin for HTTP API / uploads. In Vite DEV + local mode → `/__anixback` proxy.
 * Without trailing slash.
 */
export function getAnixbackOrigin(): string {
  const vite = viteOriginOverride();
  if (vite) return vite.replace(/\/$/, '');
  return devAnixbackProxyOrigin() ?? originForMode(currentMode);
}

/**
 * Raw selected origin (no Vite proxy) — for WS / health pings that talk to :8787 directly.
 */
export function getAnixbackDirectOrigin(): string {
  const vite = viteOriginOverride();
  if (vite) return vite.replace(/\/$/, '');
  return originForMode(currentMode);
}

/** Static uploads (MP4/JPG/PNG) — тот же сервер, что выбран в настройках разработчика. */
export function getAnixbackUploadsOrigin(): string {
  const uploadsOverride = (import.meta.env.VITE_ANIXBACK_UPLOADS_ORIGIN as string | undefined)?.trim();
  if (uploadsOverride) return uploadsOverride.replace(/\/$/, '');

  // Dev/Electron: same-origin Vite proxy for uploads (overview media, etc.).
  if (import.meta.env.DEV && typeof window !== 'undefined' && !viteOriginOverride()) {
    return `${window.location.origin}/__anixback`;
  }

  return getAnixbackOrigin();
}

/** Resolve `/uploads/...` or absolute URL to a fetchable media URL. */
export function resolveAnixbackUploadUrl(
  url: string | null | undefined,
  stamp?: string | null,
): string {
  const value = String(url ?? '').trim();
  if (!value) return '';
  const base = /^https?:\/\//i.test(value)
    ? value
    : `${getAnixbackUploadsOrigin()}${value.startsWith('/') ? value : `/${value}`}`;
  if (!stamp) return base;
  return `${base}${base.includes('?') ? '&' : '?'}t=${encodeURIComponent(stamp)}`;
}

/** CSS-safe url(...) value for background-image. */
export function cssUploadUrl(url: string | null | undefined, stamp?: string | null): string {
  const resolved = resolveAnixbackUploadUrl(url, stamp);
  if (!resolved) return 'none';
  return `url("${resolved.replace(/"/g, '%22')}")`;
}

export function getApiBase(): string {
  return `${getAnixbackOrigin()}/api`;
}

export function getLobbyHttpBase(): string {
  return `${getAnixbackOrigin()}/anixapp/lobby`;
}

export function getLobbyWsBase(): string {
  // Dev + local: Electron/localhost → напрямую :8787 (без Vite WS proxy, стабильнее).
  if (
    import.meta.env.DEV
    && typeof window !== 'undefined'
    && currentMode === 'local'
    && !viteOriginOverride()
  ) {
    const host = window.location.hostname;
    if (host === '127.0.0.1' || host === 'localhost') {
      return 'ws://127.0.0.1:8787/anixapp/lobby/ws';
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/anixapp/lobby/ws`;
  }
  const origin = getAnixbackDirectOrigin();
  if (origin.startsWith('https://')) {
    return `${origin.replace('https://', 'wss://')}/anixapp/lobby/ws`;
  }
  return `${origin.replace('http://', 'ws://')}/anixapp/lobby/ws`;
}

export function getAnixbackEndpointMode(): AnixbackEndpointMode {
  return currentMode;
}

export async function initAnixbackEndpoint(): Promise<void> {
  if (viteOriginOverride()) return;

  try {
    const saved = await window.electron?.getAnixbackEndpoint?.();
    if (saved === 'local' || saved === 'prod') {
      currentMode = saved;
      anixbackEndpointMode.set(saved);
    }
  } catch {
    /* ignore */
  }

  if (import.meta.env.DEV) {
    return;
  }

  if (currentMode === 'local') {
    const localOk = await pingAnixbackOrigin(ANIXBACK_LOCAL_ORIGIN);
    if (!localOk.ok) {
      currentMode = 'prod';
      anixbackEndpointMode.set('prod');
    }
  }
}

export async function setAnixbackEndpoint(mode: AnixbackEndpointMode): Promise<void> {
  if (viteOriginOverride()) return;
  currentMode = mode;
  anixbackEndpointMode.set(mode);
  await window.electron?.setAnixbackEndpoint?.(mode);
  window.dispatchEvent(new CustomEvent('anix:anixbackEndpointChanged', { detail: { mode } }));
}

export async function pingAnixbackOrigin(origin: string): Promise<{ ok: boolean; latencyMs: number | null }> {
  const start = performance.now();
  try {
    const res = await fetch(`${origin.replace(/\/$/, '')}/health`, {
      signal: AbortSignal.timeout(4000),
    });
    return { ok: res.ok, latencyMs: Math.round(performance.now() - start) };
  } catch {
    return { ok: false, latencyMs: null };
  }
}
