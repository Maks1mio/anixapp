'use strict';

/**
 * Logging system removed — no-op stub so existing call sites keep working
 * without writing files or collecting diagnostic archives.
 */

function noop() {}

const logger = {
  init: noop,
  patchConsole: noop,
  debug: noop,
  info: noop,
  warn: noop,
  error: noop,
  ipc: noop,
  update: noop,
  renderer: noop,
  getSessions: () => [],
  getSessionLog: () => [],
  collectZip: () => Buffer.alloc(0),
  getSystemInfo: () => ({}),
  getCurrentSessionDir: () => null,
  getLogsRootDir: () => null,
  getLobbyLogPath: () => null,
  writeLobbyPlain: noop,
};

module.exports = logger;
