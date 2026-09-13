'use strict';

const { ipcMain } = require('electron');
const { HttpError } = require('anixapi');
const { formatAnixError, enrichAnixError, anixErrorLogMeta } = require('./anix-errors');

function createIpcHelpers({ isDev, logger, state }) {
  function handleAnixError(err, context) {
    enrichAnixError(err);
    const msg = formatAnixError(err);
    const isHttp = (typeof HttpError === 'function' && err instanceof HttpError) || err?.name === 'HttpError';
    const isNetwork =
      (isHttp && (err.status === 0 || /Нет связи|network error|fetch failed/i.test(msg)))
      || msg.includes('fetch failed')
      || msg.includes('ENOTFOUND')
      || msg.includes('ECONNREFUSED')
      || msg.includes('ECONNRESET')
      || msg.includes('ETIMEDOUT')
      || /Нет связи с сервером/.test(msg);

    logger.error('api', `${context}: ${msg}`, {
      context,
      network: isNetwork,
      ...anixErrorLogMeta(err),
      stack: err && err.stack ? String(err.stack).slice(0, 600) : undefined,
    });

    if (isNetwork && state.mainWindow && !state.mainWindow.isDestroyed()) {
      try {
        state.mainWindow.webContents.send('anix:offline', { context, message: msg });
      } catch (_) {}
    }
    throw err;
  }

  function loggedHandle(channel, fn) {
    return ipcMain.handle(channel, async (event, ...args) => {
      const t0 = isDev ? Date.now() : 0;
      if (isDev) {
        const safeArgs = args.map((a, i) => {
          if (channel === 'anix:login' && i === 1) return '[PASSWORD]';
          if (typeof a === 'string' && a.length > 120) return a.slice(0, 120) + '…';
          return a;
        });
        logger.ipc(channel, '→', safeArgs.length ? { args: safeArgs } : undefined);
      }
      try {
        const result = await fn(event, ...args);
        if (isDev) logger.ipc(channel, '←', { ms: Date.now() - t0 });
        return result;
      } catch (err) {
        enrichAnixError(err);
        const msg = formatAnixError(err);
        logger.error('ipc', `${channel} failed: ${msg}`, {
          ms: isDev ? Date.now() - t0 : undefined,
          ...anixErrorLogMeta(err),
          stack: err && err.stack ? String(err.stack).slice(0, 400) : undefined,
        });
        throw err;
      }
    });
  }

  return { handleAnixError, loggedHandle };
}

module.exports = { createIpcHelpers };
