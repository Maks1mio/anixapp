'use strict';

const { Anixart } = require('anixapi');
const { attachLegacyEndpoints } = require('../anix-legacy-endpoints');
const state = require('../lib/app-state');
const config = require('../lib/config-store');

function createAnixClient(options) {
  return attachLegacyEndpoints(new Anixart(options));
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
}

module.exports = { createAnixClient, getAnixart, resetAnixart };
