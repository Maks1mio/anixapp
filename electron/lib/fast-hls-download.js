'use strict';

/**
 * Быстрая параллельная загрузка HLS-сегментов.
 * Подход вдохновлён Kodik-Download-Watch (YaNesyTortiK):
 * https://github.com/YaNesyTortiK/Kodik-Download-Watch
 *
 * Идея: скачать все .ts сегменты параллельно, затем склеить через ffmpeg -c copy.
 */

const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');
const { formatDownloadError, extractRawMessage } = require('./download-errors');

function sleep(ms, signal) {
  if (!signal) return new Promise((r) => setTimeout(r, ms));
  if (signal.aborted) return Promise.reject(new Error('cancelled'));
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => {
      signal.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new Error('cancelled'));
    };
    signal.addEventListener('abort', onAbort, { once: true });
  });
}

function hostFromUrl(url) {
  try {
    return new URL(url).hostname;
  } catch {
    return '';
  }
}

/**
 * Политика как у Kodik-Download-Watch: на «max» — по потоку на каждый сегмент
 * (thr = len(segments) в их fast_download.py).
 * AniLibria (cache.libria.fun) режет соединения при высоком параллелизме —
 * держим умеренный cap и больше ретраев.
 */
function hlsFetchPolicy(segments, opts = {}) {
  const total = Math.max(1, segments.length);
  const host = hostFromUrl(segments[0] || '');
  const isAnilibria = /libria\.fun|anilibria|aniliberty/i.test(host);
  const isKodik = /kodik|solodcdn|kodik-storage|zerocdn|cloudimgs\.net|animedia/i.test(host);
  const mode = typeof opts.mode === 'string' ? opts.mode : 'max';

  let cap;
  if (typeof opts.concurrency === 'number' && Number.isFinite(opts.concurrency) && opts.concurrency > 0) {
    cap = Math.round(opts.concurrency);
  } else if (mode === 'safe') {
    cap = 8;
  } else if (mode === 'balanced') {
    cap = 16;
  } else if (mode === 'custom') {
    cap = 32;
  } else {
    // max — как у Kodik: thr = len(segments)
    cap = total;
  }

  // cache.libria.fun: >16 часто даёт ERR_CONNECTION_RESET; 12 стабильнее и в итоге быстрее.
  if (isAnilibria) cap = Math.min(cap, 12);
  // Kodik CDN рассчитан на «все сегменты сразу»
  if (isKodik && mode === 'max') {
    cap = total;
  }

  const concurrency = Math.min(total, Math.max(1, cap));
  const careful = isAnilibria || mode === 'safe' || concurrency <= 8;
  return {
    concurrency,
    delayMs: 0,
    maxRetries: isAnilibria ? 8 : (careful ? 6 : 4),
    retryBaseMs: isAnilibria ? 1400 : (careful ? 1000 : 400),
  };
}

function isRetryableFetchError(err) {
  const raw = extractRawMessage(err);
  if (!raw || /^cancelled$/i.test(raw)) return false;
  return /HTTP\s+429|HTTP\s+503|HTTP\s+502|HTTP\s+500|HTTP\s+404|ERR_FAILED|ERR_CONNECTION_RESET|ERR_CONNECTION_CLOSED|ERR_CONNECTION_ABORTED|ERR_CONNECTION_REFUSED|ERR_NETWORK_CHANGED|ERR_INTERNET_DISCONNECTED|ERR_EMPTY_RESPONSE|ERR_TIMED_OUT|ECONNRESET|ETIMEDOUT|ECONNABORTED|ENETUNREACH|EAI_AGAIN|socket hang up|timeout|connection reset|connection closed|network changed/i.test(raw);
}

function isConnectionResetError(err) {
  return /ERR_CONNECTION_RESET|ECONNRESET|connection reset|socket hang up/i.test(extractRawMessage(err));
}

