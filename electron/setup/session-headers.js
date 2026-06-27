'use strict';

const { session } = require('electron');
const {
  ANIXART_CDN_HOSTS,
  ANIXART_SITE_ORIGIN,
  ANIXART_SITE_REFERER,
  BROWSER_UA,
} = require('../cdn-proxy');
const { ANIXART_UA, VIDEO_HOSTS, EMBED_MEDIA_HOSTS } = require('../lib/constants');

function hostMatchesList(host, list) {
  return list.some((h) => host === h || host.endsWith('.' + h));
}

function upsertHeader(headers, name, value) {
  const lower = name.toLowerCase();
  for (const k of Object.keys(headers)) {
    if (k.toLowerCase() === lower) { headers[k] = value; return; }
  }
  headers[name] = value;
}

function applyAnixartSiteHeaders(requestHeaders) {
  upsertHeader(requestHeaders, 'Referer', ANIXART_SITE_REFERER);
  upsertHeader(requestHeaders, 'Origin', ANIXART_SITE_ORIGIN);
  upsertHeader(requestHeaders, 'User-Agent', BROWSER_UA);
  upsertHeader(requestHeaders, 'Accept', 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8');
  upsertHeader(requestHeaders, 'Accept-Language', 'ru-RU,ru;q=0.9,en-US;q=0.8,en;q=0.7');
  upsertHeader(requestHeaders, 'sec-ch-ua', '"Chromium";v="122", "Not(A:Brand";v="24", "Google Chrome";v="122"');
  upsertHeader(requestHeaders, 'sec-ch-ua-mobile', '?0');
  upsertHeader(requestHeaders, 'sec-ch-ua-platform', '"Windows"');
}

function hostUrlPatterns(hosts) {
  return hosts.flatMap((h) => [`*://*.${h}/*`, `*://${h}/*`]);
}

function setupSessionRequestHeaders() {
  const ses = session.defaultSession;
  const cdnPatterns = hostUrlPatterns(ANIXART_CDN_HOSTS);
  const videoPatterns = hostUrlPatterns(VIDEO_HOSTS);

  ses.webRequest.onBeforeSendHeaders({ urls: cdnPatterns }, (details, callback) => {
    const requestHeaders = { ...details.requestHeaders };
    applyAnixartSiteHeaders(requestHeaders);
    callback({ requestHeaders });
  });

  ses.webRequest.onBeforeSendHeaders({ urls: videoPatterns }, (details, callback) => {
    let host;
    try { host = new URL(details.url).host.replace(/^www\./, ''); } catch (_) { callback({ requestHeaders: details.requestHeaders }); return; }
    const requestHeaders = { ...details.requestHeaders };
    let preservedReferer = '';
    for (const k of Object.keys(requestHeaders)) {
      if (k.toLowerCase() === 'referer') {
        preservedReferer = requestHeaders[k];
        delete requestHeaders[k];
        break;
      }
    }
    if (host === 'video.sibnet.ru') {
      upsertHeader(requestHeaders, 'Referer', details.url);
    } else if (host.endsWith('.sibnet.ru')) {
      upsertHeader(requestHeaders, 'Referer', 'https://video.sibnet.ru/');
    } else if (host.endsWith('kodik-cdn.com') || host.includes('kodik-storage') || host.includes('solodcdn')) {
      upsertHeader(requestHeaders, 'Referer', 'https://kodikplayer.com/');
    } else if (host.includes('libria') || host.includes('anilib')) {
      upsertHeader(requestHeaders, 'Referer', preservedReferer || details.referrer || 'https://anilibria.top/');
    } else if (preservedReferer) {
      upsertHeader(requestHeaders, 'Referer', preservedReferer);
    }
    if (host !== 'kodikplayer.com' && host !== 'video.sibnet.ru') {
      upsertHeader(requestHeaders, 'User-Agent', ANIXART_UA);
      upsertHeader(requestHeaders, 'sec-ch-ua', '"AnixartApp"');
      upsertHeader(requestHeaders, 'sec-ch-ua-mobile', '?1');
      upsertHeader(requestHeaders, 'sec-ch-ua-platform', 'Android');
    }
    callback({ requestHeaders });
  });

  ses.webRequest.onHeadersReceived({ urls: videoPatterns }, (details, callback) => {
    let host;
    try { host = new URL(details.url).host.replace(/^www\./, ''); } catch (_) { callback({ responseHeaders: details.responseHeaders }); return; }
    if (hostMatchesList(host, EMBED_MEDIA_HOSTS)) {
      callback({ responseHeaders: details.responseHeaders });
      return;
    }
    const responseHeaders = { ...details.responseHeaders };
    upsertHeader(responseHeaders, 'Access-Control-Allow-Origin', '*');
    upsertHeader(responseHeaders, 'Access-Control-Allow-Headers', '*');
    callback({ responseHeaders });
  });
}

module.exports = { setupSessionRequestHeaders };
