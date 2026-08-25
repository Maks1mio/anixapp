'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { session } = require('electron');
const { formatDownloadError, extractRawMessage } = require('./download-errors');
const { parallelRangeDownload } = require('./parallel-range-download');
const persist = require('./download-queue-persist');

const MIN_PLAYABLE_BYTES = 512 * 1024;

// Большой пул: пользователь может выставить до 512 параллельных сегментов.
const httpAgent = new http.Agent({
  keepAlive: true,
  maxSockets: 2048,
  maxFreeSockets: 512,
  scheduling: 'lifo',
});
const httpsAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 2048,
  maxFreeSockets: 512,
  scheduling: 'lifo',
});
/** Fallback для CDN с битым/просроченным сертификатом (solodcdn и т.п.). */
const httpsInsecureAgent = new https.Agent({
  keepAlive: true,
  maxSockets: 2048,
  maxFreeSockets: 512,
  scheduling: 'lifo',
  rejectUnauthorized: false,
});

/**
 * @typedef {object} DownloadJob
 * @property {string} id
 * @property {string} url
 * @property {string} filePath
 * @property {string} filename
 * @property {Record<string, string>} headers
 * @property {string} [folder]
 * @property {number} [releaseId]
 * @property {number} [sourceId]
 * @property {number} [dubberId]
 * @property {number} [episodePosition]
 * @property {string} [releaseTitle]
 * @property {string} [dubberName]
 * @property {string} [sourceName]
 * @property {'queued'|'starting'|'downloading'|'done'|'error'|'cancelled'} status
 * @property {number} received
 * @property {number} total
 * @property {string} [error]
 * @property {AbortController} [abort]
 * @property {number} [sslRetries]
 */

/** @type {DownloadJob[]} */
const queue = [];
/** Сколько файлов качается одновременно. */
let activeCount = 0;
/** @type {(data: object) => void} */
let progressSink = () => {};
/** @type {(blocked: boolean) => void} */
let streamingHoldSink = () => {};
let persistTimer = null;
/** @type {object|null} */
let lastPumpDeps = null;
/** Пока смотрят онлайн-стрим — загрузки на паузе и resume запрещён. */
let streamingHold = false;
/** id задач, поставленных на паузу из‑за стрима (вернуть после закрытия плеера). */
const streamingPausedIds = new Set();

function setProgressSink(fn) {
  progressSink = typeof fn === 'function' ? fn : () => {};
}

function setStreamingHoldSink(fn) {
  streamingHoldSink = typeof fn === 'function' ? fn : () => {};
}

function isStreamingHold() {
  return streamingHold;
}

function emitStreamingHold() {
  try { streamingHoldSink(streamingHold); } catch (_) {}
}

/**
 * @param {boolean} active
 * @returns {boolean}
 */
function setStreamingHold(active) {
  const next = !!active;
  if (next === streamingHold) return streamingHold;

  if (next) {
    streamingHold = true;
    const ids = queue
      .filter((j) => j.status === 'queued' || j.status === 'starting' || j.status === 'downloading')
      .map((j) => j.id);
    for (const id of ids) {
      if (!pauseJob(id)) continue;
      const job = queue.find((j) => j.id === id);
      if (job && job.status === 'paused') {
        job.pausedByStreaming = true;
        streamingPausedIds.add(id);
        emit(job);
      }
    }
    persistQueueNow();
  } else {
    streamingHold = false;
    const ids = [...streamingPausedIds];
    streamingPausedIds.clear();
    for (const id of ids) {
      const job = queue.find((j) => j.id === id);
      if (!job || job.status !== 'paused' || !job.pausedByStreaming) continue;
      job.pausedByStreaming = false;
      job.status = 'queued';
      job.resumed = true;
      job.pauseRequested = false;
      job.error = undefined;
      emit(job);
    }
    persistQueueNow();
    pump(lastPumpDeps);
  }

  emitStreamingHold();
  return streamingHold;
}

function persistQueueNow() {
  const active = queue.filter((j) =>
    j.status === 'queued'
    || j.status === 'starting'
    || j.status === 'downloading'
    || j.status === 'paused',
  );
  persist.saveQueueState(active);
  for (const j of active) persist.writeSidecar(j);
}

function schedulePersist() {
  if (persistTimer) return;
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistQueueNow();
  }, 400);
}

