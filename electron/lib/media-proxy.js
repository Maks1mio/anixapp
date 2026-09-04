'use strict';

const { Readable } = require('stream');
const { VIDEO_HOSTS } = require('./constants');
const { cookieForUrl } = require('./playback-cookies');

const BROWSER_UA =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36';

const EXTRA_MEDIA_HOSTS = [
  'vkuservideo.net',
  'okcdn.ru',
  'userapi.com',
  'mycdn.me',
  'rutubelist.ru',
  'rutube.ru',
  'kinescope.io',
  'collaps.cc',
  'studiomir.club',
  'animedia.tv',
  'zerocdn.com',
  'imgsmail.ru',
  'mail.ru',
  'myvi.top',
  'myvi.tv',
  'secvideo1.online',
  'csst.online',
  'sstrge.online',
  'sovetromantica.com',
];

const ALLOW_HOSTS = [...VIDEO_HOSTS, ...EXTRA_MEDIA_HOSTS];
const FETCH_TIMEOUT_MS = 12_000;

function hostAllowed(host) {
  const h = String(host || '').replace(/^www\./, '').toLowerCase();
  if (!h) return false;
  if (ALLOW_HOSTS.some((allowed) => h === allowed || h.endsWith('.' + allowed))) return true;
  try {
    const { hostIsExtraVideoHost } = require('./extra-video-hosts');
    if (hostIsExtraVideoHost(h)) return true;
  } catch { /* ignore */ }
  return false;
}

function isAllowedMediaUrl(raw) {
  let parsed;
  try {
    parsed = new URL(raw);
  } catch {
    return false;
  }
  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') return false;
  return hostAllowed(parsed.host);
}

function refererFor(url, overrideRef) {
  if (overrideRef && typeof overrideRef === 'string' && overrideRef.startsWith('http')) {
    return overrideRef;
  }
  const host = (() => {
    try { return new URL(url).host.replace(/^www\./, ''); } catch { return ''; }
  })();
  if (host.includes('sibnet')) return url.includes('shell.php') ? url : 'https://video.sibnet.ru/';
  if (host.includes('kodik') || host.includes('solodcdn') || host.includes('kodik-storage') || host.includes('zerocdn')) {
    return 'https://kodikplayer.com/';
  }
  if (host.includes('animedia')) return 'https://kodikplayer.com/';
  if (host.includes('libria') || host.includes('anilib')) return 'https://anilibria.top/';
  if (/^vkvd/i.test(host) || host.includes('vkuservideo')) return 'https://vk.com/';
  if (host.includes('okcdn') || host.includes('mycdn')) return 'https://ok.ru/';
  if (host.includes('studiomir')) return 'https://api.studiomir.club/';
  if (host.includes('rutube')) return 'https://rutube.ru/';
  if (host.includes('mail.ru') || host.includes('imgsmail')) return 'https://my.mail.ru/';
  if (host.includes('myvi')) return 'https://www.myvi.top/';
  if (/secvideo1|csst\.online|sstrge/.test(host)) return 'https://secvideo1.online/';
  if (host.includes('sovetromantica')) return 'https://sovetromantica.com/';
  return 'https://anixart.tv/';
}

function isKodikCdn(url) {
  try {
    return /solodcdn|kodik-storage|zerocdn|animedia|kodik-cdn/i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function toKodikHlsUrl(url) {
  if (!url || /:hls:/i.test(url)) return url;
  try {
    const parsed = new URL(url);
    if (isKodikCdn(url) && /\.mp4$/i.test(parsed.pathname)) {
      parsed.pathname += ':hls:manifest.m3u8';
      return parsed.href;
    }
  } catch { /* keep */ }
  return url;
}

function isKodikEdgeHost(host) {
  const h = String(host || '').replace(/^www\./, '').toLowerCase();
  return /^(bingo|shadow)\.cloud\.solodcdn\.com$/i.test(h);
}

function isShadowHost(url) {
  try {
    return isKodikEdgeHost(new URL(url).hostname) || /^shadow\./i.test(new URL(url).hostname);
  } catch {
    return false;
  }
}

function proxyPath(targetUrl, ref, cookie) {
  const prefix = process.env.ANIX_MEDIA_PROXY_PREFIX || '/__anix/media';
  let p = `${prefix}?u=${encodeURIComponent(targetUrl)}`;
  if (ref && typeof ref === 'string' && ref.startsWith('http')) {
    p += `&ref=${encodeURIComponent(ref)}`;
  }
  if (cookie) p += `&ck=${encodeURIComponent(cookie)}`;
  return p;
}

function rewriteM3u8(text, baseUrl, ref, cookie) {
  const resolve = (raw) => {
    try {
      return new URL(raw, baseUrl).href;
    } catch {
      return raw;
    }
  };
  const rewriteUriAttr = (line) => line.replace(/URI="([^"]+)"/gi, (_, u) => {
    const abs = resolve(u);
    return `URI="${isAllowedMediaUrl(abs) ? proxyPath(abs, ref, cookie) : abs}"`;
  });

  return text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) return rewriteUriAttr(line);
    const abs = resolve(trimmed);
    return isAllowedMediaUrl(abs) ? proxyPath(abs, ref, cookie) : trimmed;
  }).join('\n');
}

