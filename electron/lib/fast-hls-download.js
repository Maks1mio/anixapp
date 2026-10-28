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

/**
 * Общий на процесс лимит памяти под HLS-сегменты: байты держатся от начала загрузки
 * сегмента до записи на диск. Без него 512 параллельных сегментов × несколько файлов
 * в режиме «всё сразу» съедают гигабайты и подвешивают приложение.
 */
const SEGMENT_MEMORY_LIMIT = 384 * 1024 * 1024;
const SEGMENT_SIZE_ESTIMATE = 2 * 1024 * 1024;

class SegmentMemoryGate {
  constructor(limitBytes = SEGMENT_MEMORY_LIMIT) {
    this.limit = limitBytes;
    this.used = 0;
    // Размер сегмента заранее неизвестен — резервируем среднее по уже скачанным.
    this.estimate = SEGMENT_SIZE_ESTIMATE;
    /** @type {Array<(bytes: number) => void>} */
    this._waiters = [];
  }

  _fits() {
    return this.used === 0 || this.used + this.estimate <= this.limit;
  }

  _handle(bytes) {
    let held = bytes;
    let released = false;
    return {
      resize: (actual) => {
        if (released) return;
        const n = Math.max(0, Number(actual) || 0);
        this.used += n - held;
        held = n;
        if (n > 0) this.estimate = Math.round(this.estimate * 0.8 + n * 0.2);
        this._drain();
      },
      release: () => {
        if (released) return;
        released = true;
        this.used -= held;
        this._drain();
      },
    };
  }

  /** @returns {Promise<{ resize: (bytes: number) => void, release: () => void }>} */
  async reserve(signal = null) {
    if (signal?.aborted) throw new Error('cancelled');
    if (!this._waiters.length && this._fits()) {
      this.used += this.estimate;
      return this._handle(this.estimate);
    }
    const bytes = await new Promise((resolve, reject) => {
      const waiter = (granted) => {
        signal?.removeEventListener('abort', onAbort);
        resolve(granted);
      };
      const onAbort = () => {
        const i = this._waiters.indexOf(waiter);
        if (i >= 0) this._waiters.splice(i, 1);
        reject(new Error('cancelled'));
      };
      this._waiters.push(waiter);
      signal?.addEventListener('abort', onAbort, { once: true });
    });
    return this._handle(bytes);
  }

  _drain() {
    while (this._waiters.length && this._fits()) {
      const next = this._waiters.shift();
      this.used += this.estimate;
      next(this.estimate);
    }
  }
}

const segmentMemory = new SegmentMemoryGate();

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
          let mem = null;
          try {
            mem = await segmentMemory.reserve(jobSignal);
            const buf = await fetchBufferWithRetry(fetchBuffer, segments[i], headers, policy, jobSignal);
            mem.resize(buf?.length || 0);
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
          } finally {
            mem?.release();
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

    // Склейка побайтово (TS для этого и сделан) с исходными таймстемпами, затем remux в MP4.
    // concat-демуксер ffmpeg пересчитывает время каждого сегмента по длительности — у аудио
    // и видео она чуть разная, и к концу серии звук уезжает от картинки.
    const joinedPath = path.join(workDir, 'joined.ts');
    await concatFilesBinary(partPaths, joinedPath, signal);
    await remuxTsToMp4(ffmpegPath, joinedPath, outputPath);
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

/** Последовательно дописать файлы в один (без загрузки всего в память). */
async function concatFilesBinary(paths, outPath, signal = null) {
  const ws = fs.createWriteStream(outPath);
  try {
    for (const p of paths) {
      if (signal?.aborted) throw new Error('cancelled');
      await new Promise((resolve, reject) => {
        const rs = fs.createReadStream(p);
        rs.on('error', reject);
        rs.on('end', resolve);
        rs.pipe(ws, { end: false });
      });
    }
  } catch (err) {
    try { ws.destroy(); } catch (_) {}
    throw err;
  }
  await new Promise((resolve, reject) => {
    ws.on('error', reject);
    ws.end(resolve);
  });
}

async function remuxTsToMp4(ffmpegPath, inputPath, outputPath) {
  if (!ffmpegPath) {
    fs.renameSync(inputPath, outputPath);
    return;
  }
  await runFfmpeg(ffmpegPath, [
    '-y', '-hide_banner', '-loglevel', 'error',
    '-i', inputPath,
    '-map', '0:v?', '-map', '0:a?',
    '-c', 'copy',
    // AAC из TS идёт в ADTS — в MP4 нужен ASC, иначе часть плееров даёт сдвиг/треск
    '-bsf:a', 'aac_adtstoasc',
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

  // Как Kodik: параллельно на диск, затем склейка. Без ffmpeg склеенный .ts просто
  // переименовывается — сегменты всё равно не копятся в памяти в ожидании своей очереди.
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
  return { mode: ffmpegPath ? 'parallel-concat' : 'parallel-ts' };
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
  SegmentMemoryGate,
};
