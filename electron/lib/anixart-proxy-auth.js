'use strict';

/**
 * Injects X-AnixApp-Proxy-Key on fetches to api.anixapp.com/anixart-api
 * so only this Electron app can use the backup proxy.
 */

const PROXY_HOST_MARK = 'api.anixapp.com/anixart-api';
const HEADER = 'x-anixapp-proxy-key';

let installed = false;
let rawFetch = null;

function getProxyAppKey() {
  return String(process.env.ANIXART_PROXY_APP_KEY || process.env.ANIXAPP_PROXY_KEY || '').trim();
}

function urlOf(input) {
  if (typeof input === 'string') return input;
  if (input && typeof input.url === 'string') return input.url;
  try {
    return String(input);
  } catch {
    return '';
  }
}

function isAnixartProxyUrl(url) {
  return String(url || '').includes(PROXY_HOST_MARK);
}

function withProxyKeyHeaders(init, key) {
  const headers = new Headers(init?.headers || undefined);
  headers.set(HEADER, key);
  return { ...init, headers };
}

function installAnixartProxyFetchAuth() {
  if (installed) return;
  installed = true;
  rawFetch = globalThis.fetch.bind(globalThis);

  globalThis.fetch = (input, init) => {
    const key = getProxyAppKey();
    const url = urlOf(input);
    if (key && isAnixartProxyUrl(url)) {
      return rawFetch(input, withProxyKeyHeaders(init || {}, key));
    }
    return rawFetch(input, init);
  };
}

async function fetchAnixartProxy(pathOrUrl, init = {}) {
  installAnixartProxyFetchAuth();
  const key = getProxyAppKey();
  const base = 'https://api.anixapp.com/anixart-api';
  const url = String(pathOrUrl || '').startsWith('http')
    ? String(pathOrUrl)
    : `${base}${String(pathOrUrl || '').startsWith('/') ? pathOrUrl : `/${pathOrUrl || ''}`}`;
  const headers = new Headers(init.headers || undefined);
  if (key) headers.set(HEADER, key);
  return rawFetch(url, { ...init, headers });
}

module.exports = {
  HEADER,
  getProxyAppKey,
  installAnixartProxyFetchAuth,
  fetchAnixartProxy,
  isAnixartProxyUrl,
};