function cleanupJobFiles(filePath, { keepParts = false, removeOutput = true } = {}) {
  if (!filePath) return;
  if (removeOutput) {
    try { if (fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (_) {}
  }
  try {
    const part = `${filePath}.ts.part`;
    if (fs.existsSync(part)) fs.unlinkSync(part);
  } catch (_) {}
  try {
    const part = `${filePath}.part`;
    if (fs.existsSync(part)) fs.unlinkSync(part);
  } catch (_) {}
  if (!keepParts) {
    try { fs.rmSync(`${filePath}.hls-parts`, { recursive: true, force: true }); } catch (_) {}
    try { fs.rmSync(`${filePath}.range-parts`, { recursive: true, force: true }); } catch (_) {}
    persist.removeSidecar(filePath);
  }
}

function emit(job, extra = {}) {
  progressSink({
    id: job.id,
    filename: job.filename,
    status: job.status,
    received: job.received ?? 0,
    total: job.total ?? 0,
    error: job.error,
    filePath: job.filePath,
    fileSize: job.status === 'done' ? job.received : undefined,
    releaseId: job.releaseId,
    sourceId: job.sourceId,
    dubberId: job.dubberId,
    episodePosition: job.episodePosition,
    releaseTitle: job.releaseTitle,
    folder: job.folder,
    dubberName: job.dubberName,
    sourceName: job.sourceName,
    playable: job.received >= MIN_PLAYABLE_BYTES && fs.existsSync(job.filePath),
    ...extra,
  });
  if (
    job.status === 'queued'
    || job.status === 'starting'
    || job.status === 'downloading'
  ) {
    schedulePersist();
  } else if (job.status === 'done' || job.status === 'cancelled') {
    persist.removeSidecar(job.filePath);
    schedulePersist();
  } else if (job.status === 'error') {
    persist.writeSidecar(job);
    schedulePersist();
  }
}

function isHlsUrl(url) {
  return /\.m3u8(\?|$)/i.test(url) || url.includes(':hls:manifest') || url.includes(':hls:hls');
}

function isSslCertError(err) {
  const raw = extractRawMessage(err);
  return /ERR_CERT|CERT_DATE|CERT_AUTHORITY|CERT_COMMON_NAME|UNABLE_TO_VERIFY|DEPTH_ZERO|SELF_SIGNED|certificate|SSL|TLS/i.test(raw);
}

function nodeFetchBuffer(url, headers = {}, signal = null, opts = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (e) { reject(e); return; }
    const insecure = !!opts.insecureTls;
    const doRequest = (targetUrl, redirectsLeft) => {
      let p;
      try { p = new URL(targetUrl); } catch (e) { reject(e); return; }
      const rlib = p.protocol === 'https:' ? https : http;
      const agent = p.protocol === 'https:'
        ? (insecure ? httpsInsecureAgent : httpsAgent)
        : httpAgent;
      const req = rlib.request({
        hostname: p.hostname,
        port: p.port || undefined,
        path: `${p.pathname}${p.search}`,
        method: 'GET',
        headers: { ...headers },
        agent,
        rejectUnauthorized: insecure ? false : undefined,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) { reject(new Error(`Too many redirects @ ${targetUrl}`)); return; }
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, targetUrl).href;
          doRequest(next, redirectsLeft - 1);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          reject(new Error(`HTTP ${res.statusCode} @ ${targetUrl}`));
          res.resume();
          return;
        }
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => resolve(Buffer.concat(chunks)));
        res.on('error', reject);
      });
      req.on('error', reject);
      if (signal) {
        const onAbort = () => { req.destroy(); reject(new Error('cancelled')); };
        if (signal.aborted) { onAbort(); return; }
        signal.addEventListener('abort', onAbort, { once: true });
      }
      req.end();
    };
    doRequest(url, 8);
  });
}

