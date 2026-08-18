export interface SkipRange {
  start: number;
  end: number;
}

export interface SkipMarks {
  opening: SkipRange | null;
  ending: SkipRange | null;
}

export type SkipMarkKind = 'opening' | 'ending';

function usable(start: unknown, end: unknown): SkipRange | null {
  const a = Number(start);
  const b = Number(end);
  if (!Number.isFinite(a) || !Number.isFinite(b) || b - a < 2) return null;
  return { start: a, end: b };
}

export function normalizeSkipMarks(raw: unknown): SkipMarks | null {
  if (!raw || typeof raw !== 'object') return null;
  const skip = raw as Record<string, unknown>;
  const opening = usable(
    (skip.opening as SkipRange | undefined)?.start,
    (skip.opening as SkipRange | undefined)?.end,
  );
  const ending = usable(
    (skip.ending as SkipRange | undefined)?.start,
    (skip.ending as SkipRange | undefined)?.end,
  );
  if (!opening && !ending) return null;
  return { opening, ending };
}

/** Показать кнопку, пока таймлайн внутри интервала (чуть раньше старта, скрыть перед самым концом). */
export function skipMarkActive(t: number, range: SkipRange | null | undefined): boolean {
  if (!range || !Number.isFinite(t)) return false;
  return t >= range.start - 0.35 && t < range.end - 0.45;
}

/** Точка на прогрессе — пока смотрят OP/ED, включая самый край интервала. */
export function skipMarkOnPlayhead(t: number, range: SkipRange | null | undefined): boolean {
  if (!range || !Number.isFinite(t)) return false;
  return t >= range.start - 0.2 && t <= range.end + 0.25;
}

/** После эндинга почти сразу конец файла — смысла в «пропустить» нет. */
export function endingIsAtEpisodeEnd(range: SkipRange | null | undefined, duration: number): boolean {
  if (!range || !(duration > 0)) return false;
  return duration - range.end <= 12 || range.end / duration >= 0.97;
}
