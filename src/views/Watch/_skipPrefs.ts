import type { SkipMarkKind } from './_skipMarks';

const SKIP_PREF_KEY = 'anixapp_skip_auto_pref';

export type SkipAutoPref = 'auto' | 'watch';

type SkipPrefMap = Record<string, Partial<Record<SkipMarkKind, SkipAutoPref>>>;

function readMap(): SkipPrefMap {
  try {
    const raw = localStorage.getItem(SKIP_PREF_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== 'object') return {};
    return parsed as SkipPrefMap;
  } catch {
    return {};
  }
}

function writeMap(map: SkipPrefMap) {
  try {
    localStorage.setItem(SKIP_PREF_KEY, JSON.stringify(map));
  } catch {
    /* ignore quota */
  }
}

export function getSkipAutoPref(releaseId: string, kind: SkipMarkKind): SkipAutoPref | null {
  const id = String(releaseId || '').trim();
  if (!id) return null;
  const pref = readMap()[id]?.[kind];
  return pref === 'auto' || pref === 'watch' ? pref : null;
}

export function setSkipAutoPref(releaseId: string, kind: SkipMarkKind, pref: SkipAutoPref) {
  const id = String(releaseId || '').trim();
  if (!id) return;
  const map = readMap();
  map[id] = { ...map[id], [kind]: pref };
  writeMap(map);
}
