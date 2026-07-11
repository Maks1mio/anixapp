'use strict';

const path = require('path');
const fs = require('fs');
const { Readable } = require('stream');
const { pipeline } = require('stream/promises');
const { spawn, execFile } = require('child_process');
const { promisify } = require('util');
const { session, net, dialog, shell, app, ipcMain } = require('electron');
const { SibnetParser } = require('anixapi');
const { BROWSER_UA } = require('../cdn-proxy');
const { ANIXART_UA } = require('../lib/constants');
const config = require('../lib/config-store');
const state = require('../lib/app-state');
const { formatDownloadError, extractRawMessage } = require('../lib/download-errors');
const downloadQueue = require('../lib/download-queue');
const { nodeFetchBuffer } = downloadQueue;
const { saveFolderMeta, getFolderMeta, parseEpisodeFromFilename } = require('../lib/download-meta');

const DOWNLOAD_VIDEO_EXT = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v']);
const MIN_DOWNLOAD_VIDEO_BYTES = 256 * 1024;

const media = {
  getDownloadDirectory: null,
  setDownloadDirectory: null,
};

function register(deps) {
  const { appendLog } = deps;

async function getSibnetDirectLink(embedUrl) {
  const SIBNET_HEADERS = {
    'User-Agent':      BROWSER_UA,
    'Referer':         'https://sibnet.ru/',
    'Accept':          'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
    'Accept-Language': 'ru-RU,ru;q=0.9,en-US;q=0.8',
  };

  // Этап 1 — SibnetParser с принудительным сбросом lastIndex (/g-флаг!)
  try {
    if (SibnetParser.srcMatch) SibnetParser.srcMatch.lastIndex = 0;
    const direct = await SibnetParser.getDirectLink(embedUrl);
    if (direct && !direct.includes('404')) {
      return direct.startsWith('http') ? direct : `https:${direct}`;
    }
  } catch {}

  // Этап 2 — собственный fetch с браузерными заголовками
  // Повторяет логику SibnetParser, но с нормальным User-Agent
  try {
    const pageRes = await fetch(embedUrl, { headers: SIBNET_HEADERS });
    const html    = await pageRes.text();

    // Sibnet кладёт src-путь видео в строку: src: "/shell.php?video_pid=...&d=...&s=..."
    const SRC_RE = /src:\s*("\/[^"]+?")/i;
    const m = SRC_RE.exec(html);
    if (m) {
      const srcPath   = m[1].replace(/"/g, '');
      const videoUrl  = `https://video.sibnet.ru${srcPath}`;

      // Следуем редиректу — финальный URL и есть прямая ссылка на поток
      const streamRes = await fetch(videoUrl, {
        headers:  { 'Referer': embedUrl, 'User-Agent': BROWSER_UA },
        redirect: 'follow',
      });
      // streamRes.url — URL после всех редиректов (реальный CDN)
      if (streamRes.url && streamRes.url !== videoUrl) return streamRes.url;
      return videoUrl; // если редиректов нет — сам signed-URL уже работает
    }
  } catch {}

  return null;
}

const KODIK_PLAYER_ORIGIN = 'https://kodikplayer.com/';
const KODIK_VALID_SRC = /\/\/(get|cloud)\.(kodik-storage|solodcdn)\.com\/useruploads\/.*?\/.*?\/(240|360|480|720|1080)\.mp4:hls:manifest\.m3u8/;

function normalizeKodikEmbedUrl(embedUrl) {
  let url = embedUrl.startsWith('http') ? embedUrl : `https:${embedUrl}`;
  try {
    const u = new URL(url);
    url = u.origin + u.pathname;
  } catch {}
  return url;
}

function decryptKodikSrc(src) {
  const zCharCode = 'Z'.charCodeAt(0);
  const decryptedBase64 = src.replace(/[a-zA-Z]/g, (e) => {
    let eCharCode = e.charCodeAt(0);
    return String.fromCharCode(
      (eCharCode <= zCharCode ? 90 : 122) >= (eCharCode = eCharCode + 18) ? eCharCode : eCharCode - 26,
    );
  });
  return atob(decryptedBase64);
}

function parseKodikLinkFromUrl(pageUrl) {
  const m = pageUrl.match(/\/(seria|video|movie|anime)\/(\d+)\/([0-9a-f]+)\//i);
  if (!m) return null;
  return { type: m[1], id: m[2], hash: m[3] };
}

function parseKodikEmbedHtml(html) {
  const hash = html.match(/\w+\.hash\s=\s'([^']+)';/is)?.[1];
  const id = html.match(/\w+\.id\s=\s'([^']+)';/is)?.[1];
  const type = html.match(/\w+\.type\s=\s'([^']+)';/is)?.[1];
  return { hash, id, type };
}

function decryptKodikLinks(links) {
  if (!links || typeof links !== 'object') return null;
  for (const [, sources] of Object.entries(links)) {
    if (!Array.isArray(sources)) continue;
    for (const source of sources) {
      if (!source?.src || KODIK_VALID_SRC.test(source.src)) continue;
      try {
        source.src = decryptKodikSrc(source.src);
      } catch {}
    }
  }
  return links;
}

