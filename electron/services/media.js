'use strict';

const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
const { session, net, dialog, shell, app, ipcMain } = require('electron');
const { BROWSER_UA } = require('../cdn-proxy');
const { ANIXART_UA } = require('../lib/constants');
const { getDirectVideoLink, isHtmlPlayerPage } = require('../lib/direct-video-link');
const config = require('../lib/config-store');
const state = require('../lib/app-state');
const { formatDownloadError, extractRawMessage } = require('../lib/download-errors');
const downloadQueue = require('../lib/download-queue');
const { nodeFetchBuffer } = downloadQueue;
const { saveFolderMeta, getFolderMeta, parseEpisodeFromFilename } = require('../lib/download-meta');
const { writeSkipSidecar, readSkipSidecar, normalizeSkipMarks } = require('../lib/skip-marks');
const { migrateLibraryLayout } = require('../lib/library-migrate');
const { fastDownloadHls } = require('../lib/fast-hls-download');
const ffmpegInstall = require('../lib/ffmpeg-install');

const DOWNLOAD_VIDEO_EXT = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v']);
const MIN_DOWNLOAD_VIDEO_BYTES = 256 * 1024;
const ffmpegCacheRef = { value: undefined, source: undefined };

const media = {
  getDownloadDirectory: null,
  setDownloadDirectory: null,
};

