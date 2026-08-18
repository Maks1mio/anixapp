'use strict';

const byHost = new Map();

function hostOf(urlOrHost) {
  const raw = String(urlOrHost || '');
  try {
    return (raw.includes('://') ? new URL(raw).hostname : raw).replace(/^www\./, '').toLowerCase();
  } catch {
    return raw.replace(/^www\./, '').toLowerCase();
  }
}

function rememberCookies(urlOrHost, cookieHeader) {
  const cookie = String(cookieHeader || '').trim();
  if (!cookie) return;
  const host = hostOf(urlOrHost);
  if (!host) return;
  byHost.set(host, cookie);
  if (host === 'my.mail.ru' || host.endsWith('.mail.ru')) {
    byHost.set('mail.ru', cookie);
    byHost.set('my.mail.ru', cookie);
    byHost.set('imgsmail.ru', cookie);
  }
}

function cookieForUrl(url, override) {
  if (override && String(override).trim()) return String(override).trim();
  const host = hostOf(url);
  if (!host) return '';
  if (byHost.has(host)) return byHost.get(host);
  for (const [savedHost, cookie] of byHost) {
    if (host === savedHost || host.endsWith('.' + savedHost) || savedHost.endsWith('.' + host)) {
      return cookie;
    }
  }
  if (/mail\.ru|imgsmail\.ru/i.test(host)) {
    return byHost.get('imgsmail.ru') || byHost.get('my.mail.ru') || byHost.get('mail.ru') || '';
  }
  return '';
}

module.exports = { rememberCookies, cookieForUrl };
