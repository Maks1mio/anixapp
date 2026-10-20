'use strict';

/**
 * Проверка караказябр (битая кириллица / UTF-8) в исходниках anixapp.
 *
 * Типы:
 *  A) UTF-8 → Windows-1251 → «РЎРµСЂРёСЏ» вместо «Серия»
 *  B) UTF-8 → Latin-1     → «â» / «Ð½Ð°Ð·Ð°Ðґ» вместо «–» / «назад»
 *
 * Usage:
 *   yarn check:mojibake
 *   yarn check:mojibake --fix
 *   yarn check:mojibake -v
 */

const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const FIX = process.argv.includes('--fix');
const VERBOSE = process.argv.includes('--verbose') || process.argv.includes('-v');

const SKIP_DIRS = new Set([
  'node_modules', 'dist', 'dist-tv-web', 'out', '.git',
  'android', 'capacitor', 'coverage', '.svelte-kit',
  // vendor / generated — не текст UI
  'public', 'keygen', 'assets',
]);

const EXT = new Set([
  '.js', '.mjs', '.cjs', '.ts', '.tsx',
  '.svelte', '.html', '.css', '.scss',
  '.md', '.json', '.svg',
]);

const SKIP_FILES = new Set([
  'scripts/check-mojibake.js',
]);

/** A: win1251-style digraphs */
const WIN1251_MARKERS = [
  'вЂ', 'в†',
  'РЎРµ', 'РџСЂРµ', 'РќР°С‚', 'Р’С‹С€', 'РґРѕР±Р°РІ', 'РљРѕРјРј',
  'Р—Р°РїРё', 'РћРґРёРЅ', 'РЎРЅР°С‡', 'РЎРёСЃС‚', 'РўРѕР»СЊ', 'Р•СЃР»Рё',
  'РњР°СЃС‚', 'Р—РѕРІРё', 'РџРѕРєР°Р·', 'Р‘РµР· ', 'Р“Р»Р°РІ', 'Р—Р°РїР°СЃ',
  'СѓРІРµРґ', 'Р±Р°РЅРЅ', 'РЅР°С‚РёРІ', 'С‚РѕСЃС‚', 'РіСЂРѕРј', 'РїСЂРµРґРї',
  'РѕС‡РµСЂ', 'РІС‹СЃРѕС‚', 'РјРµСЂС†', 'РєСЂСѓРіР»', 'Р°РІР°С‚', 'РїРѕСЃС‚Рµ',
  'РІСЂРµРјРµ', 'РїСЂРёРЅСѓ', 'РІРѕСЃРїСЂ', 'РѕСЃРЅРѕРІ', 'РєРѕРіРґР°', 'РіР»Р°РІРЅ',
  'РїСѓР±Р»Рё', 'РѕР±С‹С‡РЅ', 'РїРµСЂРµРєСЂ', 'РёРЅРєСЂРµ', 'РѕС‚РјРµРЅ', 'РЅРµР·Р°РІ',
  'СЃРјРµРЅСѓ', 'СѓРіР»Р°', 'РїСЂРµРІСЊ', 'Р°РєС‚РёРІ', 'РїРѕР·РёС†', 'РєРѕР»РёС‡',
  'РЈРІРµРґ', 'Р’РѕР·Рј', 'Р’СЃС‘ ',
];

/** B: latin1-style — lead byte as U+00xx + continuation */
const LATIN1_RE = /â[\u0080-\u00BF]|Â[\u0080-\u00BF«»]|[ÐÑ][\u0080-\u00FF]/g;

