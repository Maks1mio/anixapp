'use strict';

/**
 * Параллельная загрузка одного файла по точкам на таймлайне (HTTP Range).
 *
 * Идея как у IDM / схема «N сегментов на таймлайне»:
 * файл делится на N равных кусков → с каждой точки идёт запрос вперёд
 * до границы куска → куски склеиваются по порядку в один файл.
 *
 * Для HLS это не нужно (там уже сегменты плейлиста) — только для progressive MP4/и т.п.
 */

const fs = require('fs');
const http = require('http');
const https = require('https');
const path = require('path');
const { extractRawMessage } = require('./download-errors');

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function pickAgent(url, insecure, agents) {
  const httpsUrl = /^https:/i.test(url);
  if (!httpsUrl) return agents.http;
  return insecure ? agents.httpsInsecure : agents.https;
}

function requestOnce(url, {
  method = 'GET',
  headers = {},
  signal = null,
  insecure = false,
  agents,
}) {
  return new Promise((resolve, reject) => {
    let parsed;
    try { parsed = new URL(url); } catch (e) { reject(e); return; }

    const doRequest = (targetUrl, redirectsLeft) => {
      let p;
      try { p = new URL(targetUrl); } catch (e) { reject(e); return; }
      const lib = p.protocol === 'https:' ? https : http;
      const agent = pickAgent(targetUrl, insecure, agents);
      const req = lib.request({
        hostname: p.hostname,
        port: p.port || undefined,
        path: `${p.pathname}${p.search}`,
        method,
        headers: { ...headers },
        agent,
        rejectUnauthorized: insecure ? false : undefined,
      }, (res) => {
        if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
          res.resume();
          if (redirectsLeft <= 0) {
            reject(new Error(`Too many redirects @ ${targetUrl}`));
            return;
          }
          const next = res.headers.location.startsWith('http')
            ? res.headers.location
            : new URL(res.headers.location, targetUrl).href;
          doRequest(next, redirectsLeft - 1);
          return;
        }
        resolve({ res, url: targetUrl });
      });
      req.on('error', reject);
      if (signal) {
        const onAbort = () => {
          req.destroy();
          reject(new Error('cancelled'));
        };
        if (signal.aborted) { onAbort(); return; }
        signal.addEventListener('abort', onAbort, { once: true });
      }
      req.end();
    };
    doRequest(url, 8);
  });
}

async function readResponseBuffer(res) {
  const chunks = [];
  for await (const c of res) chunks.push(c);
  return Buffer.concat(chunks);
}

/**
 * Сколько точек на таймлайне для progressive-файла.
 * Infinity/max → 16 (как на схеме), иначе clamp 2…32.
 */
function resolveTimelinePoints(concurrency) {
  if (!Number.isFinite(concurrency) || concurrency <= 0) return 16;
  if (concurrency >= 64) return 16;
  return Math.min(32, Math.max(2, Math.round(concurrency)));
}

/**
 * Узнать размер и поддержку Range.
 */
async function probeFile(url, headers, signal, insecure, agents) {
  // 1) HEAD
  try {
    const { res } = await requestOnce(url, {
      method: 'HEAD',
      headers,
      signal,
      insecure,
      agents,
    });
    res.resume();
    const len = parseInt(res.headers['content-length'] || '0', 10) || 0;
    const accept = String(res.headers['accept-ranges'] || '').toLowerCase();
    if (len > 0 && accept.includes('bytes')) {
      return { size: len, supportsRange: true };
    }
    // Есть размер, но Accept-Ranges неясен — проверим Range-probe ниже
    if (len > 0 && !accept.includes('none')) {
      // continue to range probe
    }
  } catch (_) { /* fallback */ }

  // 2) Range probe
  const { res } = await requestOnce(url, {
    method: 'GET',
    headers: { ...headers, Range: 'bytes=0-0' },
    signal,
    insecure,
    agents,
  });
  const status = res.statusCode || 0;
  const cr = String(res.headers['content-range'] || '');
  const m = /\/(\d+)\s*$/.exec(cr);
  const sizeFromRange = m ? parseInt(m[1], 10) : 0;

  if (status === 206 && sizeFromRange > 0) {
    await readResponseBuffer(res);
    return { size: sizeFromRange, supportsRange: true };
  }
  if (status === 200) {
    const len = parseInt(res.headers['content-length'] || '0', 10) || 0;
    // Сервер игнорирует Range — не качаем весь файл в probe
    try { res.destroy(); } catch (_) { res.resume(); }
    return { size: len, supportsRange: false };
  }
  try { res.destroy(); } catch (_) { res.resume(); }
  return { size: 0, supportsRange: false };
}

