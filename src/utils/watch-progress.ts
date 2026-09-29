/**
 * Позиция просмотра скачанных серий (локально, без сети).
 * Ключ — файл: у разных озвучек одной серии разная длина и таймкоды.
 */
const KEY = 'anixapp.localWatchProgress';
const MAX_ENTRIES = 400;
/** Меньше — считаем, что серию только открыли. */
const MIN_RESUME_SEC = 10;
/** Ближе к концу — серия досмотрена, начинаем сначала. */
const END_GAP_SEC = 30;

type Entry = { t: number; d: number; at: number };

function readAll(): Record<string, Entry> {
  try {
    const raw = localStorage.getItem(KEY);
    const parsed = raw ? JSON.parse(raw) : null;
    return parsed && typeof parsed === 'object' ? parsed as Record<string, Entry> : {};
  } catch {
    return {};
  }
}

export function saveLocalWatchProgress(filePath: string, time: number, duration: number): void {
  if (!filePath || !Number.isFinite(time) || time < 0) return;
  const all = readAll();
  const d = Number.isFinite(duration) && duration > 0 ? duration : 0;
  const finished = d > 0 && time >= d - END_GAP_SEC;
  if (time < MIN_RESUME_SEC || finished) {
    if (!(filePath in all)) return;
    delete all[filePath];
  } else {
    all[filePath] = { t: Math.floor(time), d: Math.floor(d), at: Date.now() };
    const keys = Object.keys(all);
    if (keys.length > MAX_ENTRIES) {
      keys.sort((a, b) => all[a].at - all[b].at);
      for (const k of keys.slice(0, keys.length - MAX_ENTRIES)) delete all[k];
    }
  }
  try {
    localStorage.setItem(KEY, JSON.stringify(all));
  } catch {
    /* переполнено хранилище — позицию не сохраняем */
  }
}

/** Секунда, с которой продолжить, или undefined. */
export function getLocalWatchProgress(filePath: string): number | undefined {
  if (!filePath) return undefined;
  const e = readAll()[filePath];
  if (!e || !Number.isFinite(e.t) || e.t < MIN_RESUME_SEC) return undefined;
  if (e.d > 0 && e.t >= e.d - END_GAP_SEC) return undefined;
  return e.t;
}
