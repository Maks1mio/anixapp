'use strict';

/**
 * Таймкоды OP/ED: Kodik parseSkipButton и AniLibria episode.opening/ending.
 */

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
  if (!ranges.length) return null;
  if (ranges.length >= 2) {
    return { opening: ranges[0], ending: ranges[1] };
  }
  const only = ranges[0];
  if (only.start >= 600) return { opening: null, ending: only };
  return { opening: only, ending: null };
}

function skipFromLibriaEpisode(ep) {
  if (!ep) return null;
  const opening = rangeFromUnknown(ep.opening);
  const ending = rangeFromUnknown(ep.ending);
  if (!opening && !ending) return null;
  return { opening, ending };
}

function normalizeSkipMarks(skip) {
  if (!skip || typeof skip !== 'object') return null;
  const opening = rangeFromUnknown(skip.opening);
  const ending = rangeFromUnknown(skip.ending);
  if (!opening && !ending) return null;
  return { opening, ending };
}

module.exports = {
  parseKodikSkipButton,
  skipFromLibriaEpisode,
  normalizeSkipMarks,
  rangeFromUnknown,
};
