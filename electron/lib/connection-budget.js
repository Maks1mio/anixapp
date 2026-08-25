'use strict';

/**
 * Общий бюджет параллельных HTTP-запросов (сегментов).
 * Без этого 15 файлов × 512 воркеров = CDN душит всё до ~10 KB/s.
 * Kodik-Download-Watch качает 1 файл, но все его сегменты сразу —
 * тот же эффект даёт бюджет на весь пул загрузок.
 */

class ConnectionBudget {
  /**
   * @param {number} limit
   */
  constructor(limit = 256) {
    this._limit = Math.max(1, limit);
    this._inUse = 0;
    /** @type {Array<() => void>} */
    this._waiters = [];
  }

  get limit() {
    return this._limit;
  }

  get inUse() {
    return this._inUse;
  }

  /**
   * @param {number} n
   */
  setLimit(n) {
    const next = Math.max(1, Math.round(Number(n)) || 1);
    this._limit = next;
    this._drain();
  }

  /**
   * @returns {Promise<() => void>} release fn
   */
  async acquire() {
    if (this._inUse < this._limit) {
      this._inUse += 1;
      return () => this.release();
    }
    await new Promise((resolve) => {
      this._waiters.push(resolve);
    });
    this._inUse += 1;
    return () => this.release();
  }

  release() {
    this._inUse = Math.max(0, this._inUse - 1);
    this._drain();
  }

  _drain() {
    while (this._inUse < this._limit && this._waiters.length > 0) {
      const next = this._waiters.shift();
      if (next) next();
    }
  }
}

/** Один глобальный бюджет на процесс Electron. */
const globalSegmentBudget = new ConnectionBudget(256);

/**
 * Сколько сокетов реально выделять под сегменты.
 * max/Infinity → до 512 (как «все сегменты» без шторма при многих файлах).
 * custom N → min(N, 10000), но не ниже 16.
 */
function resolveBudgetLimit(concurrencySetting) {
  if (!Number.isFinite(concurrencySetting) || concurrencySetting <= 0) {
    return 512;
  }
  return Math.min(10000, Math.max(16, Math.round(concurrencySetting)));
}

module.exports = {
  ConnectionBudget,
  globalSegmentBudget,
  resolveBudgetLimit,
};