function buildRanges(totalSize, points) {
  const n = Math.min(points, Math.max(1, totalSize));
  const chunk = Math.floor(totalSize / n);
  const ranges = [];
  for (let i = 0; i < n; i++) {
    const start = i * chunk;
    const end = i === n - 1 ? totalSize - 1 : (i + 1) * chunk - 1;
    if (start <= end) ranges.push({ index: i, start, end });
  }
  return ranges;
}

async function downloadRangeToFile(url, range, partPath, headers, signal, insecure, agents, onBytes) {
  const { res } = await requestOnce(url, {
    method: 'GET',
    headers: {
      ...headers,
      Range: `bytes=${range.start}-${range.end}`,
    },
    signal,
    insecure,
    agents,
  });

  const status = res.statusCode || 0;
  if (status !== 206 && status !== 200) {
    res.resume();
    throw new Error(`HTTP ${status} range ${range.start}-${range.end}`);
  }
  // Если сервер отдал весь файл вместо куска — это не Range
  if (status === 200) {
    res.resume();
    throw new Error('RANGE_NOT_SUPPORTED');
  }

  const expected = range.end - range.start + 1;
  const ws = fs.createWriteStream(partPath);
  let got = 0;
  try {
    for await (const chunk of res) {
      if (signal?.aborted) throw new Error('cancelled');
      got += chunk.length;
      ws.write(chunk);
      if (onBytes) onBytes(chunk.length);
    }
    await new Promise((resolve, reject) => {
      ws.end(() => resolve());
      ws.on('error', reject);
    });
  } catch (err) {
    try { ws.destroy(); } catch (_) {}
    throw err;
  }

  if (got < expected * 0.98) {
    throw new Error(`Неполный кусок ${range.index}: ${got}/${expected}`);
  }
}

async function concatParts(partPaths, outputPath) {
  const ws = fs.createWriteStream(outputPath);
  try {
    for (const part of partPaths) {
      await new Promise((resolve, reject) => {
        const rs = fs.createReadStream(part);
        rs.on('error', reject);
        rs.on('end', resolve);
        rs.pipe(ws, { end: false });
      });
    }
    await new Promise((resolve, reject) => {
      ws.end(() => resolve());
      ws.on('error', reject);
    });
  } catch (err) {
    try { ws.destroy(); } catch (_) {}
    throw err;
  }
}

/**
 * @param {object} opts
 * @param {string} opts.url
 * @param {string} opts.outputPath
 * @param {Record<string, string>} [opts.headers]
 * @param {number} [opts.points] — точек на таймлайне
 * @param {(received: number, total: number) => void} [opts.onProgress]
 * @param {AbortSignal} [opts.signal]
 * @param {boolean} [opts.insecureTls]
 * @param {{ http: import('http').Agent, https: import('https').Agent, httpsInsecure: import('https').Agent }} opts.agents
 * @param {(url: string, outputPath: string, headers: object, onProgress: function, signal: AbortSignal) => Promise<void>} [opts.fallbackSingle]
 */