const WIN1251 = (() => {
  const map = new Map();
  for (let i = 0; i < 128; i++) map.set(i, i);
  const pairs = [
    [0x0402, 0x80], [0x0403, 0x81], [0x201a, 0x82], [0x0453, 0x83],
    [0x201e, 0x84], [0x2026, 0x85], [0x2020, 0x86], [0x2021, 0x87],
    [0x20ac, 0x88], [0x2030, 0x89], [0x0409, 0x8a], [0x2039, 0x8b],
    [0x040a, 0x8c], [0x040c, 0x8d], [0x040b, 0x8e], [0x040f, 0x8f],
    [0x0452, 0x90], [0x2018, 0x91], [0x2019, 0x92], [0x201c, 0x93],
    [0x201d, 0x94], [0x2022, 0x95], [0x2013, 0x96], [0x2014, 0x97],
    [0x2122, 0x99], [0x0459, 0x9a], [0x203a, 0x9b], [0x045a, 0x9c],
    [0x045c, 0x9d], [0x045b, 0x9e], [0x045f, 0x9f],
    [0x00a0, 0xa0], [0x040e, 0xa1], [0x045e, 0xa2], [0x0408, 0xa3],
    [0x00a4, 0xa4], [0x0490, 0xa5], [0x00a6, 0xa6], [0x00a7, 0xa7],
    [0x0401, 0xa8], [0x00a9, 0xa9], [0x0404, 0xaa], [0x00ab, 0xab],
    [0x00ac, 0xac], [0x00ad, 0xad], [0x00ae, 0xae], [0x0407, 0xaf],
    [0x00b0, 0xb0], [0x00b1, 0xb1], [0x0406, 0xb2], [0x0456, 0xb3],
    [0x0491, 0xb4], [0x00b5, 0xb5], [0x00b6, 0xb6], [0x00b7, 0xb7],
    [0x0451, 0xb8], [0x2116, 0xb9], [0x0454, 0xba], [0x00bb, 0xbb],
    [0x0458, 0xbc], [0x0405, 0xbd], [0x0455, 0xbe], [0x0457, 0xbf],
  ];
  for (const [u, b] of pairs) map.set(u, b);
  for (let i = 0; i < 64; i++) map.set(0x0410 + i, 0xc0 + i);
  return map;
})();

function walk(dir, acc = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch {
    return acc;
  }
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (!SKIP_DIRS.has(e.name)) walk(p, acc);
      continue;
    }
    if (!EXT.has(path.extname(e.name))) continue;
    if (/\.worklet\.js$/i.test(e.name) || /\.min\.(js|css)$/i.test(e.name)) continue;
    const rel = path.relative(ROOT, p).replace(/\\/g, '/');
    if (SKIP_FILES.has(rel)) continue;
    // Только исходники приложения
    if (!(rel.startsWith('src/') || rel.startsWith('electron/') || rel.startsWith('scripts/'))) continue;
    acc.push(p);
  }
  return acc;
}

function countWin1251(text) {
  const found = [];
  let hits = 0;
  for (const m of WIN1251_MARKERS) {
    let i = 0;
    let n = 0;
    while ((i = text.indexOf(m, i)) !== -1) {
      n += 1;
      i += m.length;
    }
    if (n) {
      found.push(m);
      hits += n;
    }
  }
  return { hits, found };
}

function countLatin1(text) {
  const found = text.match(LATIN1_RE) || [];
  return { hits: found.length, found: [...new Set(found)].slice(0, 12) };
}

function looksWin1251(line) {
  if (/вЂ.|в†./.test(line)) return true;
  const cyr = line.match(/[А-Яа-яЁё]/g) || [];
  if (cyr.length < 8) return false;
  const rs = line.match(/[РС]/g) || [];
  return rs.length / cyr.length >= 0.35;
}

function looksLatin1(line) {
  if (!LATIN1_RE.test(line)) {
    // reset lastIndex — global regex
    LATIN1_RE.lastIndex = 0;
    return false;
  }
  LATIN1_RE.lastIndex = 0;
  // Не трогаем строки, где уже нормальная кириллица (смешанный/исправленный текст)
  const realCyr = (line.match(/[А-Яа-яЁё]/g) || []).length;
  if (realCyr >= 4) return false;
  return true;
}

function encodeWin1251(str) {
  const out = Buffer.alloc(str.length);
  for (let i = 0; i < str.length; i++) {
    const b = WIN1251.get(str.charCodeAt(i));
    if (b == null) return null;
    out[i] = b;
  }
  return out;
}