function nodeFetchStreamToFile(url, outputPath, headers = {}, onProgress = null, signal = null, opts = {}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      reject(e);
      return;
    }
    const insecure = !!opts.insecureTls;

    const fail = (err) => {
      try { ws?.destroy(); } catch (_) {}
      reject(err);
    };

    let ws;
    const doRequest = (targetUrl, redirectsLeft) => {
      let p;
      try { p = new URL(targetUrl); } catch (e) { fail(e); return; }
      const rlib = p.protocol === 'https:' ? https : http;
      const agent = p.protocol === 'https:'
        ? (insecure ? httpsInsecureAgent : httpsAgent)
        : httpAgent;
      const rOpts = {
        hostname: p.hostname,
        port: p.port || undefined,
        path: `${p.pathname}${p.search}`,
        method: 'GET',
        headers: { ...headers },
        agent,
        rejectUnauthorized: insecure ? false : undefined,
      };
      const req = rlib.request(rOpts, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            fail(new Error(`Too many redirects @ ${targetUrl}`));
            return;
          }
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, targetUrl).href;
          doRequest(next, redirectsLeft - 1);
          return;
        }
        if (res.statusCode && res.statusCode >= 400) {
          fail(new Error(`HTTP ${res.statusCode} @ ${targetUrl}`));
          res.resume();
          return;
        }
        const total = parseInt(res.headers['content-length'] || '0', 10) || 0;
        let received = 0;
        let lastEmit = 0;
        ws = fs.createWriteStream(outputPath);
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
          ws.end(() => {
            if (onProgress) onProgress(received || 1, total || received || 1);
            resolve();
          });
        });
        res.on('error', fail);
        ws.on('error', fail);
      });
      req.on('error', fail);
      if (signal) {
        const onAbort = () => {
          req.destroy();
          fail(new Error('cancelled'));
        };
        if (signal.aborted) { onAbort(); return; }
        signal.addEventListener('abort', onAbort, { once: true });
      }
      req.end();
    };
    doRequest(url, 8);
  });
}

async function sessionFetchStreamToFile(url, outputPath, headers = {}, onProgress = null, signal = null) {
  if (typeof session?.defaultSession?.fetch === 'function') {
    const res = await session.defaultSession.fetch(url, { headers, redirect: 'follow', signal });
    if (!res.ok) throw new Error(`HTTP ${res.status} @ ${url}`);
    const total = parseInt(res.headers.get('content-length') || '0', 10) || 0;
    let received = 0;
    let lastEmit = 0;
    const body = res.body;
    if (!body) throw new Error(`Empty body @ ${url}`);
    const reader = body.getReader();
    const ws = fs.createWriteStream(outputPath);
    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        received += value.length;
        ws.write(Buffer.from(value));
        const now = Date.now();
        if (onProgress && now - lastEmit >= 300) {
          lastEmit = now;
          onProgress(received, total);
        }
      }
      await new Promise((resolve, reject) => {
        ws.end(() => resolve());
        ws.on('error', reject);
      });
      if (onProgress) onProgress(received || 1, total || received || 1);
      return;
    } catch (e) {
      try { ws.destroy(); } catch (_) {}
      throw e;
    }
  }
  return nodeFetchStreamToFile(url, outputPath, headers, onProgress, signal);
}

