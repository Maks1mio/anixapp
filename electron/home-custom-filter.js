/**
 * Локальное хранение «Моей вкладки» (как CustomFilter + tab name в Android).
 * Ключ — profileId. Список релизов грузится через POST /filter/{page}.
 */

const fs = require('fs');
const path = require('path');

const STORE_FILE = 'home-custom-filters.json';

function storePath(userData) {
  return path.join(userData, STORE_FILE);
}

function readStore(userData) {
  const file = storePath(userData);
  if (!fs.existsSync(file)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8'));
    return raw && typeof raw === 'object' ? raw : {};
  } catch {
    return {};
  }
}

function writeStore(userData, data) {
  fs.writeFileSync(storePath(userData), JSON.stringify(data, null, 2), 'utf8');
}

function getEntry(userData, profileId) {
  if (!profileId) return null;
  const store = readStore(userData);
  const entry = store[String(profileId)];
  if (!entry || typeof entry !== 'object') return null;
  return entry;
}

function setEntry(userData, profileId, entry) {
  if (!profileId) return;
  const store = readStore(userData);
  store[String(profileId)] = entry;
  writeStore(userData, store);
}

function clearEntry(userData, profileId) {
  if (!profileId) return;
  const store = readStore(userData);
  delete store[String(profileId)];
  writeStore(userData, store);
}

module.exports = { getEntry, setEntry, clearEntry };
