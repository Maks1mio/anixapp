'use strict';

const { Anixart } = require('anixapi');
const { attachLegacyEndpoints } = require('../anix-legacy-endpoints');
const { attachBackupProxyFailover, clearSticky } = require('../lib/backup-proxy');
const { attachAnixErrorMessages } = require('../lib/anix-errors');
const { ANIXART_UA } = require('../lib/constants');
const state = require('../lib/app-state');
const config = require('../lib/config-store');

function createAnixClient(options = {}) {
  const { backupFailover = true, ...anixOptions } = options;
  if (!anixOptions.userAgent) anixOptions.userAgent = ANIXART_UA;
  let client = attachLegacyEndpoints(new Anixart(anixOptions));
  if (backupFailover !== false) {
    client = attachBackupProxyFailover(client);
  }
  return attachAnixErrorMessages(client);
}

function getAnixart() {
  if (!state.anixart) {
    const { token, baseUrl } = config.loadConfig();
    state.anixart = createAnixClient({ baseUrl, token: token || undefined });
  }
  return state.anixart;
}

function resetAnixart() {
  state.anixart = null;
  clearSticky();
}

module.exports = { createAnixClient, getAnixart, resetAnixart };