function enqueue(jobInput, deps) {
  const {
    downloadHlsToFile,
    formatDownloadError: fmt = formatDownloadError,
    isEmbedPageUrl,
  } = deps;

  const url = typeof jobInput?.url === 'string' ? jobInput.url : '';
  if (!/^https?:\/\//i.test(url)) return null;
  if (isEmbedPageUrl(url)) {
    const errJob = {
      id: `dl-${Date.now()}-skip`,
      url,
      filePath: '',
      filename: jobInput?.filename || 'episode.mp4',
      headers: {},
      status: 'error',
      received: 0,
      total: 0,
      error: fmt('embed-url-not-video', { url, filename: jobInput?.filename }),
      folder: jobInput?.folder,
      releaseId: jobInput?.releaseId,
      sourceId: jobInput?.sourceId,
      dubberId: jobInput?.dubberId,
      episodePosition: jobInput?.episodePosition,
      releaseTitle: jobInput?.releaseTitle,
      dubberName: jobInput?.dubberName,
      sourceName: jobInput?.sourceName,
    };
    emit(errJob);
    return null;
  }

  const job = /** @type {DownloadJob} */ ({
    id: jobInput.id || `dl-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    url,
    filePath: jobInput.filePath,
    filename: jobInput.filename,
    headers: jobInput.headers && typeof jobInput.headers === 'object' ? jobInput.headers : {},
    folder: jobInput.folder,
    releaseId: jobInput.releaseId,
    sourceId: jobInput.sourceId,
    dubberId: jobInput.dubberId,
    episodePosition: jobInput.episodePosition,
    releaseTitle: jobInput.releaseTitle,
    dubberName: jobInput.dubberName,
    sourceName: jobInput.sourceName,
    status: streamingHold ? 'paused' : 'queued',
    pausedByStreaming: streamingHold || undefined,
    received: 0,
    total: 0,
  });
  queue.push(job);
  if (streamingHold) streamingPausedIds.add(job.id);
  persist.writeSidecar(job);
  emit(job);
  if (!streamingHold) void pump(deps);
  else persistQueueNow();
  return job;
}

/**
 * Восстановить незавершённые загрузки после рестарта приложения.
 * @param {object} deps
 * @param {string} [downloadRoot]
 * @returns {number} сколько задач вернули в очередь
 */
function restorePersistedJobs(deps, downloadRoot = '') {
  const items = persist.mergePersistedJobs(downloadRoot);
  let n = 0;
  const existingPaths = new Set(queue.map((j) => path.resolve(j.filePath || '')));

  for (const item of items) {
    const resolved = path.resolve(item.filePath);
    if (existingPaths.has(resolved)) continue;
    if (persist.isCompleteVideo(item.filePath)) {
      persist.removeSidecar(item.filePath);
      continue;
    }

    let url = typeof item.url === 'string' ? item.url : '';
    if (!/^https?:\/\//i.test(url)) {
      if (
        item.releaseId == null
        || item.sourceId == null
        || item.episodePosition == null
      ) {
        continue;
      }
      url = 'https://placeholder.invalid/resume';
      item.needsUrlRefresh = true;
    }

    const prog = persist.estimateProgressFromParts(item.filePath);
    const wasPaused = item.status === 'paused';
    const job = /** @type {DownloadJob} */ ({
      id: item.id || `dl-resume-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      url,
      filePath: item.filePath,
      filename: item.filename || path.basename(item.filePath),
      headers: item.headers && typeof item.headers === 'object' ? item.headers : {},
      folder: item.folder || '',
      releaseId: item.releaseId,
      sourceId: item.sourceId,
      dubberId: item.dubberId,
      episodePosition: item.episodePosition,
      releaseTitle: item.releaseTitle,
      dubberName: item.dubberName,
      sourceName: item.sourceName,
      status: wasPaused ? 'paused' : 'queued',
      received: prog?.received || item.received || 0,
      total: prog?.total || item.total || 0,
      needsUrlRefresh: !!item.needsUrlRefresh || url.includes('placeholder.invalid'),
      resumed: true,
    });
    queue.push(job);
    existingPaths.add(resolved);
    emit(job);
    n += 1;
  }

  if (n > 0) {
    persistQueueNow();
    // Не качаем то, что было на паузе до рестарта
    if (queue.some((j) => j.status === 'queued')) void pump(deps);
  } else {
    persistQueueNow();
  }
  return n;
}

