import { writable } from 'svelte/store';
import {
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

/** Origin without trailing slash, e.g. http://localhost:8787 */
export function getAnixbackOrigin(): string {
  const vite = viteOriginOverride();
  if (vite) return vite.replace(/\/$/, '');
  return originForMode(currentMode);
}

export function getApiBase(): string {
  return `${getAnixbackOrigin()}/api`;
}

export function getLobbyHttpBase(): string {
  return `${getAnixbackOrigin()}/anixapp/lobby`;
}

export function getLobbyWsBase(): string {
  const origin = getAnixbackOrigin();
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
