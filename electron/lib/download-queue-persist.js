'use strict';

/**
 * Персистентность очереди загрузок + sidecar рядом с файлом.
 * После рестарта приложения можно продолжить с .range-parts / .hls-parts.
 */

const fs = require('fs');
const path = require('path');
const { app } = require('electron');
const { getFolderMeta, parseEpisodeFromFilename } = require('./download-meta');

const QUEUE_VERSION = 1;

function getQueueStatePath() {
  return path.join(app.getPath('userData'), 'download-queue.json');
}

function sidecarPath(filePath) {
  return `${filePath}.anixdl`;
}

function jobToPersistable(job) {
  if (!job || !job.url || !job.filePath) return null;
  // Пауза пользователя сохраняем; пауза из‑за стрима — как queued (плеер после рестарта закрыт)
  const status = job.status === 'paused' && !job.pausedByStreaming
    ? 'paused'
    : 'queued';
  return {
    id: job.id,
    url: job.url,
    filePath: job.filePath,
    filename: job.filename,
    headers: job.headers && typeof job.headers === 'object' ? job.headers : {},
    folder: job.folder || '',
    releaseId: job.releaseId,
    sourceId: job.sourceId,
    dubberId: job.dubberId,
    episodePosition: job.episodePosition,
    releaseTitle: job.releaseTitle,
    dubberName: job.dubberName,
    sourceName: job.sourceName,
    received: job.received || 0,
    total: job.total || 0,
    status,
    savedAt: Date.now(),
  };
}

function writeSidecar(job) {
  const data = jobToPersistable(job);
  if (!data) return;
  try {
    fs.writeFileSync(sidecarPath(job.filePath), JSON.stringify(data), 'utf8');
  } catch (_) { /* ignore */ }
}

function removeSidecar(filePath) {
  try {
    const p = sidecarPath(filePath);
    if (fs.existsSync(p)) fs.unlinkSync(p);
  } catch (_) { /* ignore */ }
}

function readSidecar(filePath) {
  try {
    const p = sidecarPath(filePath);
    if (!fs.existsSync(p)) return null;
    const raw = JSON.parse(fs.readFileSync(p, 'utf8'));
    // url может быть пустым у orphan — всё равно восстанавливаем по filePath
    if (!raw?.filePath) return null;
    return raw;
  } catch {
    return null;
  }
}

function saveQueueState(jobs) {
  const list = (Array.isArray(jobs) ? jobs : [])
    .map(jobToPersistable)
    .filter(Boolean)
    .filter((j) => {
      const st = String(j.status || '');
      // status may be stripped — caller passes only active-ish jobs
      return true;
    });
  try {
    fs.writeFileSync(
      getQueueStatePath(),
      JSON.stringify({ version: QUEUE_VERSION, jobs: list, savedAt: Date.now() }, null, 2),
      'utf8',
    );
  } catch (e) {
    console.warn('saveQueueState:', e?.message || e);
  }
}

function loadQueueState() {
  try {
    const fp = getQueueStatePath();
    if (!fs.existsSync(fp)) return [];
    const raw = JSON.parse(fs.readFileSync(fp, 'utf8'));
    if (!raw || !Array.isArray(raw.jobs)) return [];
    return raw.jobs.filter((j) => j && typeof j.url === 'string' && typeof j.filePath === 'string');
  } catch {
    return [];
  }
}

function clearQueueState() {
  try {
    const fp = getQueueStatePath();
    if (fs.existsSync(fp)) fs.unlinkSync(fp);
  } catch (_) { /* ignore */ }
}

function hasIncompleteParts(filePath) {
  if (!filePath) return false;
  try {
    if (fs.existsSync(`${filePath}.range-parts`)) return true;
    if (fs.existsSync(`${filePath}.hls-parts`)) return true;
    if (fs.existsSync(`${filePath}.ts.part`)) return true;
    if (fs.existsSync(`${filePath}.part`)) return true;
    if (fs.existsSync(sidecarPath(filePath))) return true;
  } catch (_) { /* ignore */ }
  return false;
}

function isCompleteVideo(filePath, minBytes = 1024) {
  try {
    if (!fs.existsSync(filePath)) return false;
    if (hasIncompleteParts(filePath)) return false;
    return fs.statSync(filePath).size >= minBytes;
  } catch {
    return false;
  }
}

/**
 * Сканирует каталог загрузок на sidecar / части без записи в queue state.
 */