function fixWin1251(str) {
  const buf = encodeWin1251(str);
  if (!buf) return str;
  try {
    const fixed = buf.toString('utf8');
    if (fixed.includes('\uFFFD') || looksWin1251(fixed)) return str;
    return fixed;
  } catch {
    return str;
  }
}

function fixLatin1(str) {
  try {
    const fixed = Buffer.from(str, 'latin1').toString('utf8');
    if (fixed.includes('\uFFFD')) return str;
    return fixed;
  } catch {
    return str;
  }
}

function fixLine(line) {
  let out = line;
  if (looksWin1251(out)) out = fixWin1251(out);
  if (looksLatin1(out)) out = fixLatin1(out);
  return out;
}

function fixFileContent(src) {
  return src.split(/(\r?\n)/).map((part) => {
    if (part === '\n' || part === '\r\n') return part;
    return fixLine(part);
  }).join('');
}

function sampleHits(text, limit = 5) {
  const lines = text.split(/\r?\n/);
  const samples = [];
  for (let i = 0; i < lines.length && samples.length < limit; i++) {
    const line = lines[i];
    const win = countWin1251(line).hits > 0;
    LATIN1_RE.lastIndex = 0;
    const lat = LATIN1_RE.test(line);
    LATIN1_RE.lastIndex = 0;
    if (win || lat) {
      samples.push({ line: i + 1, text: line.trim().slice(0, 140) });
    }
  }
  return samples;
}

function analyze(text) {
  const a = countWin1251(text);
  const b = countLatin1(text);
  return {
    hits: a.hits + b.hits,
    win1251: a.hits,
    latin1: b.hits,
    markers: [...a.found, ...b.found].slice(0, 16),
  };
}

function main() {
  const files = walk(ROOT);
  const reports = [];

  for (const file of files) {
    let text;
    try {
      text = fs.readFileSync(file, 'utf8');
    } catch {
      continue;
    }

    const before = analyze(text);
    if (!before.hits) continue;

    const rel = path.relative(ROOT, file).replace(/\\/g, '/');
    const samples = sampleHits(text);

    if (FIX) {
      const next = fixFileContent(text);
      if (next !== text) {
        fs.writeFileSync(file, next, 'utf8');
        const after = analyze(next);
        reports.push({
          file: rel,
          before: before.hits,
          after: after.hits,
          kind: { win1251: before.win1251, latin1: before.latin1 },
          fixed: true,
          samples,
        });
        continue;
      }
    }

    reports.push({
      file: rel,
      before: before.hits,
      after: before.hits,
      kind: { win1251: before.win1251, latin1: before.latin1 },
      fixed: false,
      markers: before.markers,
      samples,
    });
  }

  if (!reports.length) {
    console.log('check:mojibake OK — караказябр не найдено');
    process.exit(0);
  }

  console.log(`check:mojibake — файлов: ${reports.length}${FIX ? ' (--fix)' : ''}\n`);
  for (const r of reports) {
    const status = r.fixed
      ? `FIXED ${r.before} → ${r.after}`
      : `HITS ${r.before} (win1251:${r.kind.win1251}, latin1:${r.kind.latin1})`;
    console.log(`  ${r.file}`);
    console.log(`    ${status}`);
    if (VERBOSE || !r.fixed) {
      for (const s of r.samples || []) {
        console.log(`    L${s.line}: ${s.text}`);
      }
    }
    console.log('');
  }

  if (FIX) {
    const still = reports.filter((r) => (r.fixed ? r.after > 0 : true));
    if (still.some((r) => !r.fixed) || still.some((r) => r.after > 0)) {
      // re-check remaining
      const left = still.filter((r) => !r.fixed || r.after > 0);
      if (left.length) {
        console.log(`Осталось с hits: ${left.length}. Проверьте вручную или повторите check.`);
        process.exit(1);
      }
    }
    console.log('check:mojibake — правки записаны. Проверка: yarn check:mojibake');
    process.exit(0);
  }

  console.log('Автофикс: yarn check:mojibake --fix');
  process.exit(1);
}

main();