function register(deps) {
  const { appendLog, getAnixart } = deps;

async function refreshDownloadUrl(job) {
  const releaseId = Number(job?.releaseId);
  const sourceId = Number(job?.sourceId);
  const epPos = Number(job?.episodePosition);
  const dubberId = Number(job?.dubberId);
  if (!Number.isFinite(releaseId) || !Number.isFinite(sourceId) || !Number.isFinite(epPos)) {
    return null;
  }
  if (typeof getAnixart !== 'function') return null;
  let client;
  try {
    client = getAnixart();
  } catch {
    return null;
  }
  if (!client?.endpoints?.release?.getEpisode) return null;

  const resolveFromSource = async (srcId) => {
    const data = await client.endpoints.release.getEpisode(releaseId, srcId, epPos);
    const embed = data?.episode?.url;
    if (!embed || typeof embed !== 'string') return null;
    const embedUrl = embed.startsWith('http') ? embed : `https:${embed}`;

    const direct = await getDirectVideoLink(embedUrl);
    let url = direct?.directUrl || '';
    if (!url) return null;
    url = String(url)
      .replace(/:hls:manifest\.m3u8$/, '')
      .replace(/:hls:hls\.m3u8$/, '');
    if (!/^https?:\/\//i.test(url)) url = `https:${url}`;
    if (isHtmlPlayerPage(url)) return null;

    const headers = downloadHeadersForUrl(url, direct.downloadHeaders || {});
    const skip = normalizeSkipMarks(direct?.skip);
    if (skip && job?.filePath) writeSkipSidecar(job.filePath, skip);
    return { url, headers, skip, sourceId: srcId };
  };

  try {
    const primary = await resolveFromSource(sourceId);
    if (primary) return primary;
  } catch { /* try siblings */ }

  // Удалённый релиз AniLibria (iframe 404) → Kodik / другой плеер той же озвучки
  if (!Number.isFinite(dubberId) || !client.endpoints.release.getDubberSources) return null;
  try {
    const srcRes = await client.endpoints.release.getDubberSources(releaseId, dubberId);
    const sources = Array.isArray(srcRes?.sources) ? [...srcRes.sources] : [];
    sources.sort((a, b) => {
      const rank = (n) => {
        const name = String(n || '');
        if (/не\s*работает/i.test(name)) return 100;
        if (/kodik/i.test(name)) return 0;
        if (/sibnet/i.test(name)) return 2;
        if (/libria|анилиб/i.test(name)) return 5;
        return 3;
      };
      return rank(a?.name) - rank(b?.name);
    });
    for (const src of sources) {
      const sid = Number(src?.id);
      if (!Number.isFinite(sid) || sid === sourceId) continue;
      if (/не\s*работает/i.test(String(src?.name || ''))) continue;
      if (/libria|анилиб/i.test(String(src?.name || ''))) continue;
      try {
        const alt = await resolveFromSource(sid);
        if (alt) {
          job.sourceId = sid;
          if (src?.name) job.sourceName = String(src.name);
          return alt;
        }
      } catch { /* next */ }
    }
  } catch { /* ignore */ }
  return null;
}

function downloadHeadersForUrl(url, extra = {}) {
  const headers = extra && typeof extra === 'object' ? { ...extra } : {};
  let host = '';
  try { host = new URL(url).host; } catch { /* ignore */ }
  if (!headers.Referer) {
    if (/sibnet/i.test(host)) headers.Referer = 'https://video.sibnet.ru/';
    else if (/kodik|solodcdn|kodik-storage|zerocdn|animedia/i.test(host)) headers.Referer = 'https://kodikplayer.com/';
    else if (/libria|anilib/i.test(host)) headers.Referer = 'https://anilibria.top/';
    else if (/^vkvd/i.test(host) || /vkuservideo|userapi/i.test(host)) headers.Referer = 'https://vk.com/';
    else if (/okcdn|mycdn/i.test(host)) headers.Referer = 'https://ok.ru/';
    else if (/rutube/i.test(host)) headers.Referer = 'https://rutube.ru/';
    else if (/mail\.ru|imgsmail/i.test(host)) headers.Referer = 'https://my.mail.ru/';
    else if (/myvi/i.test(host)) headers.Referer = 'https://www.myvi.top/';
    else if (/secvideo1|csst\.online|sstrge/i.test(host)) headers.Referer = 'https://secvideo1.online/';
    else if (/sovetromantica/i.test(host)) headers.Referer = 'https://sovetromantica.com/';
  }
  if (!headers['User-Agent']) headers['User-Agent'] = BROWSER_UA;
  return headers;
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
      if (/BLOCKED_BY_CLIENT|ERR_FAILED|ERR_CERT|CERT_|certificate|SSL|TLS/i.test(base)) {
        try {
          const insecure = /ERR_CERT|CERT_|certificate|SSL|TLS/i.test(base);
          resolve(await nodeFetchBuffer(url, merged, null, insecure ? { insecureTls: true } : {}));
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

async function resolveFfmpegPath() {
  const status = await ffmpegInstall.getFfmpegStatus(ffmpegCacheRef);
  state.ffmpegPathCache = status.path;
  return status.path;
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
    if (!bestUrl) throw new Error('В master-плейлисте нет потока — попробуйте другое качество');
    return resolveHlsSegments(bestUrl, headers);
  }

  const encrypted = /#EXT-X-KEY:/i.test(text);
  const baseUrl = m3u8Url.substring(0, m3u8Url.lastIndexOf('/') + 1);
  const segments = text.split('\n')
    .map(l => l.trim())
    .filter(l => l && !l.startsWith('#'))
    .map(s => (s.startsWith('http') ? s : baseUrl + s));

  if (segments.length === 0) {
    throw new Error('В плейлисте нет сегментов — ссылка могла устареть или качество недоступно (HTTP 404 на сегментах)');
  }
  return { segments, encrypted };
}

async function sessionFetchBufferForHls(url, headers = {}, signal = null, opts = {}) {
  if (signal?.aborted) throw new Error('cancelled');
  // Прямой Node HTTP быстрее при десятках параллельных сегментов,
  // чем Electron session.fetch (ограниченный пул соединений).
  try {
    return await nodeFetchBuffer(url, headers, signal, opts);
  } catch (err) {
    const raw = extractRawMessage(err);
    if (raw === 'cancelled' || signal?.aborted) throw new Error('cancelled');
    if (opts.insecureTls) throw err;
    // SSL CDN: повтор без проверки сертификата (как retry у Kodik на SSLError)
    if (/CERT_|UNABLE_TO_VERIFY|certificate|SSL|TLS|ERR_CERT/i.test(raw)) {
      try {
        return await nodeFetchBuffer(url, headers, signal, { insecureTls: true });
      } catch (_) { /* fall through */ }
    }
    if (typeof session?.defaultSession?.fetch === 'function') {
      const res = await session.defaultSession.fetch(url, { headers, redirect: 'follow', signal });
      if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
      return Buffer.from(await res.arrayBuffer());
    }
    throw err;
  }
}

/** HLS → MP4: быстрая параллельная загрузка сегментов (как Kodik-Download-Watch) */
async function downloadHlsToFile(m3u8Url, outputPath, headers = {}, onProgress = null, signal = null, opts = {}) {
  const insecureTls = !!opts.insecureTls;
  const { globalSegmentBudget, resolveBudgetLimit } = require('../lib/connection-budget');
  const rawConcurrency = config.resolveDownloadHlsConcurrency();
  const budgetLimit = resolveBudgetLimit(rawConcurrency);
  globalSegmentBudget.setLimit(budgetLimit);

  const baseFetch = (url, hdrs, sig) => sessionFetchBufferForHls(url, hdrs, sig, { insecureTls });
  const fetchBuffer = async (url, hdrs, sig) => {
    const release = await globalSegmentBudget.acquire();
    try {
      return await baseFetch(url, hdrs, sig);
    } finally {
      release();
    }
  };

  const { segments, encrypted } = await resolveHlsSegments(m3u8Url, headers);
  if (encrypted) {
    await downloadWithFfmpeg(m3u8Url, outputPath, headers, onProgress, signal);
    return;
  }

  const ffmpeg = await resolveFfmpegPath();
  // Всегда max: все сегменты текущего файла (как Kodik-Download-Watch).
  await fastDownloadHls({
    segments,
    outputPath,
    headers,
    fetchBuffer,
    ffmpegPath: ffmpeg,
    onProgress,
    signal,
    hlsMode: 'max',
    hlsConcurrency: segments.length,
  });
}

/** HLS → MP4 через ffmpeg (fallback для зашифрованных потоков) */
async function downloadWithFfmpeg(inputUrl, outputPath, headers = {}, onProgress = null, signal = null) {
  const ffmpeg = await resolveFfmpegPath();
  if (!ffmpeg) {
    throw new Error('Для этого источника нужен FFmpeg (зашифрованный HLS). Установите FFmpeg во вкладке «Загрузки».');
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
    let settled = false;

    const onAbort = () => {
      try { proc.kill('SIGTERM'); } catch (_) {}
      if (!settled) {
        settled = true;
        reject(new Error('cancelled'));
      }
    };
    if (signal) {
      if (signal.aborted) { onAbort(); return; }
      signal.addEventListener('abort', onAbort, { once: true });
    }

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
    proc.on('error', (err) => {
      if (settled) return;
      settled = true;
      reject(err);
    });
    proc.on('close', (code) => {
      if (settled) return;
      settled = true;
      if (signal?.aborted) {
        reject(new Error('cancelled'));
        return;
      }
      if (code === 0) {
        if (onProgress) onProgress(1, 1);
        resolve();
      } else {
        reject(new Error(stderr.trim() || `Сборка через FFmpeg не удалась (код ${code})`));
      }
    });
  });
}

ipcMain.handle('anix:getDirectVideoLink', async (_, embedUrl) => {
  return getDirectVideoLink(embedUrl);
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

/** `Title/Dub/Source` → joined absolute dir under baseDir */
function resolveDownloadSubDir(baseDir, folder) {
  if (!folder) return baseDir;
  const parts = String(folder)
    .split(/[/\\]+/)
    .map((p) => sanitizeDownloadDirName(p))
    .filter(Boolean);
  return parts.length ? path.join(baseDir, ...parts) : baseDir;
}

function titleKeyFromFolder(folder) {
  const parts = String(folder || '')
    .split(/[/\\]+/)
    .map((p) => sanitizeDownloadDirName(p))
    .filter(Boolean);
  return parts[0] || '';
}

function guessTitleFromFilename(name) {
  const m = name.match(/^(.+?) [^ ]+ \d{2}\.\w+$/i);
  if (m) return m[1].trim();
  return name.replace(/\.[^.]+$/, '');
}

function isTempOrIncompleteName(name) {
  const n = String(name || '');
  if (/\.(part|tmp|temp|download)$/i.test(n)) return true;
  if (/\.ts\.part$/i.test(n)) return true;
  if (/\.hls-parts$/i.test(n)) return true;
  if (/\.range-parts$/i.test(n)) return true;
  if (n.endsWith('.hls-parts') || n.endsWith('.range-parts')) return true;
  return false;
}

function flatFilenameFromItem(item) {
  const epNum = String(Math.max(0, Number(item?.episodePosition) || 0)).padStart(2, '0');
  const title = sanitizeDownloadDirName(item?.releaseTitle || 'episode');
  return `${title} ${epNum}.mp4`;
}

function scanDownloadLibrary(rootDir) {
  const groups = new Map();
  const activePaths = downloadQueue.getActiveDownloadPaths?.() || new Set();

  const ensureGroup = (groupName) => {
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
    return groups.get(key);
  };

  const addFile = (filePath, stat, relParts) => {
    const resolved = path.resolve(filePath);
    if (activePaths.has(resolved)) return;
    if (isTempOrIncompleteName(path.basename(filePath))) return;
    if (
      fs.existsSync(`${filePath}.ts.part`)
      || fs.existsSync(`${filePath}.part`)
      || fs.existsSync(`${filePath}.hls-parts`)
      || fs.existsSync(`${filePath}.range-parts`)
    ) {
      return;
    }
    if (stat.size < MIN_DOWNLOAD_VIDEO_BYTES) return;

    const basename = path.basename(filePath);
    const parts = Array.isArray(relParts) ? relParts.filter(Boolean) : [];
    let title = parts[0] || guessTitleFromFilename(basename);
    let dubberName = parts[1] || '';
    let sourceName = parts[2] || '';

    const nestedKey = parts.length >= 3
      ? parts.slice(0, 3).join('/')
      : parts.length >= 2
        ? parts.slice(0, 2).join('/')
        : title;
    const nestedMeta = getFolderMeta(rootDir, nestedKey);
    const titleMeta = getFolderMeta(rootDir, title);

    if (!dubberName && nestedMeta?.dubberName) dubberName = nestedMeta.dubberName;
    if (!sourceName && nestedMeta?.sourceName) sourceName = nestedMeta.sourceName;

    const group = ensureGroup(title);
    if (titleMeta?.releaseId && !group.releaseId) {
      group.releaseId = titleMeta.releaseId;
      group.releaseTitle = titleMeta.releaseTitle || title;
    }
    if (nestedMeta?.releaseId) {
      group.releaseId = group.releaseId ?? nestedMeta.releaseId;
      group.dubberId = nestedMeta.dubberId ?? group.dubberId;
      group.sourceId = nestedMeta.sourceId ?? group.sourceId;
      group.dubberName = group.dubberName || nestedMeta.dubberName || dubberName;
      group.sourceName = group.sourceName || nestedMeta.sourceName || sourceName;
    }

    const ep = parseEpisodeFromFilename(basename);
    const epLabel = ep != null ? `Серия ${String(ep).padStart(2, '0')}` : basename;
    const labelParts = [dubberName, sourceName, epLabel].filter(Boolean);
    const displayName = labelParts.length > 0 ? labelParts.join(' · ') : basename;

    group.files.push({
      name: displayName,
      path: filePath,
      size: stat.size,
      modifiedAt: stat.mtimeMs,
      episodePosition: ep,
      dubberName,
      sourceName,
      dubberId: nestedMeta?.dubberId ?? null,
      sourceId: nestedMeta?.sourceId ?? null,
    });
  };

  const walk = (dir, relParts) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (ent.name.startsWith('.') && ent.name !== '.') continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (isTempOrIncompleteName(ent.name)) continue;
        // Limit depth: Title / Dub / Source / (optional extra)
        if (relParts.length >= 6) continue;
        walk(full, [...relParts, ent.name]);
        continue;
      }
      if (isTempOrIncompleteName(ent.name)) continue;
      const ext = path.extname(ent.name).toLowerCase();
      if (!DOWNLOAD_VIDEO_EXT.has(ext)) continue;
      try {
        addFile(full, fs.statSync(full), relParts);
      } catch {}
    }
  };

  if (!rootDir || !fs.existsSync(rootDir)) return [];
  walk(rootDir, []);

  const list = [...groups.values()].filter((g) => g.files.length > 0);
  for (const g of list) {
    g.files.sort((a, b) => {
      const ap = a.episodePosition ?? 9999;
      const bp = b.episodePosition ?? 9999;
      if (ap !== bp) return ap - bp;
      return a.name.localeCompare(b.name, 'ru');
    });
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
        dubberName: f.dubberName || g.dubberName || '',
        sourceName: f.sourceName || g.sourceName || '',
        dubberId: f.dubberId ?? g.dubberId ?? null,
        sourceId: f.sourceId ?? g.sourceId ?? null,
        folder: g.name,
      });
    }
  }
  files.sort((a, b) => {
    const ap = a.episodePosition ?? 9999;
    const bp = b.episodePosition ?? 9999;
    if (ap !== bp) return ap - bp;
    const dn = (a.dubberName || '').localeCompare(b.dubberName || '', 'ru');
    if (dn !== 0) return dn;
    const sn = (a.sourceName || '').localeCompare(b.sourceName || '', 'ru');
    if (sn !== 0) return sn;
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
  const targetDir = folder ? resolveDownloadSubDir(baseDir, folder) : baseDir;
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
  ...config.buildDownloadSettingsPayload(),
}));