function scanOrphanDownloads(rootDir) {
  const found = [];
  if (!rootDir || !fs.existsSync(rootDir)) return found;

  const walk = (dir, depth) => {
    if (depth > 3) return;
    let entries;
    try { entries = fs.readdirSync(dir, { withFileTypes: true }); } catch { return; }
    for (const ent of entries) {
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (/\.(range-parts|hls-parts)$/i.test(ent.name)) {
          const base = full.replace(/\.(range-parts|hls-parts)$/i, '');
          const sc = readSidecar(base);
          if (sc) {
            found.push(sc);
          } else {
            const relFolder = path.relative(rootDir, path.dirname(base)).replace(/\\/g, '/');
            const folderKey = relFolder && relFolder !== '.' ? relFolder.split('/')[0] : '';
            const meta = (relFolder && relFolder !== '.' ? getFolderMeta(rootDir, relFolder) : null)
              || (folderKey ? getFolderMeta(rootDir, folderKey) : null);
            const ep = parseEpisodeFromFilename(path.basename(base));
            const parts = relFolder && relFolder !== '.' ? relFolder.split('/') : [];
            found.push({
              id: `orphan-${Buffer.from(base).toString('base64url').slice(0, 24)}`,
              url: '',
              filePath: base,
              filename: path.basename(base),
              headers: {},
              folder: relFolder === '.' ? '' : relFolder,
              releaseId: meta?.releaseId,
              sourceId: meta?.sourceId,
              dubberId: meta?.dubberId,
              episodePosition: ep,
              releaseTitle: meta?.releaseTitle,
              dubberName: meta?.dubberName || parts[1] || '',
              sourceName: meta?.sourceName || parts[2] || '',
              needsUrlRefresh: true,
            });
          }
          continue;
        }
        walk(full, depth + 1);
        continue;
      }
      if (ent.isFile() && ent.name.endsWith('.anixdl')) {
        const base = full.slice(0, -'.anixdl'.length);
        const sc = readSidecar(base);
        if (sc && !isCompleteVideo(base)) found.push(sc);
      }
    }
  };

  walk(rootDir, 0);
  return found;
}

function mergePersistedJobs(rootDir) {
  const fromState = loadQueueState();
  const fromDisk = scanOrphanDownloads(rootDir);
  const byPath = new Map();
  for (const j of [...fromState, ...fromDisk]) {
    if (!j?.filePath) continue;
    if (isCompleteVideo(j.filePath)) {
      removeSidecar(j.filePath);
      continue;
    }
    const key = path.resolve(j.filePath);
    const prev = byPath.get(key);
    if (!prev || (j.url && !prev.url)) byPath.set(key, j);
  }
  return [...byPath.values()];
}

function estimateProgressFromParts(filePath) {
  if (!filePath) return null;
  try {
    const rangeDir = `${filePath}.range-parts`;
    if (fs.existsSync(rangeDir)) {
      let received = 0;
      let total = 0;
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(rangeDir, 'meta.json'), 'utf8'));
        total = Number(meta.size) || 0;
      } catch (_) { /* ignore */ }
      for (const name of fs.readdirSync(rangeDir)) {
        if (!/\.bin$/i.test(name)) continue;
        try { received += fs.statSync(path.join(rangeDir, name)).size; } catch (_) {}
      }
      if (received > 0) return { received, total: total || received };
    }

    const hlsDir = `${filePath}.hls-parts`;
    if (fs.existsSync(hlsDir)) {
      let received = 0;
      let segmentsDone = 0;
      let segmentsTotal = 0;
      try {
        const meta = JSON.parse(fs.readFileSync(path.join(hlsDir, 'meta.json'), 'utf8'));
        segmentsTotal = Number(meta.segments) || 0;
      } catch (_) { /* ignore */ }
      for (const name of fs.readdirSync(hlsDir)) {
        if (!/\.ts$/i.test(name)) continue;
        try {
          const sz = fs.statSync(path.join(hlsDir, name)).size;
          if (sz > 256) {
            received += sz;
            segmentsDone += 1;
          }
        } catch (_) {}
      }
      if (received > 0) {
        const total = segmentsTotal > 0 && segmentsDone > 0
          ? Math.round(received * (segmentsTotal / segmentsDone))
          : received;
        return { received, total };
      }
    }
  } catch (_) { /* ignore */ }
  return null;
}

module.exports = {
  getQueueStatePath,
  sidecarPath,
  jobToPersistable,
  writeSidecar,
  removeSidecar,
  readSidecar,
  saveQueueState,
  loadQueueState,
  clearQueueState,
  hasIncompleteParts,
  isCompleteVideo,
  scanOrphanDownloads,
  mergePersistedJobs,
  estimateProgressFromParts,
};
