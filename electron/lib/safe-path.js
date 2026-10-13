'use strict';

const path = require('path');

/**
 * true, если `target` — это `root` или лежит строго внутри него.
 * Сравнение по path.relative (а не startsWith): `C:\Videos\Anixapp-evil` не считается внутри `C:\Videos\Anixapp`.
 * На Windows регистр не учитывается.
 */
function isPathInside(root, target) {
  if (typeof root !== 'string' || typeof target !== 'string' || !root || !target) return false;
  const r = path.resolve(root);
  const t = path.resolve(target);
  const fold = (p) => (process.platform === 'win32' ? p.toLowerCase() : p);
  const rel = path.relative(fold(r), fold(t));
  if (rel === '') return true;
  return rel !== '..' && !rel.startsWith('..' + path.sep) && !path.isAbsolute(rel);
}

/** Часть пути, которая не должна выбираться из ввода: ".", ".." и пустые. */
function isTraversalSegment(part) {
  const p = String(part || '').trim();
  return p === '' || p === '.' || p === '..' || /^\.+$/.test(p);
}

module.exports = { isPathInside, isTraversalSegment };
