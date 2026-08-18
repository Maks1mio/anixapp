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

function isEmbedMediaReferer(ref) {
  if (!ref || typeof ref !== 'string') return false;
  return /video_ext|videoembed|vkvideo\.ru|ok\.ru\/video|kodikplayer|shell\.php|studiomir|rutube\.ru\/play\/embed|anilib|myvi\.|secvideo1/i.test(ref);
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
    if (preservedReferer && isEmbedMediaReferer(preservedReferer)) {
      upsertHeader(requestHeaders, 'Referer', preservedReferer);
    } else if (host === 'video.sibnet.ru' || host.endsWith('.sibnet.ru')) {
      upsertHeader(requestHeaders, 'Referer', 'https://video.sibnet.ru/');
    } else if (/^vkvd/i.test(host) || host.includes('vkuservideo')) {
      upsertHeader(requestHeaders, 'Referer', 'https://vk.com/');
    } else if (host.includes('okcdn') || host.includes('mycdn')) {
      upsertHeader(requestHeaders, 'Referer', 'https://ok.ru/');
    } else if (host.includes('studiomir')) {
      upsertHeader(requestHeaders, 'Referer', 'https://api.studiomir.club/');
    } else if (host.includes('rutube')) {
      upsertHeader(requestHeaders, 'Referer', 'https://rutube.ru/');
    } else if (host.endsWith('kodik-cdn.com') || host.includes('kodik-storage') || host.includes('solodcdn')) {
      upsertHeader(requestHeaders, 'Referer', 'https://kodikplayer.com/');
      // Progressive /s/m/ edges на solodcdn стабильнее с браузерным UA (как SwiftPlayer).
      upsertHeader(requestHeaders, 'User-Agent', BROWSER_UA);
    } else if (host.includes('libria') || host.includes('anilib')) {
      upsertHeader(requestHeaders, 'Referer', preservedReferer || details.referrer || 'https://anilibria.top/');
    } else if (preservedReferer) {
      upsertHeader(requestHeaders, 'Referer', preservedReferer);
    }
    const useBrowserUa =
      host === 'kodikplayer.com'
      || host.includes('sibnet')
      || host.includes('solodcdn')
      || host.includes('kodik-storage')
      || host.endsWith('kodik-cdn.com')
      || host.includes('rutube')
      || host.includes('okcdn')
      || host.includes('vkuservideo')
      || host.includes('userapi')
      || host.includes('mycdn')
      || host.includes('studiomir');
    if (useBrowserUa) {
      upsertHeader(requestHeaders, 'User-Agent', BROWSER_UA);
    } else {
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
      const rutubeCdn = host.endsWith('.rutube.ru') && host !== 'rutube.ru' && host !== 'www.rutube.ru';
      if (!rutubeCdn) {
        callback({ responseHeaders: details.responseHeaders });
        return;
      }
    }
    const responseHeaders = { ...details.responseHeaders };
    upsertHeader(responseHeaders, 'Access-Control-Allow-Origin', '*');
    upsertHeader(responseHeaders, 'Access-Control-Allow-Headers', '*');
    callback({ responseHeaders });
  });
}

module.exports = { setupSessionRequestHeaders };
