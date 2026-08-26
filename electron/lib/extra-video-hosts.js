'use strict';

const MAX_HOSTS = 150;

/** @type {Set<string>} */
const extra = new Set();

function normalizeHost(raw) {
  const h = String(raw || '').trim().replace(/^www\./, '').toLowerCase();
  if (!h || h.length > 253 || /[^a-z0-9.-]/.test(h)) return '';
  if (h === 'localhost' || h.endsWith('.localhost')) return '';
  if (/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)) return '';
  return h;
}

function hostsFromUrl(url) {
  let host = '';
  try { host = new URL(String(url || '')).hostname; } catch { return []; }
  const n = normalizeHost(host);
  if (!n) return [];
  const out = [n];
  const parts = n.split('.');
  if (parts.length >= 3) {
    const parent = parts.slice(-2).join('.');
    if (parent && parent !== n) out.push(parent);
  }
  return out;
}

function setExtraVideoHosts(list) {
  extra.clear();
  for (const item of Array.isArray(list) ? list : []) {
    const h = normalizeHost(item);
    if (h) extra.add(h);
    if (extra.size >= MAX_HOSTS) break;
  }
  return getExtraVideoHosts();
}

function addExtraVideoHosts(hosts) {
  let added = false;
  for (const item of Array.isArray(hosts) ? hosts : [hosts]) {
    const h = normalizeHost(item);
    if (!h || extra.has(h)) continue;
    extra.add(h);
    added = true;
    while (extra.size > MAX_HOSTS) {
      const first = extra.values().next().value;
      extra.delete(first);
    }
  }
  return added;
}

function getExtraVideoHosts() {
  return [...extra];
}

function hostIsExtraVideoHost(host) {
  const h = normalizeHost(host);
  if (!h) return false;
  if (extra.has(h)) return true;
  for (const saved of extra) {
    if (h === saved || h.endsWith('.' + saved)) return true;
  }
  return false;
}

function persistExtraVideoHosts() {
  try {
    const config = require('./config-store');
    config.saveConfig({ extraVideoHosts: getExtraVideoHosts() });
  } catch { /* ignore */ }
}

function loadExtraVideoHostsFromConfig() {
  try {
    const config = require('./config-store');
    const raw = config.getRawConfig() || {};
    if (Array.isArray(raw.extraVideoHosts)) setExtraVideoHosts(raw.extraVideoHosts);
  } catch { /* ignore */ }
}

module.exports = {
  hostsFromUrl,
  setExtraVideoHosts,
  addExtraVideoHosts,
  getExtraVideoHosts,
  hostIsExtraVideoHost,
  normalizeHost,
  persistExtraVideoHosts,
  loadExtraVideoHostsFromConfig,
};