async function fetchBufferWithRetry(fetchBuffer, url, headers, policy, signal) {
  let lastErr;
  for (let attempt = 0; attempt <= policy.maxRetries; attempt++) {
    if (signal?.aborted) throw new Error('cancelled');
    try {
      return await fetchBuffer(url, headers, signal);
    } catch (err) {
      lastErr = err;
      const raw = extractRawMessage(err);
      if (raw === 'cancelled' || signal?.aborted) throw new Error('cancelled');
      if (!isRetryableFetchError(err) || attempt === policy.maxRetries) throw err;
      const base = isConnectionResetError(err) ? policy.retryBaseMs * 1.75 : policy.retryBaseMs;
      const delay = base * Math.pow(1.5, attempt) + Math.random() * 300;
      await sleep(delay, signal);
    }
  }
  throw lastErr;
}

/**
 * Параллельные воркеры с общим abort: первая фатальная ошибка останавливает остальных.
 * Иначе Promise.all падает в UI, а соседние воркеры продолжают писать .ts на диск.
 */
async function runParallelSegmentWorkers(workerCount, parentSignal, worker) {
  const jobAbort = new AbortController();
  const onParentAbort = () => {
    try { jobAbort.abort(); } catch (_) { /* ignore */ }
  };
  if (parentSignal) {
    if (parentSignal.aborted) throw new Error('cancelled');
    parentSignal.addEventListener('abort', onParentAbort, { once: true });
  }

  /** @type {Error | null} */
  let fatalError = null;

  const failJob = (err) => {
    if (fatalError) return;
    fatalError = err instanceof Error ? err : new Error(String(err));
    try { jobAbort.abort(); } catch (_) { /* ignore */ }
  };

  async function wrapWorker() {
    try {
      await worker(jobAbort.signal, failJob);
    } catch (err) {
      const raw = extractRawMessage(err);
      if (raw === 'cancelled' || jobAbort.signal.aborted) return;
      failJob(err);
    }
  }

  try {
    await Promise.all(Array.from({ length: Math.max(1, workerCount) }, () => wrapWorker()));
  } finally {
    parentSignal?.removeEventListener('abort', onParentAbort);
  }

  if (parentSignal?.aborted) throw new Error('cancelled');
  if (fatalError) throw fatalError;
}

function runFfmpeg(ffmpegPath, args) {
  return new Promise((resolve, reject) => {
    const proc = spawn(ffmpegPath, args, { windowsHide: true });
    let stderr = '';
    proc.stderr.on('data', (c) => { stderr += c.toString(); });
    proc.on('error', (err) => {
      reject(new Error(
        /ENOENT/i.test(err.message)
          ? 'FFmpeg не найден. Установите FFmpeg и повторите скачивание.'
          : err.message,
      ));
    });
    proc.on('close', (code) => {
      if (code === 0) resolve();
      else reject(new Error(stderr.trim() || `ffmpeg завершился с кодом ${code}`));
    });
  });
}

/** Как в Kodik-Download-Watch combine_segments(hwaccel='cuda'). На Windows — d3d11va. */
function ffmpegHwaccelArgs() {
  if (process.platform === 'win32') return ['-hwaccel', 'd3d11va'];
  if (process.platform === 'linux') return ['-hwaccel', 'auto'];
  return [];
}

function makeProgressTracker(totalSegments, onProgress) {
  let bytesDone = 0;
  let segmentsDone = 0;
  let lastEmit = 0;
  const sizes = [];

  function emit(force = false) {
    if (!onProgress) return;
    const now = Date.now();
    if (!force && now - lastEmit < 200) return;
    lastEmit = now;
    const avg = sizes.length ? sizes.reduce((a, b) => a + b, 0) / sizes.length : 0;
    const remaining = Math.max(0, totalSegments - segmentsDone);
    const estTotal = avg > 0
      ? Math.max(bytesDone, Math.round(bytesDone + avg * remaining))
      : Math.max(bytesDone, totalSegments);
    onProgress(bytesDone, estTotal || bytesDone || 1);
  }

  return {
    addSegment(buf) {
      const n = buf?.length || 0;
      bytesDone += n;
      segmentsDone += 1;
      if (n > 0) {
        sizes.push(n);
        if (sizes.length > 64) sizes.shift();
      }
      emit(false);
    },
    finish() {
      emit(true);
    },
  };
}

