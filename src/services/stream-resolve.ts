/**
 * Resolve embed → direct playable URL via AnixBack.
 * Used by web/TV bridges; falls back to local kodik-direct when offline.
 */
import { getAnixbackOrigin } from './anixback-endpoint';

const RESOLVE_TIMEOUT_MS = 28_000;

export type DirectVideoResult = {
  directUrl: string | null;
  quality: string | null;
  qualityMap: Record<string, string>;
  downloadHeaders: Record<string, string>;
  skip?: unknown;
  error?: string | null;
};

export async function resolveViaAnixback(embedUrl: string): Promise<DirectVideoResult | null> {
  const url = String(embedUrl || '').trim();
  if (!url) return null;

  const origin = getAnixbackOrigin();
  const endpoint = `${origin}/api/stream/resolve`;
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), RESOLVE_TIMEOUT_MS);

  try {
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ embedUrl: url }),
      signal: ctrl.signal,
    });
    const json = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
      code?: string;
      directUrl?: string | null;
      quality?: string | null;
      qualityMap?: Record<string, string>;
      downloadHeaders?: Record<string, string>;
      skip?: unknown;
    } | null;

    if (!res.ok || !json || json.ok === false) {
      const code = json?.code || '';
      if (code === 'libria-release-missing' || /удал[её]н|недоступен на AniLibria/i.test(String(json?.error || ''))) {
        return {
          directUrl: null,
          quality: null,
          qualityMap: {},
          downloadHeaders: {},
          skip: null,
          error: 'libria-release-missing',
        };
      }
      throw new Error(json?.error || `HTTP ${res.status}`);
    }
    if (!json.directUrl) return null;
    return {
      directUrl: String(json.directUrl),
      quality: json.quality ?? null,
      qualityMap: json.qualityMap && typeof json.qualityMap === 'object' ? json.qualityMap : {},
      downloadHeaders:
        json.downloadHeaders && typeof json.downloadHeaders === 'object'
          ? json.downloadHeaders
          : {},
      skip: json.skip ?? null,
      error: null,
    };
  } finally {
    clearTimeout(timer);
  }
}
