'use strict';

/**
 * Chat agent session (POST /api/agent/session on anixback).
 * Runs where the Anixart token lives (main process / dev bridge): anixback verifies
 * the token and returns an opaque session id — only that reaches the renderer.
 */

const { isAllowedOrigin } = require('./anixapp-presence');

/**
 * @param {string} origin anixback origin (https://api.anixapp.com or localhost)
 * @param {string | null | undefined} token
 * @param {number | null | undefined} profileId
 */
async function requestAgentSession(origin, token, profileId) {
  if (!isAllowedOrigin(origin)) return { ok: false, error: 'origin not allowed' };
  const userId = Number(profileId);
  if (!token || !Number.isFinite(userId) || userId <= 0) return { ok: false, error: 'not_logged_in' };
  try {
    const res = await fetch(`${String(origin).replace(/\/$/, '')}/api/agent/session`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Anixart-User-Id': String(Math.trunc(userId)),
        'X-Anixart-Token': String(token),
      },
      signal: AbortSignal.timeout(15000),
    });
    const data = await res.json().catch(() => null);
    if (!res.ok || !data?.session) return { ok: false, status: res.status, error: data?.error ?? `HTTP ${res.status}` };
    return { ok: true, session: data.session, expires_at: data.expires_at };
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) };
  }
}

module.exports = { requestAgentSession };
