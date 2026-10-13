'use strict';

const { ipcMain } = require('electron');
const { fetchCdnJson, fetchRemoteImage, isAnixartCdnUrl } = require('../cdn-proxy');

function unwrapTarget(url) {
  if (!url || typeof url !== 'string') return '';
  const trimmed = url.trim();
  if (!trimmed) return '';
  if (trimmed.startsWith('anix-cdn://')) {
    try {
      return new URL(trimmed).searchParams.get('u') || '';
    } catch {
      return '';
    }
  }
  if (trimmed.startsWith('/__cdn/?') || trimmed.startsWith('/__cdn?')) {
    try {
      return new URL(trimmed, 'http://localhost').searchParams.get('u') || '';
    } catch {
      return '';
    }
  }
  return trimmed;
}

function register() {
  ipcMain.handle('cdn:fetchJson', async (_, url) => {
    try {
      const target = unwrapTarget(url);
      if (!target || !isAnixartCdnUrl(target)) return null;
      return await fetchCdnJson(target);
    } catch {
      return null;
    }
  });

  ipcMain.handle('cdn:fetchImage', async (_, url) => {
    try {
      const target = unwrapTarget(url);
      if (!target) return null;
      return await fetchRemoteImage(target);
    } catch {
      return null;
    }
  });
}

module.exports = { register };