ipcMain.handle('downloads:saveSettings', (_, payload) => {
  if (!payload || typeof payload !== 'object') return { ok: false };
  const updates = {};
  if (typeof payload.organizeByTitle === 'boolean') {
    updates.downloadOrganizeByTitle = payload.organizeByTitle;
  }
  if (typeof payload.autoClearFinished === 'boolean') {
    updates.downloadAutoClearFinished = payload.autoClearFinished;
  }
  if (typeof payload.allAtOnce === 'boolean') {
    updates.downloadAllAtOnce = payload.allAtOnce;
    // Сегменты всегда max; параллельность файлов — только тогл.
    updates.downloadHlsMode = 'max';
  }
  if (Object.keys(updates).length === 0) return { ok: false };
  config.saveConfig(updates);
  if (typeof payload.allAtOnce === 'boolean') {
    try {
      downloadQueue.syncParallelPolicy(getDownloadQueueDeps());
    } catch (_) { /* ignore */ }
  }
  return {
    ok: true,
    directory: getDownloadDirectory(),
    defaultDirectory: getDefaultDownloadDirectory(),
    ...config.buildDownloadSettingsPayload(),
  };
});

ipcMain.handle('downloads:resetDirectory', () => {
  config.saveConfig({ downloadDirectory: '' });
  return {
    ok: true,
    directory: getDownloadDirectory(),
    defaultDirectory: getDefaultDownloadDirectory(),
    ...config.buildDownloadSettingsPayload(),
  };
});

