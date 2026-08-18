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

export function mergeSkipMarks(incoming: SkipMarks | null | undefined, carry: SkipMarks | null | undefined): SkipMarks | null {
  const opening = incoming?.opening ?? carry?.opening ?? null;
  const ending = incoming?.ending ?? carry?.ending ?? null;
  if (!opening && !ending) return null;
  return { opening, ending };
}

/** Подрезать OP/ED под длительность файла, если серия короче предыдущей. */
export function clampSkipMarksToDuration(marks: SkipMarks | null | undefined, duration: number): SkipMarks | null {
  if (!marks) return null;
  if (!(duration > 2)) return marks;
  const clampRange = (range: SkipRange | null): SkipRange | null => {
    if (!range) return null;
    if (range.start >= duration - 1) return null;
    return usable(range.start, Math.min(range.end, duration));
  };
  const opening = clampRange(marks.opening);
  const ending = clampRange(marks.ending);
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

export interface TimelineSausage {
  id: string;
  startPct: number;
  widthPct: number;
  kind: 'content' | SkipMarkKind;
}

function pctOf(t: number, duration: number): number {
  return Math.max(0, Math.min(100, (t / duration) * 100));
}

/** Таймлайн режется по границам OP/ED — каждый кусок круглая «сосиска». */
export function buildTimelineSausages(
  duration: number,
  opening: SkipRange | null | undefined,
  ending: SkipRange | null | undefined,
): TimelineSausage[] {
  if (!(duration > 0)) return [{ id: 'all', startPct: 0, widthPct: 100, kind: 'content' }];

  const cuts = new Set<number>([0, 100]);
  if (opening) {
    cuts.add(pctOf(opening.start, duration));
    cuts.add(pctOf(opening.end, duration));
  }
  if (ending) {
    cuts.add(pctOf(ending.start, duration));
    cuts.add(pctOf(ending.end, duration));
  }

  const points = [...cuts].sort((a, b) => a - b);
  const out: TimelineSausage[] = [];
  const opStart = opening ? pctOf(opening.start, duration) : -1;
  const opEnd = opening ? pctOf(opening.end, duration) : -1;
  const edStart = ending ? pctOf(ending.start, duration) : -1;
  const edEnd = ending ? pctOf(ending.end, duration) : -1;

  for (let i = 0; i < points.length - 1; i++) {
    const startPct = points[i];
    const endPct = points[i + 1];
    const widthPct = endPct - startPct;
    if (widthPct < 0.08) continue;
    const mid = startPct + widthPct / 2;
    let kind: TimelineSausage['kind'] = 'content';
    if (opening && mid >= opStart && mid < opEnd) kind = 'opening';
    else if (ending && mid >= edStart && mid < edEnd) kind = 'ending';
    out.push({ id: `${kind}-${startPct.toFixed(2)}`, startPct, widthPct, kind });
  }

  return out.length > 0 ? out : [{ id: 'all', startPct: 0, widthPct: 100, kind: 'content' }];
}

/** Сколько процентов сосиски уже проиграно. */
export function sausagePlayedPct(s: TimelineSausage, progressPct: number): number {
  const end = s.startPct + s.widthPct;
  if (progressPct <= s.startPct) return 0;
  if (progressPct >= end) return 100;
  if (!(s.widthPct > 0)) return 0;
  return ((progressPct - s.startPct) / s.widthPct) * 100;
}

export interface TimelineRangePct {
  startPct: number;
  endPct: number;
}

/** Пересечение диапазона с сосиской — left/width в процентах самой сосиски. */
export function sausageRangeFill(
  s: TimelineSausage,
  fromPct: number,
  toPct: number,
): { leftPct: number; widthPct: number } | null {
  const end = s.startPct + s.widthPct;
  const a = Math.max(s.startPct, Math.min(fromPct, toPct));
  const b = Math.min(end, Math.max(fromPct, toPct));
  if (!(s.widthPct > 0) || b - a < 0.04) return null;
  return {
    leftPct: ((a - s.startPct) / s.widthPct) * 100,
    widthPct: ((b - a) / s.widthPct) * 100,
  };
}