/** /ftor только с type+hash+id — urlParams с localhost/_sign ломают запрос (500) */
async function fetchKodikFtorLinks(pageUrl, videoInfo) {
  const { type, hash, id } = videoInfo;
  if (!type || !hash || !id) return null;

  const ftorUrl = `https://kodikplayer.com/ftor?${new URLSearchParams({ type, hash, id }).toString()}`;
  let ftorBuf;
  if (typeof session.defaultSession.fetch === 'function') {
    const res = await session.defaultSession.fetch(ftorUrl, {
      headers: { Referer: pageUrl, Accept: 'application/json' },
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    ftorBuf = Buffer.from(await res.arrayBuffer());
  } else {
    ftorBuf = await sessionFetchBuffer(ftorUrl, { Referer: pageUrl, Accept: 'application/json' });
  }

  let payload;
  try {
    payload = JSON.parse(ftorBuf.toString('utf8'));
  } catch {
    return null;
  }
  if (!payload?.links || typeof payload.links !== 'object') return null;
  return decryptKodikLinks(payload.links);
}

async function getKodikDirectLinks(embedUrl) {
  const pageUrl = await resolveKodikEmbedUrl(embedUrl);
  let videoInfo = parseKodikLinkFromUrl(pageUrl);

  if (!videoInfo?.hash || !videoInfo?.id || !videoInfo?.type) {
    try {
      const html = await sessionFetchText(pageUrl, {
        Referer: KODIK_PLAYER_ORIGIN,
        Accept: 'text/html,application/xhtml+xml',
      });
      videoInfo = parseKodikEmbedHtml(html);
    } catch (e) {
      console.warn('kodik embed fetch:', e?.message || e);
    }
  }

  try {
    return await fetchKodikFtorLinks(pageUrl, videoInfo || {});
  } catch (e) {
    console.warn('kodik ftor:', e?.message || e);
  }
  return null;
}

async function resolveKodikEmbedUrl(embedUrl) {
  let url = normalizeKodikEmbedUrl(embedUrl);
  const host = (url.match(/https?:\/\/([^/]+)/) || [])[1] || '';
  if (host.includes('kodik')) return url;

  if (host.includes('aniqit') || host.includes('anixis') || host.includes('aniqart')) {
    const html = await sessionFetchText(url, {
      Referer: KODIK_PLAYER_ORIGIN,
      Accept: 'text/html,application/xhtml+xml',
    });
    const m = html.match(/https?:\\\/\\\/(?:[^\\/]+\.)?kodikplayer\.com\\\/seria\\\/[^"']+/i)
      ?? html.match(/(?:https:)?\/\/[^"'\s]*kodikplayer\.com\/seria\/[^"'\s]+/i);
    if (m) {
      let kodikUrl = m[0].replace(/\\/g, '');
      if (kodikUrl.startsWith('//')) kodikUrl = `https:${kodikUrl}`;
      return normalizeKodikEmbedUrl(kodikUrl);
    }
  }
  return url;
}

/** Загрузка через session Chromium — те же Referer/UA, что и у плеера */
function sessionFetchBuffer(url, headers = {}) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, session: session.defaultSession, redirect: 'follow' });
    const merged = { 'User-Agent': ANIXART_UA, ...headers };
    for (const [k, v] of Object.entries(merged)) {
      if (v != null && v !== '') req.setHeader(k, String(v));
    }
    const chunks = [];
    const fail = async (err) => {
      const base = extractRawMessage(err);
      if (/BLOCKED_BY_CLIENT|ERR_FAILED/i.test(base)) {
        try {
          resolve(await nodeFetchBuffer(url, merged));
          return;
        } catch (nodeErr) {
          reject(new Error(extractRawMessage(nodeErr) ? `${extractRawMessage(nodeErr)} @ ${url}` : url));
          return;
        }
      }
      reject(new Error(base ? `${base} @ ${url}` : url));
    };
    req.on('response', (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        reject(new Error(`HTTP ${res.statusCode} @ ${url}`));
        res.resume();
        return;
      }
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => resolve(Buffer.concat(chunks)));
      res.on('error', fail);
    });
    req.on('error', fail);
    req.end();
  });
}

async function sessionFetchText(url, headers = {}) {
  return (await sessionFetchBuffer(url, headers)).toString('utf8');
}