async function runJob(job, deps) {
  const {
    downloadHlsToFile,
    formatDownloadError: fmt = formatDownloadError,
    refreshDownloadUrl = null,
    resolveHlsConcurrency = null,
    isEmbedPageUrl = null,
  } = deps;
  const maxSslRetries = 2;
  job.sslRetries = job.sslRetries || 0;

  job.status = 'downloading';
  // При resume не сбрасываем счётчики в 0 — progress обновится из частей
  if (!job.resumed) {
    job.received = 0;
    job.total = 0;
  }
  job.abort = new AbortController();
  emit(job);

  // Просроченная ссылка / HTML-эмбед / восстановление без URL
  if (
    job.needsUrlRefresh
    || /placeholder\.invalid/i.test(job.url)
    || (typeof isEmbedPageUrl === 'function' && isEmbedPageUrl(job.url))
  ) {
    if (typeof refreshDownloadUrl === 'function') {
      try {
        const fresh = await refreshDownloadUrl(job);
        if (fresh?.url && !(typeof isEmbedPageUrl === 'function' && isEmbedPageUrl(fresh.url))) {
          job.url = fresh.url;
          job.headers = fresh.headers && typeof fresh.headers === 'object'
            ? fresh.headers
            : job.headers;
          job.needsUrlRefresh = false;
        }
      } catch (_) { /* continue */ }
    }
    if (!/^https?:\/\//i.test(job.url) || /placeholder\.invalid/i.test(job.url)) {
      throw new Error('Ссылка устарела — добавьте серию в загрузку снова');
    }
    if (typeof isEmbedPageUrl === 'function' && isEmbedPageUrl(job.url)) {
      throw new Error('libria-release-missing');
    }
  }

  const onProgress = (received, total) => {
    job.received = received;
    job.total = total;
    emit(job);
  };

  const agents = {
    http: httpAgent,
    https: httpsAgent,
    httpsInsecure: httpsInsecureAgent,
  };

  const fallbackSingle = async (url, outputPath, headers, progressCb, signal, insecureTls = false) => {
    if (insecureTls) {
      await nodeFetchStreamToFile(url, outputPath, headers, progressCb, signal, { insecureTls: true });
      return;
    }
    try {
      await sessionFetchStreamToFile(url, outputPath, headers, progressCb, signal);
    } catch (netErr) {
      const raw = extractRawMessage(netErr);
      if (raw === 'cancelled' || signal?.aborted) throw new Error('cancelled');
      if (isSslCertError(netErr) || /BLOCKED_BY_CLIENT|ERR_FAILED|ENOTFOUND|ECONN/i.test(raw)) {
        await nodeFetchStreamToFile(url, outputPath, headers, progressCb, signal);
      } else {
        throw netErr;
      }
    }
  };

  const runOnce = async (insecureTls = false) => {
    const isHls = isHlsUrl(job.url);
    if (isHls) {
      await downloadHlsToFile(job.url, job.filePath, job.headers, onProgress, job.abort.signal, { insecureTls });
    } else {
      // Progressive MP4: N точек на таймлайне → параллельные Range → склейка
      const points = typeof resolveHlsConcurrency === 'function'
        ? resolveHlsConcurrency()
        : 16;
      await parallelRangeDownload({
        url: job.url,
        outputPath: job.filePath,
        headers: job.headers,
        points,
        onProgress,
        signal: job.abort.signal,
        insecureTls,
        agents,
        fallbackSingle: (u, o, h, p, s) => fallbackSingle(u, o, h, p, s, insecureTls),
      });
    }
  };

  try {
    try {
      await runOnce(false);
    } catch (err) {
      const msg = extractRawMessage(err);
      if (msg === 'cancelled' || job.abort?.signal.aborted) throw new Error('cancelled');

      if (isSslCertError(err) && job.sslRetries < maxSslRetries) {
        job.sslRetries += 1;
        job.error = undefined;
        emit(job, { note: 'ssl-retry' });

        // 1) Новая ссылка с API
        if (typeof refreshDownloadUrl === 'function') {
          try {
            const fresh = await refreshDownloadUrl(job);
            if (fresh?.url) {
              job.url = fresh.url;
              job.headers = fresh.headers && typeof fresh.headers === 'object'
                ? fresh.headers
                : job.headers;
            }
          } catch (_) { /* continue with insecure fallback */ }
        }

        // 2) Повтор: сначала нормальный TLS, потом без проверки сертификата CDN
        try {
          await runOnce(false);
        } catch (err2) {
          if (extractRawMessage(err2) === 'cancelled' || job.abort?.signal.aborted) {
            throw new Error('cancelled');
          }
          if (isSslCertError(err2)) {
            await runOnce(true);
          } else {
            throw err2;
          }
        }
      } else {
        throw err;
      }
    }

    let fileSize = 0;
    try { fileSize = fs.statSync(job.filePath).size; } catch {}
    if (fileSize < 1024) {
      throw new Error('Файл скачан пустым или слишком маленьким — ссылка могла устареть, попробуйте другое качество');
    }
    job.status = 'done';
    job.received = fileSize || job.received || 1;
    job.total = fileSize || job.total || job.received;
    job.resumed = false;
    persist.removeSidecar(job.filePath);
    emit(job);
  } catch (err) {
    const msg = extractRawMessage(err);
    // Переключение «всё сразу» → «по очереди»: ставим в ожидание, части НЕ трогаем
    if (job.requeueAfterStop) {
      job.requeueAfterStop = false;
      job.resumed = true;
      job.status = 'queued';
      job.error = undefined;
      const prog = persist.estimateProgressFromParts(job.filePath);
      if (prog) {
        job.received = prog.received;
        job.total = prog.total || job.total || prog.received;
      }
      persist.writeSidecar(job);
      emit(job);
    } else if (job.pauseRequested || job.status === 'paused') {
      job.pauseRequested = false;
      job.resumed = true;
      job.status = 'paused';
      job.error = undefined;
      const prog = persist.estimateProgressFromParts(job.filePath);
      if (prog) {
        job.received = Math.max(job.received || 0, prog.received);
        job.total = prog.total || job.total || prog.received;
      }
      persist.writeSidecar(job);
      emit(job);
    } else if (msg === 'cancelled' || job.abort?.signal.aborted) {
      job.status = 'cancelled';
      job.error = 'Загрузка отменена пользователем';
      emit(job);
      cleanupJobFiles(job.filePath, { keepParts: false, removeOutput: true });
    } else {
      job.status = 'error';
      job.error = fmt(err, { url: job.url, filename: job.filename, skipReformat: true });
      emit(job);
      persist.writeSidecar(job);
    }
  } finally {
    job.abort = undefined;
  }
}

