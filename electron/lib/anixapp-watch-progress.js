'use strict';

/**
 * Watch progress in anixback (GET/PUT /api/watch-progress).
 * Runs where the Anixart token lives (main process / dev bridge), so the renderer never sees the token.
 */

const { isAllowedOrigin } = require('./anixapp-presence');

/**
 * @param {{ origin?: string, method?: 'GET' | 'PUT', query?: Record<string, string | number>, body?: unknown }} request
 * @param {string | null | undefined} token
 * @param {number | null | undefined} profileId
 */
async function requestWatchProgress(request, token, profileId) {
  const r = request && typeof request === 'object' ? request : {};
  if (!isAllowedOrigin(r.origin)) return { ok: false, error: 'origin not allowed' };
  const userId = Number(profileId);
  if (!token || !Number.isFinite(userId) || userId <= 0) return { ok: false, status: 401, error: 'not signed in' };

  const method = r.method === 'PUT' ? 'PUT' : 'GET';
  const url = new URL(`${r.origin.replace(/\/$/, '')}/api/watch-progress`);
  for (const [key, value] of Object.entries(r.query ?? {})) url.searchParams.set(key, String(value));

  try {
    const res = await fetch(url, {
      method,
      headers: {
        'Content-Type': 'application/json',
        'X-Anixart-User-Id': String(Math.trunc(userId)),
        'X-Anixart-Token': String(token),
      },
      ...(method === 'PUT' ? { body: JSON.stringify(r.body ?? {}) } : {}),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? `HTTP ${res.status}` };
    return data ?? { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

module.exports = { requestWatchProgress };
