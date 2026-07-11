'use strict';

const fs = require('fs');
const path = require('path');
const http = require('http');
const https = require('https');
const { session } = require('electron');
const { formatDownloadError, extractRawMessage } = require('./download-errors');

const MIN_PLAYABLE_BYTES = 512 * 1024;

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
 * @property {'queued'|'downloading'|'done'|'error'|'cancelled'} status
 * @property {number} received
 * @property {number} total
 * @property {string} [error]
 * @property {AbortController} [abort]
 */

/** @type {DownloadJob[]} */
const queue = [];
let processing = false;
/** @type {(data: object) => void} */
let progressSink = () => {};

function setProgressSink(fn) {
  progressSink = typeof fn === 'function' ? fn : () => {};
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
}

function isHlsUrl(url) {
  return /\.m3u8(\?|$)/i.test(url) || url.includes(':hls:manifest') || url.includes(':hls:hls');
}

function nodeFetchBuffer(url, headers = {}, signal = null) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (e) { reject(e); return; }
    const lib = parsed.protocol === 'https:' ? https : http;
    const doRequest = (targetUrl, redirectsLeft) => {
      let p;
      try { p = new URL(targetUrl); } catch (e) { reject(e); return; }
      const rlib = p.protocol === 'https:' ? https : http;
      const req = rlib.request({
        hostname: p.hostname,
        port: p.port || undefined,
        path: `${p.pathname}${p.search}`,
        method: 'GET',
        headers: { ...headers },
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

function nodeFetchStreamToFile(url, outputPath, headers = {}, onProgress = null, signal = null) {
  return new Promise((resolve, reject) => {
    let parsed;
    try {
      parsed = new URL(url);
    } catch (e) {
      reject(e);
      return;
    }
    const lib = parsed.protocol === 'https:' ? https : http;
    const reqOpts = {
      hostname: parsed.hostname,
      port: parsed.port || undefined,
      path: `${parsed.pathname}${parsed.search}`,
      method: 'GET',
      headers: { ...headers },
    };

    const fail = (err) => {
      try { ws?.destroy(); } catch (_) {}
      reject(err);
    };

    let ws;
    const doRequest = (targetUrl, redirectsLeft) => {
      let p;
      try { p = new URL(targetUrl); } catch (e) { fail(e); return; }
      const rlib = p.protocol === 'https:' ? https : http;
      const rOpts = {
        hostname: p.hostname,
        port: p.port || undefined,
        path: `${p.pathname}${p.search}`,
        method: 'GET',
        headers: { ...headers },
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
    status: 'queued',
    received: 0,
    total: 0,
  });
  queue.push(job);
  emit(job);
  void pump(deps);
  return job;
}

async function runJob(job, deps) {
  const { downloadHlsToFile, formatDownloadError: fmt = formatDownloadError } = deps;
  job.status = 'downloading';
  job.received = 0;
  job.total = 0;
  job.abort = new AbortController();
  emit(job);

  const onProgress = (received, total) => {
    job.received = received;
    job.total = total;
    emit(job);
  };

  const isHls = isHlsUrl(job.url);
  try {
    if (isHls) {
      await downloadHlsToFile(job.url, job.filePath, job.headers, onProgress);
    } else {
      try {
        await sessionFetchStreamToFile(job.url, job.filePath, job.headers, onProgress, job.abort.signal);
      } catch (netErr) {
        const raw = extractRawMessage(netErr);
        if (/BLOCKED_BY_CLIENT|ERR_FAILED|ENOTFOUND|ECONN/i.test(raw)) {
          await nodeFetchStreamToFile(job.url, job.filePath, job.headers, onProgress, job.abort.signal);
        } else {
          throw netErr;
        }
      }
    }
    let fileSize = 0;
    try { fileSize = fs.statSync(job.filePath).size; } catch {}
    job.status = 'done';
    job.received = fileSize || job.received || 1;
    job.total = fileSize || job.total || job.received;
    emit(job);
  } catch (err) {
    const msg = extractRawMessage(err);
    if (msg === 'cancelled' || job.abort?.signal.aborted) {
      job.status = 'cancelled';
      job.error = 'Загрузка отменена';
    } else {
      job.status = 'error';
      job.error = fmt(err, { url: job.url, filename: job.filename, skipReformat: true });
    }
    emit(job);
    try { if (fs.existsSync(job.filePath)) fs.unlinkSync(job.filePath); } catch (_) {}
  } finally {
    job.abort = undefined;
  }
}

async function pump(deps) {
  if (processing) return;
  processing = true;
  while (queue.length > 0) {
    const job = queue.find((j) => j.status === 'queued');
    if (!job) break;
    await runJob(job, deps);
    const idx = queue.indexOf(job);
    if (idx !== -1) queue.splice(idx, 1);
  }
  processing = false;
}

function cancelJob(id) {
  const job = queue.find((j) => j.id === id);
  if (!job) return false;
  if (job.status === 'queued') {
    job.status = 'cancelled';
    job.error = 'Загрузка отменена';
    emit(job);
    const idx = queue.indexOf(job);
    if (idx !== -1) queue.splice(idx, 1);
    return true;
  }
  if (job.status === 'downloading' && job.abort) {
    job.abort.abort();
    return true;
  }
  return false;
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

module.exports = {
  setProgressSink,
  enqueue,
  cancelJob,
  cancelAll,
  getQueueSnapshot,
  MIN_PLAYABLE_BYTES,
  nodeFetchStreamToFile,
  nodeFetchBuffer,
  sessionFetchStreamToFile,
};
