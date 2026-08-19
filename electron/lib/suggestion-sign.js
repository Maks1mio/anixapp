'use strict';

const { createHmac, randomBytes } = require('crypto');

function getSecret() {
  return String(process.env.SUGGESTION_HMAC_SECRET || '').trim();
}

function canonical({ userId, userLogin, anixartId, bannerUrl, trailerUrl, anonymous, ts, nonce }) {
  return [
    'v1',
    String(userId),
    userLogin || '',
    String(anixartId),
    bannerUrl || '',
    trailerUrl || '',
    anonymous ? '1' : '0',
    String(ts),
    nonce,
  ].join('\n');
}

function signSuggestion({ userId, userLogin, anixartId, bannerUrl, trailerUrl, anonymous }) {
  const secret = getSecret();
  if (secret.length < 32) {
    throw new Error('Не задан SUGGESTION_HMAC_SECRET');
  }
  const ts = Date.now();
  const nonce = randomBytes(16).toString('hex');
  const payload = {
    userId,
    userLogin: userLogin || '',
    anixartId,
    bannerUrl: bannerUrl || '',
    trailerUrl: trailerUrl || '',
    anonymous: anonymous === true,
    ts,
    nonce,
  };
  const sig = createHmac('sha256', secret)
    .update(canonical(payload), 'utf8')
    .digest('hex');
  return { ...payload, sig };
}

function signQuota({ userId }) {
  const secret = getSecret();
  if (secret.length < 32) {
    throw new Error('Не задан SUGGESTION_HMAC_SECRET');
  }
  const ts = Date.now();
  const nonce = randomBytes(16).toString('hex');
  const payload = { userId, ts, nonce };
  const canonical = ['v1-quota', String(userId), String(ts), nonce].join('\n');
  const sig = createHmac('sha256', secret).update(canonical, 'utf8').digest('hex');
  return { ...payload, sig };
}

module.exports = { signSuggestion, signQuota, getSecret };
