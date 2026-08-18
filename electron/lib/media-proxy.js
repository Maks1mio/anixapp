'use strict';

const { Readable } = require('stream');
const { VIDEO_HOSTS } = require('./constants');

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
];

const ALLOW_HOSTS = [...VIDEO_HOSTS, ...EXTRA_MEDIA_HOSTS];

function hostAllowed(host) {
  const h = String(host || '').replace(/^www\./, '').toLowerCase();
  if (!h) return false;
  return ALLOW_HOSTS.some((allowed) => h === allowed || h.endsWith('.' + allowed));
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
  if (host.includes('kodik') || host.includes('solodcdn') || host.includes('kodik-storage')) {
    return 'https://kodikplayer.com/';
  }
  if (host.includes('libria') || host.includes('anilib')) return 'https://anilibria.top/';
  if (/^vkvd/i.test(host) || host.includes('vkuservideo')) return 'https://vk.com/';
  if (host.includes('okcdn') || host.includes('mycdn')) return 'https://ok.ru/';
  if (host.includes('studiomir')) return 'https://api.studiomir.club/';
  if (host.includes('rutube')) return 'https://rutube.ru/';
  return 'https://anixart.tv/';
}

function proxyPath(targetUrl, ref) {
  let p = `/__anix/media?u=${encodeURIComponent(targetUrl)}`;
  if (ref && typeof ref === 'string' && ref.startsWith('http')) {
    p += `&ref=${encodeURIComponent(ref)}`;
  }
  return p;
}

function rewriteM3u8(text, baseUrl, ref) {
  const resolve = (raw) => {
    try {
      return new URL(raw, baseUrl).href;
    } catch {
      return raw;
    }
  };
  const rewriteUriAttr = (line) => line.replace(/URI="([^"]+)"/gi, (_, u) => {
    const abs = resolve(u);
    return `URI="${isAllowedMediaUrl(abs) ? proxyPath(abs, ref) : abs}"`;
  });

  return text.split(/\r?\n/).map((line) => {
    const trimmed = line.trim();
    if (!trimmed) return line;
    if (trimmed.startsWith('#')) return rewriteUriAttr(line);
    const abs = resolve(trimmed);
    return isAllowedMediaUrl(abs) ? proxyPath(abs, ref) : trimmed;
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

async function proxyMediaRequest(req, res, targetUrl, refOverride) {
  if (!isAllowedMediaUrl(targetUrl)) {
    res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8', ...corsHeaders() });
    res.end(JSON.stringify({ ok: false, error: 'Host not allowed' }));
    return;
  }

  const headers = {
    'User-Agent': BROWSER_UA,
    Referer: refererFor(targetUrl, refOverride),
    Accept: '*/*',
  };
  if (req.headers.range) headers.Range = req.headers.range;
  if (req.headers['accept-encoding']) {
    // Avoid compressed playlists we then rewrite; video bytes can stay identity.
  }

  const upstream = await fetch(targetUrl, {
    method: req.method === 'HEAD' ? 'HEAD' : 'GET',
    headers,
    redirect: 'follow',
  });

  const ct = upstream.headers.get('content-type') || '';
  const finalUrl = upstream.url || targetUrl;

  if (isPlaylistUrl(finalUrl, ct) && req.method !== 'HEAD') {
    const text = await upstream.text();
    const rewritten = rewriteM3u8(text, finalUrl, refOverride);
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