/**
 * Kodik-style: каждый сегмент в файл → ffmpeg concat -c copy.
 * Лучше при высокой параллельности (нет HOL в памяти).
 */
async function downloadSegmentsToFilesThenConcat(
  segments,
  outputPath,
  headers,
  fetchBuffer,
  ffmpegPath,
  onProgress,
  signal,
  policyOpts = {},
) {
  const total = segments.length;
  const policy = hlsFetchPolicy(segments, policyOpts);
  const workDir = `${outputPath}.hls-parts`;
  fs.mkdirSync(workDir, { recursive: true });

  const pad = String(total).length;
  const partPaths = segments.map((_, i) => path.join(workDir, `${String(i).padStart(pad, '0')}.ts`));
  let nextFetch = 0;
  const tracker = makeProgressTracker(total, onProgress);
  const done = new Array(total).fill(false);

  // Resume: уже лежащие сегменты пропускаем
  for (let i = 0; i < total; i++) {
    try {
      if (fs.existsSync(partPaths[i])) {
        const st = fs.statSync(partPaths[i]);
        if (st.size > 256) {
          done[i] = true;
          tracker.addSegment({ length: st.size });
        } else {
          fs.unlinkSync(partPaths[i]);
        }
      }
    } catch (_) { /* fetch again */ }
  }

  try {
    fs.writeFileSync(
      path.join(workDir, 'meta.json'),
      JSON.stringify({ segments: total, outputPath }),
      'utf8',
    );
  } catch (_) { /* ignore */ }

  let success = false;
  try {
    const remaining = done.filter((d) => !d).length;
    const workers = Math.min(policy.concurrency, Math.max(1, remaining));
    if (remaining > 0) {
      await runParallelSegmentWorkers(workers, signal, async (jobSignal, failJob) => {
        while (true) {
          if (jobSignal.aborted) return;
          let i = -1;
          while (nextFetch < total) {
            const cand = nextFetch;
            nextFetch += 1;
            if (!done[cand]) {
              i = cand;
              break;
            }
          }
          if (i < 0) return;
          try {
            const buf = await fetchBufferWithRetry(fetchBuffer, segments[i], headers, policy, jobSignal);
            if (jobSignal.aborted) return;
            const tmp = `${partPaths[i]}.tmp`;
            await fs.promises.writeFile(tmp, buf);
            await fs.promises.rename(tmp, partPaths[i]);
            done[i] = true;
            tracker.addSegment(buf);
          } catch (err) {
            if (extractRawMessage(err) === 'cancelled' || jobSignal.aborted) return;
            failJob(new Error(formatDownloadError(err, {
              url: segments[i],
              segment: i,
              segmentTotal: total,
            })));
            return;
          }
        }
      });
    }
    if (signal?.aborted) throw new Error('cancelled');

    for (let i = 0; i < total; i++) {
      if (!done[i] || !fs.existsSync(partPaths[i])) {
        throw new Error(`Не хватает сегмента ${i + 1}/${total} для сборки`);
      }
    }

    const listPath = path.join(workDir, 'files.txt');
    const listBody = partPaths
      .map((p) => `file '${p.replace(/\\/g, '/').replace(/'/g, "'\\''")}'`)
      .join('\n');
    fs.writeFileSync(listPath, listBody, 'utf8');

    await runFfmpeg(ffmpegPath, [
      '-y', '-hide_banner', '-loglevel', 'error',
      ...ffmpegHwaccelArgs(),
      '-f', 'concat', '-safe', '0',
      '-i', listPath,
      '-c', 'copy',
      '-movflags', '+faststart',
      outputPath,
    ]);
    tracker.finish();
    success = true;
  } finally {
    if (success) {
      try {
        fs.rmSync(workDir, { recursive: true, force: true });
      } catch (_) {}
    }
  }
}

