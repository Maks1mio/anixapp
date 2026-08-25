'use strict';

/**
 * Таймкоды OP/ED: Kodik parseSkipButton и AniLibria episode.opening/ending.
 *
 * У Kodik иногда первым интервалом идёт короткое интро озвучки (5–30 с),
 * а реальный опенинг — следующим. Тогда сливаем интро+OP в один скип.
 * Если есть только OP и ED — скип только внутри OP, не с начала серии.
 */

const fs = require('fs');

/** Короче типичного OP / явно «бампер» озвучки. */
const INTRO_MAX_DURATION = 45;
/** Типичная длина опенинга. */
const OP_MIN_DURATION = 50;
const OP_MAX_DURATION = 200;

function parseClock(str) {
  const p = String(str).trim().split(':').map(Number);
  if (!p.length || p.some((n) => !Number.isFinite(n))) return null;
  if (p.length === 3) return p[0] * 3600 + p[1] * 60 + p[2];
  if (p.length === 2) return p[0] * 60 + p[1];
  return p[0];
}

function usableRange(start, end) {
  const a = Number(start);
  const b = Number(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b - a < 2) return null;
  return { start: a, end: b };
}

function rangeDuration(r) {
  return r ? Math.max(0, r.end - r.start) : 0;
}

/** Короткий бампер в начале серии (интро озвучки), не опенинг. */
function isVoiceoverIntro(range) {
  if (!range) return false;
  const dur = rangeDuration(range);
  return dur > 0 && dur < INTRO_MAX_DURATION && range.start < 90;
}

function looksLikeOpening(range) {
  if (!range || isVoiceoverIntro(range)) return false;
  const dur = rangeDuration(range);
  return dur >= OP_MIN_DURATION && dur <= OP_MAX_DURATION && range.start < 720;
}

function pickOpening(candidates) {
  if (!candidates.length) return null;
  const typical = candidates.filter(looksLikeOpening);
  if (typical.length) {
    return typical.slice().sort((a, b) => rangeDuration(b) - rangeDuration(a))[0];
  }
  const early = candidates.filter((r) => r.start < 600 && !isVoiceoverIntro(r));
  if (early.length) {
    return early.slice().sort((a, b) => rangeDuration(b) - rangeDuration(a))[0];
  }
  // Не берём чистое короткое интро как OP
  if (candidates.length === 1 && isVoiceoverIntro(candidates[0])) return null;
  return candidates.find((r) => !isVoiceoverIntro(r)) || null;
}

function rangeFromUnknown(v) {
  if (v == null) return null;
  if (Array.isArray(v) && v.length >= 2) return usableRange(v[0], v[1]);
  if (typeof v === 'object') {
    return usableRange(
      v.start ?? v.from ?? v.begin,
      v.stop ?? v.end ?? v.to ?? v.finish,
    );
  }
  return null;
}

function classifySkipRanges(ranges) {
  const list = (ranges || []).filter(Boolean);
  if (!list.length) return null;

  /** Короткий бампер до OP → один интервал пропуска от интро до конца OP. */
  function mergeIntroWithOpening(intro, opening) {
    if (!intro || !opening) return opening;
    if (intro.end > opening.start + 8) return opening;
    return usableRange(Math.min(intro.start, opening.start), opening.end);
  }

  if (list.length >= 3) {
    const ending = list[list.length - 1];
    const beforeEnd = list.slice(0, -1);
    const openingRaw = pickOpening(beforeEnd);
    const intro = beforeEnd.find((r) => isVoiceoverIntro(r));
    const opening = mergeIntroWithOpening(intro, openingRaw);
    if (!opening && !ending) return null;
    return { opening, ending };
  }

  if (list.length === 2) {
    const [a, b] = list;
    // Интро + ED (реального OP в метках нет) — в начале не скипаем
    if (isVoiceoverIntro(a) && b.start >= 480) {
      return { opening: null, ending: b };
    }
    // Интро + настоящий OP → скип от интро до конца OP
    if (isVoiceoverIntro(a) && looksLikeOpening(b)) {
      return { opening: mergeIntroWithOpening(a, b), ending: null };
    }
    // Интро + что-то среднее
    if (isVoiceoverIntro(a)) {
      const opening = pickOpening([a, b]);
      if (opening === b) return { opening: mergeIntroWithOpening(a, b), ending: null };
      return { opening: null, ending: b.start >= 480 ? b : null };
    }
    // Обычный OP + ED — скип только внутри OP, не с 0:00
    return { opening: a, ending: b };
  }

  const only = list[0];
  if (isVoiceoverIntro(only)) return null;
  if (only.start >= 600) return { opening: null, ending: only };
  return { opening: only, ending: null };
}

/** Kodik: parseSkipButton("1:49-3:19,23:32-25:13", "anime") */
function parseKodikSkipButton(html) {
  const m = String(html || '').match(/parseSkipButton\(\s*"([^"]*)"\s*,\s*"[^"]*"\s*\)/);
  if (!m) return null;
  const raw = m[1].trim();
  if (!raw) return null;
  const ranges = raw.split(',').map((part) => {
    const bits = part.split('-');
    if (bits.length < 2) return null;
    return usableRange(parseClock(bits[0]), parseClock(bits[1]));
  }).filter(Boolean);
  return classifySkipRanges(ranges);
}

function skipFromLibriaEpisode(ep) {
  if (!ep) return null;
  let opening = rangeFromUnknown(ep.opening);
  const ending = rangeFromUnknown(ep.ending);
  // AniLibria иногда отдаёт короткий преролл как opening
  if (isVoiceoverIntro(opening)) opening = null;
  if (!opening && !ending) return null;
  return { opening, ending };
}

function normalizeSkipMarks(skip) {
  if (!skip || typeof skip !== 'object') return null;
  let opening = rangeFromUnknown(skip.opening);
  const ending = rangeFromUnknown(skip.ending);
  if (isVoiceoverIntro(opening)) opening = null;
  if (!opening && !ending) return null;
  return { opening, ending };
}

function skipSidecarPath(filePath) {
  return `${filePath}.anixskip`;
}

function writeSkipSidecar(filePath, skip) {
  const n = normalizeSkipMarks(skip);
  if (!filePath || !n) return false;
  try {
    fs.writeFileSync(skipSidecarPath(filePath), JSON.stringify(n), 'utf8');
    return true;
  } catch {
    return false;
  }
}

function readSkipSidecar(filePath) {
  if (!filePath) return null;
  try {
    if (!fs.existsSync(skipSidecarPath(filePath))) return null;
    const raw = JSON.parse(fs.readFileSync(skipSidecarPath(filePath), 'utf8'));
    return normalizeSkipMarks(raw);
  } catch {
    return null;
  }
}

module.exports = {
  parseKodikSkipButton,
  skipFromLibriaEpisode,
  normalizeSkipMarks,
  rangeFromUnknown,
  writeSkipSidecar,
  readSkipSidecar,
  isVoiceoverIntro,
  classifySkipRanges,
};