function resolveParallelLimit(deps) {
  const maxParallel = typeof deps?.resolveParallelFiles === 'function'
    ? deps.resolveParallelFiles()
    : 1;
  return Number.isFinite(maxParallel) && maxParallel > 0 ? maxParallel : 1;
}

function pump(deps) {
  if (streamingHold) return;
  if (deps) lastPumpDeps = deps;
  const useDeps = deps || lastPumpDeps;
  if (!useDeps) return;
  // Как Kodik-Download-Watch: по умолчанию 1 файл с полной параллельностью сегментов.
  const limit = resolveParallelLimit(useDeps);
  const queued = queue.filter((j) => j.status === 'queued');
  for (const job of queued) {
    if (activeCount >= limit) break;
    if (job.status !== 'queued') continue;
    job.status = 'starting';
    activeCount += 1;
    void (async () => {
      try {
        if (job.requeueAfterStop) {
          job.requeueAfterStop = false;
          job.status = 'queued';
          emit(job);
          return;
        }
        if (job.pauseRequested) {
          job.pauseRequested = false;
          job.status = 'paused';
          job.resumed = true;
          emit(job);
          return;
        }
        if (job.status === 'cancelled' || job.status === 'paused') return;
        await runJob(job, useDeps);
      } finally {
        activeCount = Math.max(0, activeCount - 1);
        if (job.status === 'queued' || job.status === 'paused') {
          // вернули в очередь / на паузу — оставляем в queue
        } else {
          const idx = queue.indexOf(job);
          if (idx !== -1) queue.splice(idx, 1);
        }
        pump(useDeps);
      }
    })();
  }
}

/**
 * Сразу применить лимит параллельности к активным:
 * · всё сразу → стартуем очередь
 * · по очереди → лишние активные на паузу (queued), части сохраняются
 */
function syncParallelPolicy(deps) {
  if (deps) lastPumpDeps = deps;
  enforceQueuePriority(deps || lastPumpDeps);
}

/**
 * После смены порядка / лимита: качаются только первые N задач
 * в текущем порядке очереди; остальные активные — обратно в queued (части сохраняются).
 */
function enforceQueuePriority(deps) {
  const useDeps = deps || lastPumpDeps;
  if (!useDeps) return;
  const limit = resolveParallelLimit(useDeps);

  const competitors = queue.filter((j) =>
    j.status === 'queued'
    || j.status === 'starting'
    || j.status === 'downloading',
  );
  const allowed = new Set(competitors.slice(0, limit).map((j) => j.id));

  for (const job of competitors) {
    if (allowed.has(job.id)) continue;
    if (job.status !== 'downloading' && job.status !== 'starting') continue;

    job.requeueAfterStop = true;
    job.resumed = true;
    job.pauseRequested = false;
    const prog = persist.estimateProgressFromParts(job.filePath);
    if (prog) {
      job.received = Math.max(job.received || 0, prog.received);
      job.total = prog.total || job.total || prog.received;
    }
    if (job.abort) {
      try { job.abort.abort(); } catch (_) {}
    } else if (job.status === 'starting') {
      job.requeueAfterStop = false;
      job.status = 'queued';
      emit(job);
    }
  }

  persistQueueNow();
  pump(useDeps);
}