/**
 * Fallback без ffmpeg: параллельно в один .ts (запись по порядку).
 */
async function downloadSegmentsToTs(segments, outputPath, headers, fetchBuffer, onProgress, signal, policyOpts = {}) {
  const total = segments.length;
  const policy = hlsFetchPolicy(segments, policyOpts);
  const pending = new Map();
  let nextWrite = 0;
  let nextFetch = 0;
  const CONCURRENCY = Math.min(policy.concurrency, total);
  const ws = fs.createWriteStream(outputPath);
  const tracker = makeProgressTracker(total, onProgress);

  const flush = () => {
    while (pending.has(nextWrite)) {
      const buf = pending.get(nextWrite);
      pending.delete(nextWrite);
      ws.write(buf);
      tracker.addSegment(buf);
      nextWrite += 1;
    }
  };

  try {
    await runParallelSegmentWorkers(CONCURRENCY, signal, async (jobSignal, failJob) => {
      while (nextFetch < total) {
        if (jobSignal.aborted) return;
        const i = nextFetch;
        nextFetch += 1;
        try {
          const buf = await fetchBufferWithRetry(fetchBuffer, segments[i], headers, policy, jobSignal);
          if (jobSignal.aborted) return;
          pending.set(i, buf);
          flush();
        } catch (err) {
          if (extractRawMessage(err) === 'cancelled' || jobSignal.aborted) return;
          failJob(new Error(formatDownloadError(err, {
            url: segments[i],
            segment: i,
            segmentTotal: total,
          })));
          return;
        }
      }
    });
    flush();
    if (nextWrite !== total) {
      throw new Error('Не все сегменты загружены — возможно, CDN оборвал соединение');
    }
  } catch (err) {
    try { ws.destroy(); } catch (_) {}
    throw err;
  }

  ws.end();
  await new Promise((resolve, reject) => {
    ws.on('finish', resolve);
    ws.on('error', reject);
  });
  tracker.finish();
}

async function remuxTsToMp4(ffmpegPath, inputPath, outputPath) {
  if (!ffmpegPath) {
    fs.renameSync(inputPath, outputPath);
    return;
  }
  await runFfmpeg(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', inputPath,
    '-c', 'copy',
    '-movflags', '+faststart',
    outputPath,
  ]);
}

async function fastDownloadHls(opts) {
  const {
    segments,
    outputPath,
    headers = {},
    fetchBuffer,
    ffmpegPath = null,
    onProgress = null,
    signal = null,
    hlsMode = 'max',
    hlsConcurrency = null,
  } = opts;

  if (!Array.isArray(segments) || segments.length === 0) {
    throw new Error('В плейлисте нет сегментов для скачивания');
  }
  if (signal?.aborted) throw new Error('cancelled');

  const policyOpts = {
    mode: hlsMode,
    concurrency: typeof hlsConcurrency === 'number' ? hlsConcurrency : undefined,
  };

  // С ffmpeg — как Kodik: параллельно на диск, затем concat (быстрее при 64+ потоках).
  if (ffmpegPath) {
    await downloadSegmentsToFilesThenConcat(
      segments,
      outputPath,
      headers,
      fetchBuffer,
      ffmpegPath,
      onProgress,
      signal,
      policyOpts,
    );
    return { mode: 'parallel-concat' };
  }

  const tmpPath = `${outputPath}.ts.part`;
  try {
    await downloadSegmentsToTs(segments, tmpPath, headers, fetchBuffer, onProgress, signal, policyOpts);
    if (signal?.aborted) throw new Error('cancelled');
    await remuxTsToMp4(null, tmpPath, outputPath);
    return { mode: 'parallel-ts' };
  } finally {
    try { if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath); } catch (_) {}
  }
}

module.exports = {
  fastDownloadHls,
  hlsFetchPolicy,
  isRetryableFetchError,
  isConnectionResetError,
  fetchBufferWithRetry,
  runParallelSegmentWorkers,
  remuxTsToMp4,
  runFfmpeg,
};
