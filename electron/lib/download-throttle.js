'use strict';

/**
 * Общий лимит скорости загрузок (token bucket на все файлы и сегменты сразу).
 * 0 — без ограничений. Каждый читатель после получения чанка «платит» байтами
 * и ждёт, если ведро ушло в минус; так суммарная скорость держится у лимита.
 */

let limitBps = 0;
let tokens = 0;
let lastRefill = Date.now();

function setLimit(bytesPerSec) {
  const n = Number(bytesPerSec);
  limitBps = Number.isFinite(n) && n > 0 ? Math.round(n) : 0;
  tokens = 0;
  lastRefill = Date.now();
}

function getLimit() {
  return limitBps;
}

/** Списать байты; вернуть, сколько мс подождать перед чтением дальше. */
function reserve(bytes) {
  if (!limitBps || !(bytes > 0)) return 0;
  const now = Date.now();
  // Запас не больше секунды трафика, чтобы после простоя не было рывка выше лимита
  tokens = Math.min(limitBps, tokens + ((now - lastRefill) * limitBps) / 1000);
  lastRefill = now;
  tokens -= bytes;
  return tokens >= 0 ? 0 : Math.ceil((-tokens / limitBps) * 1000);
}

/** reserve + ожидание; прерывается сигналом отмены. */
function take(bytes, signal = null) {
  const ms = reserve(bytes);
  if (ms <= 0 || signal?.aborted) return Promise.resolve();
  return new Promise((resolve) => {
    const t = setTimeout(done, ms);
    function done() {
      clearTimeout(t);
      signal?.removeEventListener?.('abort', done);
      resolve();
    }
    signal?.addEventListener?.('abort', done, { once: true });
  });
}

/** Для Node-потоков с on('data'): притормозить поток на время ожидания. */
function throttleStream(stream, bytes) {
  const ms = reserve(bytes);
  if (ms <= 0) return;
  stream.pause();
  setTimeout(() => stream.resume(), ms);
}

module.exports = { setLimit, getLimit, reserve, take, throttleStream };