function sessionFetchStreamToFile(url, outputPath, headers = {}, onProgress = null) {
  return new Promise((resolve, reject) => {
    const req = net.request({ url, session: session.defaultSession, redirect: 'follow' });
    const merged = { 'User-Agent': ANIXART_UA, ...headers };
    for (const [k, v] of Object.entries(merged)) {
      if (v != null && v !== '') req.setHeader(k, String(v));
    }
    const filename = path.basename(outputPath);
    const fail = (err) => {
      try { ws.destroy(); } catch (_) {}
      const base = extractRawMessage(err);
      reject(new Error(base ? `${base} @ ${url}` : url));
    };
    const ws = fs.createWriteStream(outputPath);
    req.on('response', (res) => {
      if (res.statusCode && res.statusCode >= 400) {
        fail(new Error(`HTTP ${res.statusCode}`));
        res.resume();
        return;
      }
      const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
      let received = 0;
      let lastEmit = 0;
      res.on('data', (chunk) => {
        received += chunk.length;
        ws.write(chunk);
        const now = Date.now();
        if (onProgress && now - lastEmit >= 300) {
          lastEmit = now;
          onProgress(received, total);
        }
      });
      res.on('end', () => {
        ws.end();
        ws.on('finish', () => {
          if (onProgress) onProgress(received || 1, total || received || 1);
          resolve();
        });
      });
      res.on('error', fail);
      ws.on('error', fail);
    });
    req.on('error', fail);
    req.end();
  });
}

