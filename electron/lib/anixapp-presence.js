'use strict';

/**
 * Presence ping to anixback (POST /api/app/presence).
 * Runs where the Anixart token lives (main process / dev bridge), so the renderer
 * never sees the token. anixback verifies the token → grants the «В AnixApp» badge.
 */

const ALLOWED_ORIGIN = /^(https:\/\/([a-z0-9-]+\.)*anixapp\.com|http:\/\/(localhost|127\.0\.0\.1)(:\d+)?)$/i;

function isAllowedOrigin(origin) {
  return typeof origin === 'string' && ALLOWED_ORIGIN.test(origin.replace(/\/$/, ''));
}

/**
 * @param {{ origin?: string, install_id?: string, platform?: string, version?: string, event?: string, user_id?: number | null }} payload
 * @param {string | null | undefined} token
 * @param {number | null | undefined} [savedProfileId] profile from the session config (TV/mobile layouts don't expose it to the renderer)
 */
async function sendAnixappPresence(payload, token, savedProfileId) {
  const p = payload && typeof payload === 'object' ? payload : {};
  if (!isAllowedOrigin(p.origin)) return { ok: false, error: 'origin not allowed' };

  const headers = { 'Content-Type': 'application/json' };
  const userId = Number(p.user_id || savedProfileId);
  if (token && Number.isFinite(userId) && userId > 0) {
    headers['X-Anixart-User-Id'] = String(Math.trunc(userId));
    headers['X-Anixart-Token'] = String(token);
  }

  try {
    const res = await fetch(`${p.origin.replace(/\/$/, '')}/api/app/presence`, {
      method: 'POST',
      headers,
      body: JSON.stringify({
        install_id: p.install_id,
        platform: p.platform,
        version: p.version,
        event: p.event,
      }),
      signal: AbortSignal.timeout(10000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok) return { ok: false, status: res.status, error: data?.error ?? `HTTP ${res.status}` };
    return data ?? { ok: true };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

module.exports = { sendAnixappPresence, isAllowedOrigin };
