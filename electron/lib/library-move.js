'use strict';

/**
 * Папки библиотеки загрузок: размер, место на диске, перенос всего скачанного в другую папку
 * (в том числе на другой диск — там rename не работает, поэтому копия + удаление по файлам).
 */

const fs = require('fs');
const path = require('path');
const { isPathInside } = require('./safe-path');

const LIBRARY_META = '.anixapp-library.json';

/** Все файлы под dir (без симлинков): [{ abs, rel, size }]. */
async function listFiles(dir) {
  const out = [];
  const walk = async (cur, rel) => {
    let entries;
    try { entries = await fs.promises.readdir(cur, { withFileTypes: true }); } catch { return; }
    for (const e of entries) {
      if (e.isSymbolicLink()) continue;
      const abs = path.join(cur, e.name);
      const r = rel ? path.join(rel, e.name) : e.name;
      if (e.isDirectory()) {
        await walk(abs, r);
      } else if (e.isFile()) {
        let size = 0;
        try { size = (await fs.promises.stat(abs)).size; } catch { continue; }
        out.push({ abs, rel: r, size });
      }
    }
  };
  await walk(dir, '');
  return out;
}

async function dirSize(dir) {
  const files = await listFiles(dir);
  return files.reduce((n, f) => n + f.size, 0);
}

/** Сводка для вопроса «перенести?»: сколько тайтлов (папок верхнего уровня) и байт. */
async function summarizeLibrary(dir) {
  let titles = 0;
  try {
    const entries = await fs.promises.readdir(dir, { withFileTypes: true });
    titles = entries.filter((e) => e.isDirectory() && !e.name.startsWith('.')).length;
  } catch { /* нет папки */ }
  const files = await listFiles(dir);
  return {
    titles,
    files: files.filter((f) => path.basename(f.rel) !== LIBRARY_META).length,
    bytes: files.reduce((n, f) => n + f.size, 0),
  };
}

/** Корень диска для группировки («C:\», «D:\», «/»). */
function diskRootOf(p) {
  return path.parse(path.resolve(p)).root;
}

async function diskStats(p) {
  try {
    const st = await fs.promises.statfs(p);
    return { total: st.blocks * st.bsize, free: st.bavail * st.bsize };
  } catch {
    return null;
  }
}

async function moveOneFile(src, dest) {
  try {
    await fs.promises.rename(src, dest);
  } catch (e) {
    if (e?.code !== 'EXDEV') throw e;
    // Другой диск: копия, потом удаление исходника
    await fs.promises.copyFile(src, dest);
    await fs.promises.unlink(src);
  }
}

function uniqueDest(dest) {
  if (!fs.existsSync(dest)) return dest;
  const { dir, name, ext } = path.parse(dest);
  for (let i = 2; i < 1000; i++) {
    const cand = path.join(dir, `${name} (${i})${ext}`);
    if (!fs.existsSync(cand)) return cand;
  }
  return path.join(dir, `${name} (${Date.now()})${ext}`);
}

/** Слить мета-файл библиотеки (папка → releaseId/озвучка) вместо перезаписи. */
async function mergeLibraryMeta(src, dest) {
  let a = {};
  let b = {};
  try { a = JSON.parse(await fs.promises.readFile(src, 'utf8')); } catch { /* пусто */ }
  try { b = JSON.parse(await fs.promises.readFile(dest, 'utf8')); } catch { /* пусто */ }
  const merged = { ...a, ...b, folders: { ...(a.folders || {}), ...(b.folders || {}) } };
  await fs.promises.writeFile(dest, JSON.stringify(merged, null, 2), 'utf8');
  await fs.promises.unlink(src).catch(() => {});
}

async function removeEmptyDirs(dir, keepRoot) {
  let entries;
  try { entries = await fs.promises.readdir(dir, { withFileTypes: true }); } catch { return; }
  for (const e of entries) {
    if (e.isDirectory()) await removeEmptyDirs(path.join(dir, e.name), false);
  }
  if (keepRoot) return;
  try {
    if ((await fs.promises.readdir(dir)).length === 0) await fs.promises.rmdir(dir);
  } catch { /* не пусто / занято */ }
}

/**
 * Перенести всё содержимое from → to. Совпадающие файлы (то же имя и размер) не дублируются.
 * @returns {{ moved: number, skipped: number, failed: Array<{ file: string, error: string }>, bytes: number }}
 */
async function moveLibrary(from, to, { onProgress = null, skipPaths = new Set() } = {}) {
  const src = path.resolve(from);
  const dst = path.resolve(to);
  if (src === dst) return { moved: 0, skipped: 0, failed: [], bytes: 0 };
  if (isPathInside(src, dst) || isPathInside(dst, src)) {
    throw new Error('Новая папка не может лежать внутри старой (и наоборот)');
  }
  await fs.promises.mkdir(dst, { recursive: true });

  const files = (await listFiles(src)).filter((f) => !skipPaths.has(path.resolve(f.abs)));
  const total = files.reduce((n, f) => n + f.size, 0);
  let done = 0;
  let moved = 0;
  let skipped = 0;
  const failed = [];
  const report = (current) => { if (onProgress) onProgress({ done, total, current }); };
  report('');

  // Мета-файлы — в конце, когда все видео уже на месте
  files.sort((a, b) => (path.basename(a.rel) === LIBRARY_META) - (path.basename(b.rel) === LIBRARY_META));

  for (const f of files) {
    const target = path.join(dst, f.rel);
    try {
      await fs.promises.mkdir(path.dirname(target), { recursive: true });
      if (path.basename(f.rel) === LIBRARY_META && fs.existsSync(target)) {
        await mergeLibraryMeta(f.abs, target);
      } else if (fs.existsSync(target) && (await fs.promises.stat(target)).size === f.size) {
        // Такая серия уже есть в новой папке — убираем дубль из старой
        await fs.promises.unlink(f.abs);
        skipped += 1;
      } else {
        await moveOneFile(f.abs, uniqueDest(target));
        moved += 1;
      }
    } catch (e) {
      failed.push({ file: f.rel, error: e?.message || String(e) });
    }
    done += f.size;
    report(f.rel);
  }

  await removeEmptyDirs(src, true);
  return { moved, skipped, failed, bytes: total };
}

module.exports = {
  dirSize,
  summarizeLibrary,
  diskRootOf,
  diskStats,
  moveLibrary,
};