function isPlaylistUrl(url, contentType) {
  const ct = String(contentType || '').toLowerCase();
  if (ct.includes('mpegurl') || ct.includes('x-mpegurl')) return true;
  if (/\.m3u8(\?|$)/i.test(url) || /:hls:(manifest|hls)\.m3u8/i.test(url)) return true;
  if (/okcdn\.ru/i.test(url) && /\/video\/?(\?|$)/i.test(url)) return true;
  return false;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, HEAD, OPTIONS',
    'Access-Control-Allow-Headers': 'Range, Content-Type',
    'Access-Control-Expose-Headers': 'Content-Length, Content-Range, Accept-Ranges, Content-Type',
  };
}

async function drain(res) {
  try { await res.arrayBuffer(); } catch { /* ignore */ }
}

async function fetchOnce(url, method, headers) {
  let timeoutMs = FETCH_TIMEOUT_MS;
  try {
    if (isKodikEdgeHost(new URL(url).hostname)) timeoutMs = 4_000;
  } catch { /* keep default */ }
  return fetch(url, {
    method,
    headers,
    redirect: 'manual',
    signal: AbortSignal.timeout(timeoutMs),
  });
}

async function fetchMedia(url, method, headers, hops = 0) {
  if (hops > 6) throw new Error('Too many redirects');
  const res = await fetchOnce(url, method, headers);
  if (![301, 302, 303, 307, 308].includes(res.status)) return { res, finalUrl: url };

  const loc = res.headers.get('location');
  await drain(res);
  if (!loc) return { res, finalUrl: url };

  let next;
  try { next = new URL(loc, url).href; } catch { next = loc; }
  if (!isAllowedMediaUrl(next)) throw new Error('Redirect host not allowed');

  // edge (bingo/shadow) с части сетей недоступен — не уходим в 12s+ таймаут
  if (isKodikEdgeHost(new URL(next).hostname) && isKodikCdn(url)) {
    throw new Error('Kodik CDN edge unreachable');
  }

  // shadow.* — пробуем HLS на origin (legacy)
  if (isShadowHost(next) && isKodikCdn(url)) {
    const hls = toKodikHlsUrl(url);
    if (hls && hls !== url) return fetchMedia(hls, method, headers, hops + 1);
  }

  return fetchMedia(next, method, headers, hops + 1);
}

async function proxyMediaRequest(req, res, targetUrl, refOverride, cookieOverride) {
  if (!isAllowedMediaUrl(targetUrl)) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() });
    res.end(JSON.stringify({ ok: false, error: 'Host not allowed' }));
    return;
  }

  const preferred = toKodikHlsUrl(targetUrl);
  const cookie = cookieForUrl(preferred, cookieOverride);
  const headers = {
    'User-Agent': BROWSER_UA,
    Referer: refererFor(preferred, refOverride),
    Accept: '*/*',
  };
  if (cookie) headers.Cookie = cookie;
  if (req.headers.range) headers.Range = req.headers.range;

  const method = req.method === 'HEAD' ? 'HEAD' : 'GET';
  let upstream;
  let finalUrl = preferred;
  try {
    const first = await fetchMedia(preferred, method, headers);
    upstream = first.res;
    finalUrl = first.finalUrl || preferred;
    if ((!upstream.ok && upstream.status !== 206) && preferred !== targetUrl) {
      await drain(upstream);
      const fallback = await fetchMedia(targetUrl, method, headers);
      upstream = fallback.res;
      finalUrl = fallback.finalUrl || targetUrl;
    }
  } catch (err) {
    const timedOut = err?.name === 'TimeoutError' || err?.name === 'AbortError';
    res.writeHead(timedOut ? 504 : 502, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() });
    res.end(JSON.stringify({ ok: false, error: timedOut ? 'Upstream timeout' : String(err?.message || err) }));
    return;
  }

  const ct = upstream.headers.get('content-type') || '';

  if (isPlaylistUrl(finalUrl, ct) && req.method !== 'HEAD') {
    const text = await upstream.text();
    const rewritten = rewriteM3u8(text, finalUrl, refOverride, cookie);
    res.writeHead(200, {
      ...corsHeaders(),
      'Content-Type': 'application/vnd.apple.mpegurl',
      'Cache-Control': 'no-store',
    });
    res.end(rewritten);
    return;
  }

  const out = { ...corsHeaders() };
  if (ct) out['Content-Type'] = ct;
  const cl = upstream.headers.get('content-length');
  if (cl) out['Content-Length'] = cl;
  const cr = upstream.headers.get('content-range');
  if (cr) out['Content-Range'] = cr;
  const ar = upstream.headers.get('accept-ranges');
  out['Accept-Ranges'] = ar || 'bytes';
  const cd = upstream.headers.get('content-disposition');
  if (cd) out['Content-Disposition'] = cd;

  res.writeHead(upstream.status, out);
  if (req.method === 'HEAD' || !upstream.body) {
    res.end();
    return;
  }

  const nodeStream = Readable.fromWeb(upstream.body);
  nodeStream.on('error', () => {
    try { res.destroy(); } catch { /* ignore */ }
  });
  nodeStream.pipe(res);
}

module.exports = {
  hostAllowed,
  isAllowedMediaUrl,
  proxyPath,
  rewriteM3u8,
  proxyMediaRequest,
  corsHeaders,
  EXTRA_MEDIA_HOSTS,
};