async function parallelRangeDownload(opts) {
  const {
    url,
    outputPath,
    headers = {},
    points = 8,
    onProgress = null,
    signal = null,
    insecureTls = false,
    agents,
    fallbackSingle = null,
  } = opts;

  if (signal?.aborted) throw new Error('cancelled');

  let probe;
  try {
    probe = await probeFile(url, headers, signal, insecureTls, agents);
  } catch (err) {
    if (extractRawMessage(err) === 'cancelled') throw err;
    if (fallbackSingle) {
      await fallbackSingle(url, outputPath, headers, onProgress, signal);
      return { mode: 'single-fallback-probe' };
    }
    throw err;
  }

  const timelinePoints = resolveTimelinePoints(points);
  if (!probe.supportsRange || probe.size < 2 * 1024 * 1024 || timelinePoints < 2) {
    if (fallbackSingle) {
      await fallbackSingle(url, outputPath, headers, onProgress, signal);
      return { mode: 'single-no-range' };
    }
    throw new Error('Сервер не поддерживает Range — нужна обычная загрузка');
  }

  const ranges = buildRanges(probe.size, timelinePoints);
  const workDir = `${outputPath}.range-parts`;
  fs.mkdirSync(workDir, { recursive: true });
  const pad = String(ranges.length).length;
  const partPaths = ranges.map((r) => path.join(workDir, `${String(r.index).padStart(pad, '0')}.bin`));

  // Сохраняем meta для resume (число кусков + размер)
  try {
    fs.writeFileSync(
      path.join(workDir, 'meta.json'),
      JSON.stringify({ size: probe.size, points: ranges.length, url }),
      'utf8',
    );
  } catch (_) { /* ignore */ }

  let received = 0;
  const partBytes = new Array(ranges.length).fill(0);
  let lastEmit = 0;
  const emitProgress = () => {
    if (!onProgress) return;
    const now = Date.now();
    if (now - lastEmit < 200) return;
    lastEmit = now;
    received = partBytes.reduce((a, b) => a + b, 0);
    onProgress(received, probe.size);
  };

  // Уже скачанные куски — не качаем заново
  for (let i = 0; i < ranges.length; i++) {
    const expected = ranges[i].end - ranges[i].start + 1;
    try {
      if (fs.existsSync(partPaths[i])) {
        const st = fs.statSync(partPaths[i]);
        if (st.size >= expected * 0.98) {
          partBytes[i] = st.size;
          continue;
        }
        fs.unlinkSync(partPaths[i]);
      }
    } catch (_) { /* re-download */ }
  }
  emitProgress();

  let success = false;
  try {
    // Все точки стартуют сразу — каждая качает «вперёд» свой кусок
    await Promise.all(ranges.map(async (range, i) => {
      const expected = range.end - range.start + 1;
      if (partBytes[i] >= expected * 0.98) return;

      let attempt = 0;
      while (attempt < 3) {
        if (signal?.aborted) throw new Error('cancelled');
        partBytes[i] = 0;
        try {
          await downloadRangeToFile(
            url,
            range,
            partPaths[i],
            headers,
            signal,
            insecureTls,
            agents,
            (n) => {
              partBytes[i] += n;
              emitProgress();
            },
          );
          return;
        } catch (err) {
          const raw = extractRawMessage(err);
          if (raw === 'cancelled') throw err;
          if (raw === 'RANGE_NOT_SUPPORTED') throw err;
          attempt += 1;
          if (attempt >= 3) throw err;
          await sleep(400 * attempt);
        }
      }
    }));

    if (signal?.aborted) throw new Error('cancelled');
    await concatParts(partPaths, outputPath);
    if (onProgress) onProgress(probe.size, probe.size);
    success = true;
    return { mode: 'parallel-range', points: ranges.length, size: probe.size };
  } catch (err) {
    const raw = extractRawMessage(err);
    if (raw === 'RANGE_NOT_SUPPORTED' && fallbackSingle) {
      await fallbackSingle(url, outputPath, headers, onProgress, signal);
      success = true;
      return { mode: 'single-after-range-fail' };
    }
    throw err;
  } finally {
    // Части оставляем при ошибке/отмене — для resume после рестарта
    if (success) {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

module.exports = {
  parallelRangeDownload,
  resolveTimelinePoints,
  buildRanges,
  probeFile,
};