ipcMain.handle('downloads:getFfmpegStatus', async () => {
  ffmpegCacheRef.value = undefined;
  return ffmpegInstall.getFfmpegStatus(ffmpegCacheRef);
});

ipcMain.handle('downloads:installFfmpeg', async (event) => {
  const sendProgress = (received, total) => {
    try {
      event.sender.send('downloads:ffmpeg-install-progress', { received, total });
    } catch (_) {}
  };
  ffmpegCacheRef.value = undefined;
  const result = await ffmpegInstall.installFfmpeg(ffmpegCacheRef, sendProgress);
  state.ffmpegPathCache = result.path ?? null;
  return result;
});

ipcMain.handle('downloads:openFfmpegPage', async () => {
  await ffmpegInstall.openFfmpegDownloadPage();
  return { ok: true };
});

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

ipcMain.handle('downloads:listLibrary', () => {
  const root = getDownloadDirectory();
  try {
    migrateLibraryLayout(root, downloadQueue.getActiveDownloadPaths?.() || new Set());
  } catch (e) {
    console.warn('migrateLibraryLayout:', e?.message || e);
  }
  return scanDownloadLibrary(root);
});

ipcMain.handle('downloads:deleteFile', (_, filePath) => {
  if (typeof filePath !== 'string' || !filePath) return { ok: false, error: 'bad-path' };
  const root = path.resolve(getDownloadDirectory());
  const resolved = path.resolve(filePath);
  if (!resolved.startsWith(root + path.sep) && resolved !== root) {
    return { ok: false, error: 'outside-root' };
  }
  try {
    if (fs.existsSync(resolved)) fs.unlinkSync(resolved);
    for (const suf of ['.anixskip', '.anixdl']) {
      const side = resolved + suf;
      if (fs.existsSync(side)) try { fs.unlinkSync(side); } catch {}
    }
    // убрать пустые родительские папки до корня
    let cur = path.dirname(resolved);
    while (cur && cur.startsWith(root) && cur !== root) {
      let entries = [];
      try { entries = fs.readdirSync(cur); } catch { break; }
      if (entries.length > 0) break;
      try { fs.rmdirSync(cur); } catch { break; }
      cur = path.dirname(cur);
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || 'delete-failed' };
  }
});

