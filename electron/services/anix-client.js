'use strict';

const { Anixart } = require('anixapi');
const { attachLegacyEndpoints } = require('../anix-legacy-endpoints');
const { attachBackupProxyFailover, clearSticky } = require('../lib/backup-proxy');
const state = require('../lib/app-state');
const config = require('../lib/config-store');

function createAnixClient(options = {}) {
  const { backupFailover = true, ...anixOptions } = options;
  const client = attachLegacyEndpoints(new Anixart(anixOptions));
  if (backupFailover === false) return client;
  return attachBackupProxyFailover(client);
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
