'use strict';

/**
 * Миграция библиотеки:
 * Anixapp / Title / Dub / Source / «Title 01.mp4»
 */

const fs = require('fs');
const path = require('path');
const { getFolderMeta, parseEpisodeFromFilename } = require('./download-meta');

const VIDEO_EXT = new Set(['.mp4', '.mkv', '.webm', '.avi', '.mov', '.m4v']);

function sanitize(name) {
  return String(name || 'downloads')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 120) || 'downloads';
}

function isTempName(name) {
  const n = String(name || '');
  if (/\.(part|tmp|temp|download|anixdl|anixskip)$/i.test(n)) return true;
  if (/\.hls-parts$/i.test(n) || /\.range-parts$/i.test(n)) return true;
  if (n.startsWith('.')) return true;
  return false;
}

function buildTargetName(title, ep) {
  const epNum = String(Math.max(0, Number(ep) || 0)).padStart(2, '0');
  return `${sanitize(title)} ${epNum}.mp4`;
}

function uniquePath(dir, filename) {
  const parsed = path.parse(filename);
  let candidate = path.join(dir, filename);
  if (!fs.existsSync(candidate)) return candidate;
  for (let i = 2; i <= 50; i++) {
    candidate = path.join(dir, `${parsed.name} (${i})${parsed.ext || '.mp4'}`);
    if (!fs.existsSync(candidate)) return candidate;
  }
  return path.join(dir, `${parsed.name}-${Date.now()}${parsed.ext || '.mp4'}`);
}

function moveWithSidecars(from, to) {
  if (path.resolve(from) === path.resolve(to)) return to;
  fs.mkdirSync(path.dirname(to), { recursive: true });
  const finalTo = fs.existsSync(to) ? uniquePath(path.dirname(to), path.basename(to)) : to;
  fs.renameSync(from, finalTo);
  for (const suf of ['.anixskip', '.anixdl']) {
    const src = from + suf;
    if (fs.existsSync(src)) {
      try { fs.renameSync(src, finalTo + suf); } catch { /* ignore */ }
    }
  }
  return finalTo;
}

function removeEmptyDirs(dir, stopAt) {
  let cur = dir;
  const root = path.resolve(stopAt);
  while (cur && path.resolve(cur).startsWith(root) && path.resolve(cur) !== root) {
    let entries;
    try {
      entries = fs.readdirSync(cur);
    } catch {
      break;
    }
    if (entries.length > 0) break;
    try { fs.rmdirSync(cur); } catch { break; }
    cur = path.dirname(cur);
  }
}

function parseDubSourceFromFilename(basename, title) {
  let rest = String(basename || '').replace(/\.[^.]+$/, '');
  rest = rest.replace(/[ _-]*\d{1,3}$/, '').trim();
  const t = String(title || '').trim();
  if (t && rest.toLowerCase().startsWith(t.toLowerCase())) {
    rest = rest.slice(t.length).trim();
  }
  const tokens = rest.split(/\s+/).filter(Boolean);
  if (tokens.length >= 2) {
    return {
      dubberName: tokens.slice(0, -1).join(' '),
      sourceName: tokens[tokens.length - 1],
    };
  }
  if (tokens.length === 1) {
    return { dubberName: tokens[0], sourceName: 'Источник' };
  }
  return { dubberName: 'Озвучка', sourceName: 'Источник' };
}

/**
 * @param {string} rootDir
 * @param {Set<string>} [skipPaths] абсолютные пути активных загрузок
 * @returns {{ moved: number }}
 */
function migrateLibraryLayout(rootDir, skipPaths = new Set()) {
  if (!rootDir || !fs.existsSync(rootDir)) return { moved: 0 };
  let moved = 0;
  const skip = new Set([...skipPaths].map((p) => path.resolve(p)));

  /** @type {Array<{ from: string, title: string, dub: string, source: string, ep: number|null }>} */
  const plan = [];

  const walk = (dir, relParts) => {
    let entries;
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const ent of entries) {
      if (isTempName(ent.name)) continue;
      const full = path.join(dir, ent.name);
      if (ent.isDirectory()) {
        if (relParts.length >= 6) continue;
        walk(full, [...relParts, ent.name]);
        continue;
      }
      const ext = path.extname(ent.name).toLowerCase();
      if (!VIDEO_EXT.has(ext)) continue;
      if (skip.has(path.resolve(full))) continue;
      try {
        const st = fs.statSync(full);
        if (!st.isFile() || st.size < 256 * 1024) continue;
      } catch {
        continue;
      }

      const parts = relParts.filter(Boolean);
      const title = sanitize(parts[0] || path.basename(ent.name, ext));
      const titleMeta = getFolderMeta(rootDir, title);
      let dub = parts[1] || '';
      let source = parts[2] || '';
      if (!dub || !source) {
        const nestedKey = parts.length >= 3 ? parts.slice(0, 3).join('/') : '';
        const nestedMeta = nestedKey ? getFolderMeta(rootDir, nestedKey) : null;
        dub = dub || nestedMeta?.dubberName || titleMeta?.dubberName || '';
        source = source || nestedMeta?.sourceName || titleMeta?.sourceName || '';
      }
      if (!dub || !source) {
        const parsed = parseDubSourceFromFilename(ent.name, title);
        dub = dub || parsed.dubberName;
        source = source || parsed.sourceName;
      }
      dub = sanitize(dub || 'Озвучка');
      source = sanitize(source || 'Источник');
      const ep = parseEpisodeFromFilename(ent.name);
      plan.push({ from: full, title, dub, source, ep });
    }
  };

  walk(rootDir, []);

  for (const item of plan) {
    const targetDir = path.join(rootDir, item.title, item.dub, item.source);
    const targetName = buildTargetName(item.title, item.ep);
    const desired = path.join(targetDir, targetName);
    if (path.resolve(item.from) === path.resolve(desired)) continue;

    // Уже правильная папка, только имя — или полный перенос
    try {
      const dest = moveWithSidecars(item.from, desired);
      if (path.resolve(dest) !== path.resolve(item.from)) {
        moved += 1;
        removeEmptyDirs(path.dirname(item.from), rootDir);
      }
    } catch (e) {
      console.warn('migrateLibraryLayout:', e?.message || e);
    }
  }

  return { moved };
}

module.exports = {
  migrateLibraryLayout,
  buildTargetName,
  sanitize,
};