ipcMain.handle('downloads:deleteGroup', (_, groupName) => {
  if (typeof groupName !== 'string' || !groupName) return { ok: false, error: 'bad-name' };
  const root = getDownloadDirectory();
  const target = path.join(root, sanitizeDownloadDirName(groupName));
  const resolved = path.resolve(target);
  const rootRes = path.resolve(root);
  if (!resolved.startsWith(rootRes + path.sep)) return { ok: false, error: 'outside-root' };
  try {
    if (fs.existsSync(resolved)) {
      fs.rmSync(resolved, { recursive: true, force: true });
    }
    // meta key
    try {
      const metaPath = path.join(root, '.anixapp-library.json');
      if (fs.existsSync(metaPath)) {
        const raw = JSON.parse(fs.readFileSync(metaPath, 'utf8'));
        if (raw?.folders) {
          for (const k of Object.keys(raw.folders)) {
            if (k === groupName || k.startsWith(`${groupName}/`)) delete raw.folders[k];
          }
          fs.writeFileSync(metaPath, JSON.stringify(raw, null, 2), 'utf8');
        }
      }
    } catch { /* ignore */ }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e?.message || 'delete-failed' };
  }
});

ipcMain.handle('downloads:listByRelease', (_, releaseId) => listDownloadsForRelease(releaseId));