function cancelJob(id) {
  const job = queue.find((j) => j.id === id);
  if (!job) return false;
  if (job.status === 'paused') {
    job.status = 'cancelled';
    job.error = 'Загрузка отменена пользователем';
    emit(job);
    cleanupJobFiles(job.filePath, { keepParts: false, removeOutput: true });
    const idx = queue.indexOf(job);
    if (idx !== -1) queue.splice(idx, 1);
    persistQueueNow();
    return true;
  }
  if (job.status === 'queued' || job.status === 'starting') {
    job.status = 'cancelled';
    job.error = 'Загрузка отменена пользователем';
    emit(job);
    cleanupJobFiles(job.filePath, { keepParts: false, removeOutput: true });
    const idx = queue.indexOf(job);
    if (idx !== -1) queue.splice(idx, 1);
    persistQueueNow();
    return true;
  }
  if (job.status === 'downloading' && job.abort) {
    job.pauseRequested = false;
    job.abort.abort();
    return true;
  }
  return false;
}

function pauseJob(id) {
  const job = queue.find((j) => j.id === id);
  if (!job) return false;
  if (job.status === 'queued' || job.status === 'starting') {
    job.status = 'paused';
    job.resumed = true;
    job.error = undefined;
    emit(job);
    persistQueueNow();
    return true;
  }
  if (job.status === 'downloading') {
    job.pauseRequested = true;
    job.requeueAfterStop = false;
    if (job.abort) {
      try { job.abort.abort(); } catch (_) {}
    }
    return true;
  }
  return false;
}

function pauseAll() {
  const ids = queue
    .filter((j) => j.status === 'queued' || j.status === 'starting' || j.status === 'downloading')
    .map((j) => j.id);
  let n = 0;
  for (const id of ids) {
    if (pauseJob(id)) n += 1;
  }
  return n;
}

function resumeJob(id, deps) {
  if (streamingHold) return false;
  const job = queue.find((j) => j.id === id);
  if (!job || job.status !== 'paused') return false;
  job.status = 'queued';
  job.resumed = true;
  job.pauseRequested = false;
  job.pausedByStreaming = false;
  streamingPausedIds.delete(id);
  job.error = undefined;
  emit(job);
  persistQueueNow();
  pump(deps || lastPumpDeps);
  return true;
}

function resumeAll(deps) {
  if (streamingHold) return 0;
  const ids = queue.filter((j) => j.status === 'paused').map((j) => j.id);
  let n = 0;
  for (const id of ids) {
    if (resumeJob(id, deps)) n += 1;
  }
  return n;
}

/**
 * Переставить задачи по списку id и сразу сменить приоритет загрузки.
 */
function reorderQueue(orderedIds, deps) {
  if (!Array.isArray(orderedIds) || orderedIds.length === 0) return false;
  const byId = new Map(queue.map((j) => [j.id, j]));
  const next = [];
  const seen = new Set();
  for (const id of orderedIds) {
    const job = byId.get(id);
    if (!job || seen.has(id)) continue;
    next.push(job);
    seen.add(id);
  }
  for (const job of queue) {
    if (!seen.has(job.id)) next.push(job);
  }
  queue.length = 0;
  queue.push(...next);
  persistQueueNow();
  for (const job of next) emit(job);
  // Важно: не только UI-порядок — остановить «устаревшие» активные и стартовать верх очереди
  enforceQueuePriority(deps || lastPumpDeps);
  return true;
}

function cancelAll() {
  const ids = queue.map((j) => j.id);
  let n = 0;
  for (const id of ids) {
    if (cancelJob(id)) n++;
  }
  return n;
}

function getQueueSnapshot() {
  return queue.map((j) => ({ ...j, abort: undefined }));
}

/** Пути файлов, которые сейчас качаются (не показывать в библиотеке). */
function getActiveDownloadPaths() {
  const paths = new Set();
  for (const j of queue) {
    if (!j.filePath) continue;
    if (
      j.status === 'queued'
      || j.status === 'starting'
      || j.status === 'downloading'
      || j.status === 'paused'
    ) {
      paths.add(path.resolve(j.filePath));
    }
  }
  return paths;
}

module.exports = {
  setProgressSink,
  setStreamingHoldSink,
  setStreamingHold,
  isStreamingHold,
  enqueue,
  cancelJob,
  pauseJob,
  pauseAll,
  resumeJob,
  resumeAll,
  reorderQueue,
  cancelAll,
  getQueueSnapshot,
  getActiveDownloadPaths,
  syncParallelPolicy,
  restorePersistedJobs,
  persistQueueNow,
  pump,
  MIN_PLAYABLE_BYTES,
  nodeFetchStreamToFile,
  nodeFetchBuffer,
  sessionFetchStreamToFile,
  isSslCertError,
};