/** Прямые MP4 с embed AniLibria (как fallback в Android AniLibriaParser) */
async function scrapeAnilibriaDirectFiles(embedUrl, epNum) {
  try {
    const html = await sessionFetchText(embedUrl, {
      Accept: 'text/html,application/xhtml+xml',
      Referer: embedUrl.split('?')[0],
    });
    const blockRe = new RegExp(`"s${epNum}"[^]*?"file":"(.*?)"`, 's');
    const blockMatch = blockRe.exec(html);
    if (!blockMatch) return null;

    const raw = blockMatch[1].replace(/\\\//g, '/');
    const qualityMap = {};
    const qualRe = /\[(\d+)p\]([^,\[]+)/g;
    let m;
    while ((m = qualRe.exec(raw)) !== null) {
      const src = m[2].trim();
      if (src) qualityMap[m[1]] = src.startsWith('http') ? src : `https:${src}`;
    }
    if (Object.keys(qualityMap).length) return qualityMap;

    if (raw && !/^\[/.test(raw)) {
      const single = raw.startsWith('http') ? raw : `https:${raw}`;
      if (/\.(mp4|mkv|webm)(\?|$)/i.test(single)) return { '720': single };
    }
  } catch (_) {}
  return null;
}


async function resolveFfmpegPath() {
  if (state.ffmpegPathCache !== undefined) return state.ffmpegPathCache;

  try {
    const bundled = require('ffmpeg-static');
    if (typeof bundled === 'string' && fs.existsSync(bundled)) {
      state.ffmpegPathCache = bundled;
      return state.ffmpegPathCache;
    }
  } catch (_) {}

  const tryCmd = process.platform === 'win32' ? 'where ffmpeg' : 'which ffmpeg';
  try {
    const { stdout } = await execFileAsync(tryCmd, { shell: true });
    const line = stdout.trim().split(/\r?\n/).map(s => s.trim()).find(Boolean);
    if (line && fs.existsSync(line)) {
      state.ffmpegPathCache = line;
      return state.ffmpegPathCache;
    }
  } catch (_) {}

  state.ffmpegPathCache = null;
  return null;
}

function buildFfmpegHeaderArg(headers = {}) {
  const lines = [];
  if (headers.Referer) lines.push(`Referer: ${headers.Referer}`);
  lines.push(`User-Agent: ${headers['User-Agent'] || BROWSER_UA}`);
  return `${lines.join('\r\n')}\r\n`;
}

/** Разбор m3u8: master → media, список сегментов, нужна ли расшифровка */
async function resolveHlsSegments(m3u8Url, headers = {}) {
  const text = await sessionFetchText(m3u8Url, headers);
  if (text.includes('#EXT-X-STREAM-INF')) {
    const lines = text.split('\n');
    let bestUrl = null;
    let bestBw = 0;
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line.startsWith('#EXT-X-STREAM-INF')) continue;
      const bwMatch = /BANDWIDTH=(\d+)/i.exec(line);
      const bw = bwMatch ? parseInt(bwMatch[1], 10) : 0;
      const next = lines[i + 1]?.trim();
      if (next && !next.startsWith('#') && bw >= bestBw) {
        bestBw = bw;
        bestUrl = next.startsWith('http') ? next : new URL(next, m3u8Url).href;
      }
    }
    if (!bestUrl) throw new Error('В master-плейлисте нет потока');
    return resolveHlsSegments(bestUrl, headers);
  }

  const encrypted = /#EXT-X-KEY:/i.test(text);
  const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
  const segments = text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(s => (s.startsWith('http') ? s : baseUrl + s));

  if (segments.length === 0) throw new Error('В плейлисте нет сегментов');
  return { segments, encrypted };
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function hostFromSegmentUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

function hlsFetchPolicy(segments) {
  const host = hostFromSegmentUrl(segments[0] || '');
  if (/libria\.fun|anilibria/i.test(host)) {
    return { concurrency: 1, delayMs: 200, maxRetries: 6, retryBaseMs: 2000 };
  }
  if (/kodik|aniqit|moon|hdrezka/i.test(host)) {
    return { concurrency: 3, delayMs: 80, maxRetries: 4, retryBaseMs: 1500 };
  }
  return { concurrency: 6, delayMs: 0, maxRetries: 3, retryBaseMs: 1000 };
}

function isRetryableFetchError(err) {
  const raw = extractRawMessage(err);
  return /HTTP\s+429|HTTP\s+503|HTTP\s+502|ERR_FAILED|ECONNRESET|ETIMEDOUT/i.test(raw);
}

async function fetchBufferWithRetry(url, headers, policy) {
  let lastErr;
  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    try {
      return await sessionFetchBuffer(url, headers);
    } catch (err) {
      lastErr = err;
      if (!isRetryableFetchError(err) || attempt === policy.maxRetries) throw err;
      const delay = policy.retryBaseMs * Math.pow(1.8, attempt) + Math.random() * 400;
      await sleep(delay);
    }
  }
  throw lastErr;
}

/** Загрузка HLS-сегментов с ограничением параллелизма и повторами при 429 */
async function downloadHlsParallel(segments, outputPath, headers = {}, onProgress = null) {
  const total = segments.length;
  const policy = hlsFetchPolicy(segments);
  const pending = new Map();
  let nextWrite = 0;
  let nextFetch = 0;
  const CONCURRENCY = Math.min(policy.concurrency, total);
  const ws = fs.createWriteStream(outputPath);

  const flush = () => {
    while (pending.has(nextWrite)) {
      ws.write(pending.get(nextWrite));
      pending.delete(nextWrite);
      nextWrite++;
      if (onProgress) onProgress(nextWrite, total);
    }
  };

  async function worker() {
    while (nextFetch < total) {
      const i = nextFetch++;
      try {
        const buf = await fetchBufferWithRetry(segments[i], headers, policy);
        pending.set(i, buf);
        flush();
        if (policy.delayMs > 0) await sleep(policy.delayMs);
      } catch (err) {
        const formatted = formatDownloadError(err, {
          url: segments[i],
          segment: i,
          segmentTotal: total,
        });
        throw new Error(formatted);
      }
    }
  }

  const workers = Math.min(CONCURRENCY, total);
  await Promise.all(Array.from({ length: workers }, () => worker()));

  while (nextWrite < total) {
    await new Promise(r => setTimeout(r, 20));
    flush();
  }
  if (nextWrite !== total) throw new Error('Не все сегменты загружены');

  ws.end();
  await new Promise((resolve, reject) => {
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
}

async function remuxTsToMp4(inputPath, outputPath) {
  const ffmpeg = await resolveFfmpegPath();
  if (!ffmpeg) {
    fs.renameSync(inputPath, outputPath);
    return;
  }
  await new Promise((resolve, reject) => {
    const args = ['-y', '-hide_banner', '-loglevel', 'error', '-i', inputPath, '-c', 'copy', '-movflags', '+faststart', outputPath];
    const proc = spawn(ffmpeg, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (c) => { stderr += c.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg remux ${code}`));
    });
  });
}

/** HLS → MP4: параллельные сегменты или ffmpeg при шифровании */
async function downloadHlsToFile(m3u8Url, outputPath, headers = {}, onProgress = null) {
  const { segments, encrypted } = await resolveHlsSegments(m3u8Url, headers);
  if (encrypted) {
    await downloadWithFfmpeg(m3u8Url, outputPath, headers, onProgress);
    return;
  }

  const tmpPath = `${outputPath}.ts.part`;
  try {
    await downloadHlsParallel(segments, tmpPath, headers, onProgress);
    await remuxTsToMp4(tmpPath, outputPath);
  } finally {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
  }
}

/** HLS → MP4 через ffmpeg (fallback для зашифрованных потоков) */
async function downloadWithFfmpeg(inputUrl, outputPath, headers = {}, onProgress = null) {
  const ffmpeg = await resolveFfmpegPath();
  if (!ffmpeg) {
    throw new Error('Для HLS нужен ffmpeg. Установите ffmpeg и добавьте в PATH.');
  }

  return new Promise((resolve, reject) => {
    const args = [
      '-y', '-hide_banner', '-loglevel', 'error',
      '-headers', buildFfmpegHeaderArg(headers),
      '-i', inputUrl,
      '-c', 'copy',
      '-bsf:a', 'aac_adtstoasc',
      '-movflags', '+faststart',
      '-progress', 'pipe:1',
      '-nostats',
      outputPath,
    ];

    const proc = spawn(ffmpeg, args, { windowsHide: true });
    let durationUs = 0;
    let lastEmit = 0;

    proc.stdout.on('data', (chunk) => {
      for (const line of chunk.toString().split('\n')) {
        if (line.startsWith('duration=')) {
          const v = parseFloat(line.slice(9));
          if (Number.isFinite(v) && v > 0) durationUs = Math.round(v * 1e6);
        }
        if (line.startsWith('out_time_us=')) {
          const outUs = parseInt(line.slice(12), 10);
          if (!Number.isFinite(outUs) || !onProgress) continue;
          const now = Date.now();
          if (now - lastEmit < 350) continue;
          lastEmit = now;
          onProgress(outUs, durationUs > 0 ? durationUs : 0);
        }
      }
    });

    let stderr = '';
    proc.stderr.on('data', (c) => { stderr += c.toString(); });
    proc.on('error', reject);
    proc.on('close', (code) => {
      if (code === 0) {
        if (onProgress) onProgress(1, 1);
        resolve();
      } else {
        reject(new Error(stderr.trim() || `ffmpeg завершился с кодом ${code}`));
      }
    });
  });
}

/** Прямые ссылки на видео (как в AniDesk): парсеры anixartjs, чтобы не грузить embed в iframe и не получать 500 от aniqit.com */
ipcMain.handle('anix:getDirectVideoLink', async (_, embedUrl) => {
  const EMPTY = { directUrl: null, quality: null, qualityMap: {} };
  if (!embedUrl || typeof embedUrl !== 'string') return EMPTY;
  const url = embedUrl.startsWith('http') ? embedUrl : `https:${embedUrl}`;
  const host = (url.match(/https?:\/\/([^/]+)/) || [])[1] || '';
  const toAbs = (src) => (!src ? null : src.startsWith('http') ? src : `https:${src}`);
  const PRIO  = ['1080', '1080p', '720', '720p', '480', '480p', '360', '360p'];

  try {
    // ── Kodik (array format: { "720": [{ src }], ... }) ─────────────────
    if (host.includes('kodik') || host.includes('aniqit') || host.includes('anixis') || host.includes('aniqart')) {
      const links = await getKodikDirectLinks(url);
      if (!links || typeof links !== 'object') return EMPTY;
      // Strip :hls:manifest.m3u8 / :hls:hls.m3u8 suffix → direct MP4 download URL
      // (same approach as in the Android app's KodikParser.i())
      const stripHls = (u) => u
        ? u.replace(/:hls:manifest\.m3u8$/, '').replace(/:hls:hls\.m3u8$/, '')
        : u;
      const qualityMap = {};
      for (const [key, arr] of Object.entries(links)) {
        const src = toAbs(arr?.[0]?.src);
        if (src) qualityMap[key.replace('p', '')] = stripHls(src);
      }
      const best = PRIO.find(k => qualityMap[k]) || Object.keys(qualityMap)[0];
      const directUrl = qualityMap[best] || null;
      return {
        directUrl,
        quality: best || null,
        qualityMap,
        downloadHeaders: directUrl ? { 'Referer': 'https://kodikplayer.com/' } : {},
      };
    }

    // ── Sibnet — трёхэтапный парсер с браузерными заголовками ───────────
    if (host.includes('sibnet')) {
      const direct = await getSibnetDirectLink(url);
      if (!direct) return EMPTY;
      return { directUrl: direct, quality: '720', qualityMap: { '720': direct } };
    }

    // ── AniLibria / AniLiberty ──────────────────────────────────────────────
    // Не используем AniLibriaParser.getDirectLinks() из anixartjs — там regex с
    // флагом /g хранит lastIndex как статическое поле класса, из-за чего каждый
    // второй вызов возвращает null (lastIndex не сбрасывается между вызовами).
    if (host.includes('aniliberty') || host.includes('anilibria') || host.includes('libria')) {
      // Парсим id и ep из URL без /g-regex, чтобы избежать stateful lastIndex
      const parsed   = new URL(url);
      const releaseId = parsed.searchParams.get('id');
      const epOrdinal = parsed.searchParams.get('ep');
      if (!releaseId || !epOrdinal) return EMPTY;

      // Определяем домен API (aniliberty.top или api.anilibria.tv)
      const apiBase = host.includes('aniliberty') || host.includes('libria.fun')
        ? 'https://aniliberty.top/api/v1/anime/releases'
        : 'https://aniliberty.top/api/v1/anime/releases';

      const apiResp = await fetch(`${apiBase}/${releaseId}`);
      if (!apiResp.ok) return EMPTY;
      const body = await apiResp.json();
      if (!body?.episodes) return EMPTY;

      const ep = body.episodes.find(e => String(e.ordinal) === String(parseInt(epOrdinal, 10)));
      if (!ep) return EMPTY;

      // Прямые MP4 с embed-страницы (fallback как в Android AniLibriaParser)
      const directMap = await scrapeAnilibriaDirectFiles(url, parseInt(epOrdinal, 10));
      if (directMap && Object.keys(directMap).length) {
        const bestDirect = PRIO.find(k => directMap[k]) || Object.keys(directMap)[0];
        const directUrl = directMap[bestDirect] || null;
        return {
          directUrl,
          quality: bestDirect || null,
          qualityMap: directMap,
          downloadHeaders: { Referer: url.split('?')[0], 'User-Agent': BROWSER_UA },
        };
      }

      const qualityMap = {};
      if (ep.hls_1080) qualityMap['1080'] = toAbs(ep.hls_1080);
      if (ep.hls_720)  qualityMap['720']  = toAbs(ep.hls_720);
      if (ep.hls_480)  qualityMap['480']  = toAbs(ep.hls_480);
      if (!Object.keys(qualityMap).length) return EMPTY;

      const best = PRIO.find(k => qualityMap[k]) || Object.keys(qualityMap)[0];
      const directUrl = qualityMap[best] || null;
      return {
        directUrl,
        quality: best || null,
        qualityMap,
        isHls: /\.m3u8(\?|$)/i.test(directUrl || ''),
        downloadHeaders: { Referer: url.split('?')[0], 'User-Agent': BROWSER_UA },
      };
    }
  } catch (e) {
    console.error('getDirectVideoLink error:', e?.message || e);
  }
  return EMPTY;
});

function getDefaultDownloadDirectory() {
  return path.join(app.getPath('videos'), 'Anixapp');
}

function ensureDownloadDirectory(dir) {
  if (!dir) return;
  try {
    fs.mkdirSync(dir, { recursive: true });
  } catch (e) {
    console.warn('ensureDownloadDirectory:', e?.message || e);
  }
}

function getDownloadDirectory() {
  const raw = config.getRawConfig();
  const custom = raw.downloadDirectory;
  let dir;
  if (typeof custom === 'string' && custom.trim()) {
    dir = custom.trim();
  } else {
    dir = getDefaultDownloadDirectory();
  }
  ensureDownloadDirectory(dir);
  return dir;
}

function setDownloadDirectory(dir) {
  if (typeof dir !== 'string' || !dir.trim()) return false;
  config.saveConfig({ downloadDirectory: dir.trim() });
  return true;
}

function sanitizeDownloadDirName(name) {
  return String(name || 'downloads')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'downloads';
}

function guessTitleFromFilename(name) {
  const m = name.match(/^(.+?) [^ ]+ \d{2}\.\w+$/i);
  if (m) return m[1].trim();
  return name.replace(/\.[^.]+$/, '');
}

function scanDownloadLibrary(rootDir) {
  const groups = new Map();
  const addFile = (filePath, stat, groupName) => {
    const key = groupName || 'Без папки';
    if (!groups.has(key)) {
      const meta = getFolderMeta(rootDir, key);
      groups.set(key, {
        id: key,
        name: key,
        releaseId: meta?.releaseId ?? null,
        dubberId: meta?.dubberId ?? null,
        sourceId: meta?.sourceId ?? null,
        releaseTitle: meta?.releaseTitle ?? key,
        dubberName: meta?.dubberName ?? '',
        sourceName: meta?.sourceName ?? '',
        files: [],
      });
    }
    const ep = parseEpisodeFromFilename(path.basename(filePath));
    groups.get(key).files.push({
      name: path.basename(filePath),
      path: filePath,
      size: stat.size,
      modifiedAt: stat.mtimeMs,
      episodePosition: ep,
    });
  };

  if (!rootDir || !fs.existsSync(rootDir)) return [];

  let entries;
  try {
    entries = fs.readdirSync(rootDir, { withFileTypes: true });
  } catch {
    return [];
  }

  for (const ent of entries) {
    const full = path.join(rootDir, ent.name);
    if (ent.isDirectory()) {
      let files;
      try {
        files = fs.readdirSync(full);
      } catch {
        continue;
      }
      for (const f of files) {
        const fp = path.join(full, f);
        const ext = path.extname(f).toLowerCase();
        if (!DOWNLOAD_VIDEO_EXT.has(ext)) continue;
        try {
          addFile(fp, fs.statSync(fp), ent.name);
        } catch {}
      }
      continue;
    }
    const ext = path.extname(ent.name).toLowerCase();
    if (!DOWNLOAD_VIDEO_EXT.has(ext)) continue;
    try {
      addFile(full, fs.statSync(full), guessTitleFromFilename(ent.name));
    } catch {}
  }

  const list = [...groups.values()];
  for (const g of list) {
    g.files.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  }
  list.sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  return list;
}

function listDownloadsForRelease(releaseId) {
  const id = Number(releaseId);
  if (!Number.isFinite(id) || id <= 0) return [];
  const groups = scanDownloadLibrary(getDownloadDirectory());
  const files = [];
  for (const g of groups) {
    if (g.releaseId !== id) continue;
    for (const f of g.files) {
      files.push({
        episodePosition: f.episodePosition ?? null,
        path: f.path,
        name: f.name,
        size: f.size,
        dubberName: g.dubberName || '',
        sourceName: g.sourceName || '',
        folder: g.name,
      });
    }
  }
  files.sort((a, b) => {
    const ap = a.episodePosition ?? 9999;
    const bp = b.episodePosition ?? 9999;
    if (ap !== bp) return ap - bp;
    return a.name.localeCompare(b.name, 'ru');
  });
  return files;
}

function isValidDownloadVideoFile(filePath) {
  try {
    const st = fs.statSync(filePath);
    return st.isFile() && st.size >= MIN_DOWNLOAD_VIDEO_BYTES;
  } catch {
    return false;
  }
}

function findExistingDownloadFile(folder, filename) {
  const baseDir = getDownloadDirectory();
  const targetDir = folder
    ? path.join(baseDir, sanitizeDownloadDirName(folder))
    : baseDir;
  if (!fs.existsSync(targetDir)) return null;

  const parsed = path.parse(sanitizeDownloadName(filename));
  const ext = parsed.ext || '.mp4';
  const baseName = parsed.name || 'episode';

  const direct = path.join(targetDir, `${baseName}${ext}`);
  if (isValidDownloadVideoFile(direct)) return direct;

  for (let i = 2; i <= 30; i++) {
    const candidate = path.join(targetDir, `${baseName} (${i})${ext}`);
    if (!fs.existsSync(candidate)) break;
    if (isValidDownloadVideoFile(candidate)) return candidate;
  }
  return null;
}

ipcMain.handle('downloads:getSettings', () => ({
  directory: getDownloadDirectory(),
  defaultDirectory: getDefaultDownloadDirectory(),
}));

ipcMain.handle('downloads:pickDirectory', async () => {
  const result = await dialog.showOpenDialog(state.mainWindow ?? undefined, {
    title: 'Папка для загрузок',
    defaultPath: getDownloadDirectory(),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths?.[0]) return { ok: false };
  setDownloadDirectory(result.filePaths[0]);
  return { ok: true, directory: result.filePaths[0] };
});

ipcMain.handle('downloads:openDirectory', async (_, dir) => {
  const target = typeof dir === 'string' && dir.trim() ? dir : getDownloadDirectory();
  await shell.openPath(target);
});

ipcMain.handle('downloads:showFile', (_, filePath) => {
  if (typeof filePath === 'string' && filePath.trim()) {
    shell.showItemInFolder(filePath);
  }
});

ipcMain.handle('downloads:openFile', (_, filePath) => {
  if (typeof filePath === 'string' && filePath.trim()) {
    shell.openPath(filePath);
  }
});

ipcMain.handle('downloads:listLibrary', () => scanDownloadLibrary(getDownloadDirectory()));

ipcMain.handle('downloads:listByRelease', (_, releaseId) => listDownloadsForRelease(releaseId));

ipcMain.handle('downloads:checkFiles', (_, payload) => {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  getDownloadDirectory();
  return items.map((item) => {
    const folder = typeof item?.folder === 'string' ? item.folder : '';
    const filename = typeof item?.filename === 'string' ? item.filename : '';
    const filePath = findExistingDownloadFile(folder, filename);
    return { folder, filename, exists: !!filePath, path: filePath };
  });
});

/** Background download queue — sequential, one file at a time */
function isEmbedDownloadUrl(url) {
  return /\/(seria|video|movie|anime)\/\d+\/[0-9a-f]+\//i.test(url)
    && /kodikplayer\.com|kodik\.info|aniqit\.com|anixis\.com|aniqart\.com/i.test(url);
}

function getDownloadQueueDeps() {
  return {
    downloadHlsToFile,
    formatDownloadError,
    isEmbedPageUrl: isEmbedDownloadUrl,
  };
}

downloadQueue.setProgressSink((data) => {
  try { state.mainWindow?.webContents?.send('episode-download:progress', data); } catch (_) {}
});

ipcMain.handle('episode-download:queue', async (_, payload) => {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length === 0) return { ok: false, error: 'empty', items: [] };

  const baseDir = getDownloadDirectory();
  const queued = [];
  const deps = getDownloadQueueDeps();

  for (const item of items) {
    const url = typeof item?.url === 'string' ? item.url : '';
    const subFolder = typeof item?.folder === 'string' ? sanitizeDownloadDirName(item.folder) : '';
    const targetDir = subFolder ? path.join(baseDir, subFolder) : baseDir;
    try { fs.mkdirSync(targetDir, { recursive: true }); } catch {}
    const filePath = uniqueDownloadPath(targetDir, item?.filename || path.basename(url.split('?')[0]) || 'episode.mp4');
    const filename = path.basename(filePath);

    if (subFolder && item?.releaseId) {
      saveFolderMeta(baseDir, subFolder, {
        releaseId: item.releaseId,
        releaseTitle: item.releaseTitle || subFolder,
        dubberId: item.dubberId,
        sourceId: item.sourceId,
        dubberName: item.dubberName,
        sourceName: item.sourceName,
      });
    }

    const job = downloadQueue.enqueue({
      url,
      filePath,
      filename,
      headers: item?.headers,
      folder: subFolder,
      releaseId: item?.releaseId,
      sourceId: item?.sourceId,
      dubberId: item?.dubberId,
      episodePosition: item?.episodePosition,
      releaseTitle: item?.releaseTitle,
      dubberName: item?.dubberName,
      sourceName: item?.sourceName,
    }, deps);

    if (job) queued.push({ id: job.id, filename: job.filename });
  }

  return { ok: queued.length > 0, items: queued };
});

ipcMain.handle('downloads:cancel', (_, id) => {
  if (typeof id !== 'string' || !id) return { ok: false };
  return { ok: downloadQueue.cancelJob(id) };
});

ipcMain.handle('downloads:cancelAll', () => ({ ok: true, cancelled: downloadQueue.cancelAll() }));

ipcMain.handle('downloads:removeEntry', (_, id) => {
  if (typeof id !== 'string' || !id) return { ok: false };
  downloadQueue.cancelJob(id);
  return { ok: true };
});

ipcMain.handle('downloads:playInApp', async (_, payload) => {
  const filePath = typeof payload?.filePath === 'string' ? payload.filePath : '';
  const { player } = require('../windows/player');
  const isDownloading = payload?.status === 'downloading';
  const canStreamOnline = isDownloading
    && payload?.releaseId != null
    && payload?.sourceId != null
    && payload?.episodePosition != null;

  // Растущий MP4/HLS-файл часто нельзя корректно продолжить после достигнутого
  // конца. Пока загрузка активна, открываем ту же серию как сетевой поток:
  // плеер буферизует её независимо, а очередь продолжает сохранять файл.
  if (canStreamOnline) {
    const streamParams = {
      title: payload?.title || path.basename(filePath || 'episode.mp4'),
      releaseId: String(payload.releaseId),
      sourceId: String(payload.sourceId),
      ep: String(payload.episodePosition),
      sourceName: payload?.sourceName || '',
      dubberId: payload?.dubberId != null ? String(payload.dubberId) : '',
    };
    if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
      state.playerWindowRef.webContents.send('player:changeContent', { ...streamParams, local: true });
      state.playerWindowRef.focus();
    } else if (player.createPlayerWindow) {
      player.createPlayerWindow(streamParams);
    }
    return { ok: true, streaming: true };
  }

  if (!filePath || !fs.existsSync(filePath)) return { ok: false, error: 'file-missing' };
  const st = fs.statSync(filePath);
  const allowPartial = payload?.allowPartial === true;
  if (st.size < downloadQueue.MIN_PLAYABLE_BYTES && !allowPartial) {
    return { ok: false, error: 'file-too-small' };
  }
  const params = {
    localFile: filePath,
    title: payload?.title || path.basename(filePath),
    releaseId: payload?.releaseId != null ? String(payload.releaseId) : '',
    sourceId: payload?.sourceId != null ? String(payload.sourceId) : '',
    ep: payload?.episodePosition != null ? String(payload.episodePosition) : '1',
    sourceName: payload?.sourceName || '',
    dubberId: payload?.dubberId != null ? String(payload.dubberId) : '',
  };
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
    state.playerWindowRef.webContents.send('player:changeContent', { ...params, local: true });
    state.playerWindowRef.focus();
  } else if (player.createPlayerWindow) {
    player.createPlayerWindow(params);
  }
  return { ok: true };
});

function sanitizeDownloadName(name) {
  return String(name || 'episode')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 160) || 'episode';
}

function uniqueDownloadPath(dir, fileName) {
  const parsed = path.parse(sanitizeDownloadName(fileName));
  const ext = parsed.ext || '.mp4';
  const base = parsed.name || 'episode';
  let candidate = path.join(dir, `${base}${ext}`);
  let idx = 2;
  while (fs.existsSync(candidate)) {
    candidate = path.join(dir, `${base} (${idx})${ext}`);
    idx++;
  }
  return candidate;
}

ipcMain.handle('episode-download:download', async (_, payload) => {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length === 0) return { ok: false, cancelled: false, downloaded: 0, error: 'empty' };

  const result = await dialog.showOpenDialog(state.mainWindow ?? undefined, {
    title: 'Выберите папку для сохранения серий',
    defaultPath: app.getPath('downloads'),
    properties: ['openDirectory', 'createDirectory'],
  });
  if (result.canceled || !result.filePaths?.[0]) {
    return { ok: false, cancelled: true, downloaded: 0 };
  }

  const targetDir = result.filePaths[0];
  let downloaded = 0;
  let firstDownloadedPath = '';
  const errors = [];

  for (const item of items) {
    const url = typeof item?.url === 'string' ? item.url : '';
    if (!/^https?:\/\//i.test(url)) {
      errors.push({ filename: item?.filename, error: 'invalid-url' });
      continue;
    }

    const filePath = uniqueDownloadPath(targetDir, item?.filename || path.basename(url.split('?')[0]) || 'episode.mp4');
    const dlHeaders = item?.headers && typeof item.headers === 'object' ? item.headers : {};
    try {
      if (/\.m3u8(\?|$)/i.test(url)) {
        await downloadHlsToFile(url, filePath, dlHeaders);
      } else {
        await sessionFetchStreamToFile(url, filePath, dlHeaders);
      }
      if (!firstDownloadedPath) firstDownloadedPath = filePath;
      downloaded++;
    } catch (err) {
      errors.push({
        filename: path.basename(filePath),
        error: formatDownloadError(err, { url, filename: path.basename(filePath) }),
      });
      try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
    }
  }

  if (downloaded > 0) {
    try { shell.showItemInFolder(firstDownloadedPath); } catch (_) {}
  }

  return {
    ok: downloaded > 0 && errors.length === 0,
    cancelled: false,
    downloaded,
    errors,
  };
});


  media.getDownloadDirectory = getDownloadDirectory;
  media.setDownloadDirectory = setDownloadDirectory;
}

module.exports = { register, media };
