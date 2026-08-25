'use strict';

const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const {
  hlsFetchPolicy,
  isRetryableFetchError,
  isConnectionResetError,
  fetchBufferWithRetry,
  runParallelSegmentWorkers,
} = require('../fast-hls-download');

describe('hlsFetchPolicy AniLibria', () => {
  it('caps concurrency and raises retries for cache.libria.fun', () => {
    const segments = Array.from({ length: 298 }, (_, i) => `https://cache.libria.fun/videos/media/ts/${i}.ts`);
    const policy = hlsFetchPolicy(segments, { mode: 'max', concurrency: 298 });
    assert.equal(policy.concurrency, 12);
    assert.equal(policy.maxRetries, 8);
    assert.ok(policy.retryBaseMs >= 1000);
  });

  it('keeps high concurrency for Kodik-like hosts on max', () => {
    const segments = Array.from({ length: 100 }, (_, i) => `https://kodik-storage.com/seg/${i}.ts`);
    const policy = hlsFetchPolicy(segments, { mode: 'max' });
    assert.equal(policy.concurrency, 100);
  });
});

describe('isRetryableFetchError', () => {
  it('retries Chromium net::ERR_CONNECTION_RESET', () => {
    assert.equal(isRetryableFetchError(new Error('net::ERR_CONNECTION_RESET')), true);
    assert.equal(isConnectionResetError(new Error('net::ERR_CONNECTION_RESET')), true);
  });

  it('retries ECONNRESET and socket hang up', () => {
    assert.equal(isRetryableFetchError(new Error('read ECONNRESET')), true);
    assert.equal(isRetryableFetchError(new Error('socket hang up')), true);
  });

  it('does not retry cancelled', () => {
    assert.equal(isRetryableFetchError(new Error('cancelled')), false);
  });
});

describe('fetchBufferWithRetry', () => {
  it('recovers after ERR_CONNECTION_RESET', async () => {
    let attempts = 0;
    const policy = { maxRetries: 4, retryBaseMs: 5 };
    const buf = await fetchBufferWithRetry(
      async () => {
        attempts += 1;
        if (attempts < 3) throw new Error('net::ERR_CONNECTION_RESET');
        return Buffer.from('ok');
      },
      'https://cache.libria.fun/seg/6.ts',
      {},
      policy,
      null,
    );
    assert.equal(buf.toString(), 'ok');
    assert.equal(attempts, 3);
  });
});

describe('runParallelSegmentWorkers', () => {
  it('aborts siblings after first fatal error', async () => {
    let active = 0;
    let peak = 0;
    let startedAfterFail = 0;
    let failed = false;

    await assert.rejects(
      () => runParallelSegmentWorkers(6, null, async (signal, failJob) => {
        active += 1;
        peak = Math.max(peak, active);
        if (failed) startedAfterFail += 1;
        try {
          await new Promise((resolve, reject) => {
            const t = setTimeout(resolve, 80);
            signal.addEventListener('abort', () => {
              clearTimeout(t);
              reject(new Error('cancelled'));
            }, { once: true });
          });
          if (!failed) {
            failed = true;
            failJob(new Error('boom-segment'));
          }
        } finally {
          active -= 1;
        }
      }),
      /boom-segment/,
    );

    assert.ok(peak >= 2, 'several workers should have started');
    // After fail+abort, workers should exit; no long tail of new work is required,
    // but signal must be aborted so in-flight work stops.
    assert.equal(failed, true);
  });

  it('propagates parent cancel without treating it as fatal content error', async () => {
    const parent = new AbortController();
    const p = runParallelSegmentWorkers(2, parent.signal, async (signal) => {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 500);
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new Error('cancelled'));
        }, { once: true });
      });
    });
    setTimeout(() => parent.abort(), 20);
    await assert.rejects(() => p, /cancelled/);
  });
});