ipcMain.handle('downloads:readSkipMarks', (_, filePath) => {
  if (typeof filePath !== 'string' || !filePath) return null;
  return readSkipSidecar(filePath);
});

ipcMain.handle('downloads:saveSkipMarks', (_, payload) => {
  const filePath = typeof payload?.filePath === 'string' ? payload.filePath : '';
  if (!filePath) return { ok: false };
  return { ok: writeSkipSidecar(filePath, payload?.skip) };
});

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

/** Background downloads — all jobs run in parallel */
function isEmbedDownloadUrl(url) {
  return isHtmlPlayerPage(url);
}

function getDownloadQueueDeps() {
  return {
    downloadHlsToFile,
    formatDownloadError,
    isEmbedPageUrl: isEmbedDownloadUrl,
    resolveHlsConcurrency: () => config.resolveDownloadHlsConcurrency(),
    resolveParallelFiles: () => config.getDownloadParallelFiles(),
    refreshDownloadUrl,
  };
}

downloadQueue.setProgressSink((data) => {
  try { state.mainWindow?.webContents?.send('episode-download:progress', data); } catch (_) {}
});

downloadQueue.setStreamingHoldSink((blocked) => {
  try {
    state.mainWindow?.webContents?.send('downloads:streaming-hold', { blocked: !!blocked });
  } catch (_) {}
});

ipcMain.handle('downloads:isResumeBlocked', () => ({
  blocked: downloadQueue.isStreamingHold(),
}));

ipcMain.handle('downloads:setStreamingHold', (_, blocked) => {
  const next = downloadQueue.setStreamingHold(!!blocked);
  return { ok: true, blocked: next };
});

