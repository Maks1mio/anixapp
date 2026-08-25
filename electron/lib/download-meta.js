'use strict';

const fs = require('fs');
const path = require('path');

function metaPath(rootDir) {
  return path.join(rootDir, '.anixapp-library.json');
}

function readMeta(rootDir) {
  const fp = metaPath(rootDir);
  try {
    if (!fs.existsSync(fp)) return { folders: {} };
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    return raw && typeof raw === 'object' && raw.folders ? raw : { folders: {} };
  } catch {
    return { folders: {} };
  }
}

function writeMeta(rootDir, data) {
  try {
    fs.writeFileSync(metaPath(rootDir), JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.warn('writeMeta:', e?.message || e);
  }
}

function normalizeFolderKey(folderName) {
  return String(folderName || '')
    .replace(/\\/g, '/')
    .replace(/\/+/g, '/')
    .replace(/^\/|\/$/g, '');
}

function saveFolderMeta(rootDir, folderName, meta) {
  const key = normalizeFolderKey(folderName);
  if (!key || !meta?.releaseId) return;
  const data = readMeta(rootDir);
  data.folders[key] = {
    releaseId: meta.releaseId,
    releaseTitle: meta.releaseTitle || key.split('/').pop() || key,
    dubberId: meta.dubberId ?? null,
    sourceId: meta.sourceId ?? null,
    dubberName: meta.dubberName || '',
    sourceName: meta.sourceName || '',
    updatedAt: Date.now(),
  };
  writeMeta(rootDir, data);
}

function getFolderMeta(rootDir, folderName) {
  const data = readMeta(rootDir);
  const key = normalizeFolderKey(folderName);
  return data.folders[key] || data.folders[folderName] || null;
}

function parseEpisodeFromFilename(name) {
  const base = String(name || '');
  const m = base.match(/(?:^|[ _-])(\d{2})\.(?:mp4|mkv|webm|m4v)$/i)
    || base.match(/^(\d{1,3})\.(?:mp4|mkv|webm|m4v)$/i);
  return m ? parseInt(m[1], 10) : null;
}

module.exports = {
  readMeta,
  saveFolderMeta,
  getFolderMeta,
  parseEpisodeFromFilename,
};
