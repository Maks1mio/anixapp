'use strict';

const { ipcMain } = require('electron');

function createIpcHelpers({ isDev, logger, state }) {
  function handleAnixError(err, context) {
    const msg = err && err.message ? String(err.message) : String(err);
    const isNetwork =
      msg.includes('fetch failed') ||
      msg.includes('ENOTFOUND') ||
      msg.includes('ECONNREFUSED') ||
      msg.includes('ECONNRESET') ||
      msg.includes('ETIMEDOUT');

    logger.error('api', `${context}: ${msg}`, {
      context,
      network: isNetwork,
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
        const msg = err && err.message ? String(err.message) : String(err);
        logger.error('ipc', `${channel} failed: ${msg}`, {
          ms: isDev ? Date.now() - t0 : undefined,
          stack: err && err.stack ? String(err.stack).slice(0, 400) : undefined,
        });
        throw err;
      }
    });
  }

  return { handleAnixError, loggedHandle };
}

module.exports = { createIpcHelpers };