ipcMain.handle('episode-download:queue', async (_, payload) => {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  if (items.length === 0) return { ok: false, error: 'empty', items: [] };

  const baseDir = getDownloadDirectory();
  const queued = [];
  const deps = getDownloadQueueDeps();

  for (const item of items) {
    const url = typeof item?.url === 'string' ? item.url : '';
    const organize = config.getDownloadOrganizeByTitle();
    const rawFolder = typeof item?.folder === 'string' ? item.folder : '';
    const subFolder = organize && rawFolder ? rawFolder : '';
    const targetDir = subFolder ? resolveDownloadSubDir(baseDir, subFolder) : baseDir;
    try { fs.mkdirSync(targetDir, { recursive: true }); } catch {}
    const requestedName = organize
      ? (item?.filename || path.basename(url.split('?')[0]) || 'episode.mp4')
      : (flatFilenameFromItem(item) || item?.filename || 'episode.mp4');
    const filePath = uniqueDownloadPath(targetDir, requestedName);
    const filename = path.basename(filePath);
    const titleKey = titleKeyFromFolder(subFolder) || sanitizeDownloadDirName(item?.releaseTitle || '');

    if (item?.releaseId) {
      if (titleKey) {
        saveFolderMeta(baseDir, titleKey, {
          releaseId: item.releaseId,
          releaseTitle: item.releaseTitle || titleKey,
          dubberId: item.dubberId,
          sourceId: item.sourceId,
          dubberName: item.dubberName,
          sourceName: item.sourceName,
        });
      }
      if (subFolder) {
        saveFolderMeta(baseDir, subFolder.replace(/\\/g, '/'), {
          releaseId: item.releaseId,
          releaseTitle: item.releaseTitle || titleKey,
          dubberId: item.dubberId,
          sourceId: item.sourceId,
          dubberName: item.dubberName,
          sourceName: item.sourceName,
        });
      }
    }

    if (item?.skip) writeSkipSidecar(filePath, item.skip);

    const job = downloadQueue.enqueue({
      url,
      filePath,
      filename,
      headers: downloadHeadersForUrl(url, item?.headers),
      folder: subFolder.replace(/\\/g, '/') || '',
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

ipcMain.handle('downloads:pause', (_, id) => {
  if (typeof id !== 'string' || !id) return { ok: false };
  return { ok: downloadQueue.pauseJob(id) };
});

ipcMain.handle('downloads:pauseAll', () => ({
  ok: true,
  paused: downloadQueue.pauseAll(),
}));

ipcMain.handle('downloads:resume', (_, id) => {
  if (typeof id !== 'string' || !id) return { ok: false };
  if (downloadQueue.isStreamingHold()) return { ok: false, error: 'streaming' };
  return { ok: downloadQueue.resumeJob(id, getDownloadQueueDeps()) };
});

ipcMain.handle('downloads:resumeAll', () => {
  if (downloadQueue.isStreamingHold()) return { ok: false, error: 'streaming', resumed: 0 };
  return {
    ok: true,
    resumed: downloadQueue.resumeAll(getDownloadQueueDeps()),
  };
});

ipcMain.handle('downloads:reorder', (_, payload) => {
  const orderedIds = Array.isArray(payload?.orderedIds) ? payload.orderedIds : [];
  return { ok: downloadQueue.reorderQueue(orderedIds, getDownloadQueueDeps()) };
});

ipcMain.handle('downloads:cancelAll', () => ({ ok: true, cancelled: downloadQueue.cancelAll() }));

ipcMain.handle('downloads:getActiveQueue', () => {
  try {
    downloadQueue.restorePersistedJobs(getDownloadQueueDeps(), getDownloadDirectory());
  } catch (_) { /* ignore */ }
  return downloadQueue.getQueueSnapshot()
    .filter((j) =>
      j.status === 'queued'
      || j.status === 'starting'
      || j.status === 'downloading'
      || j.status === 'paused'
      || j.status === 'error',
    )
    .map((j) => ({
      id: j.id,
      filename: j.filename,
      received: j.received ?? 0,
      total: j.total ?? 0,
      status: j.status,
      error: j.error,
      filePath: j.filePath,
      releaseId: j.releaseId,
      sourceId: j.sourceId,
      dubberId: j.dubberId,
      episodePosition: j.episodePosition,
      releaseTitle: j.releaseTitle,
      folder: j.folder,
      dubberName: j.dubberName,
      sourceName: j.sourceName,
    }));
});

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
      dubberName: payload?.dubberName || '',
      dubberId: payload?.dubberId != null ? String(payload.dubberId) : '',
    };
    if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
      state.playerWindowRef.webContents.send('player:changeContent', { ...streamParams, local: true });
      state.playerWindowRef.focus();
    } else if (player.createPlayerWindow) {
      player.createPlayerWindow(streamParams);
    }
    try { downloadQueue.setStreamingHold(true); } catch (_) {}
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
    dubberName: payload?.dubberName || '',
    dubberId: payload?.dubberId != null ? String(payload.dubberId) : '',
  };
  if (state.playerWindowRef && !state.playerWindowRef.isDestroyed()) {
    state.playerWindowRef.webContents.send('player:changeContent', { ...params, local: true });
    state.playerWindowRef.focus();
  } else if (player.createPlayerWindow) {
    player.createPlayerWindow(params);
  }
  try { downloadQueue.setStreamingHold(false); } catch (_) {}
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
    const dlHeaders = downloadHeadersForUrl(url, item?.headers && typeof item.headers === 'object' ? item.headers : {});
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
  media.restoreDownloads = () => {
    try {
      return downloadQueue.restorePersistedJobs(getDownloadQueueDeps(), getDownloadDirectory());
    } catch (e) {
      console.warn('restoreDownloads:', e?.message || e);
      return 0;
    }
  };
  media.persistDownloads = () => {
    try { downloadQueue.persistQueueNow(); } catch (_) {}
  };
}

module.exports = { register, media };
