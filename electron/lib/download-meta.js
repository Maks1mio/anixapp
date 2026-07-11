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

function saveFolderMeta(rootDir, folderName, meta) {
  if (!folderName || !meta?.releaseId) return;
  const data = readMeta(rootDir);
  data.folders[folderName] = {
    releaseId: meta.releaseId,
    releaseTitle: meta.releaseTitle || folderName,
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
  return data.folders[folderName] || null;
}

function parseEpisodeFromFilename(name) {
  const m = name.match(/ (\d{2})\.mp4$/i);
  return m ? parseInt(m[1], 10) : null;
}

module.exports = {
  readMeta,
  saveFolderMeta,
  getFolderMeta,
  parseEpisodeFromFilename,
};
