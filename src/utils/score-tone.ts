/**
 * Тон оценки релиза (шкала 0–5) для цвета звезды и числа: от красного у низких до самого
 * насыщенного жёлтого у высоких. Цвета — токены --m-score-* (мобильный режим), см. _mobile-tokens.scss.
 * Границы рассчитаны на то, что оценки аниме в основном лежат в 3.5–4.8.
 */
export type ScoreTone = 'low' | 'midlow' | 'mid' | 'high' | 'top';

export function scoreTone(value: number | string | null | undefined): ScoreTone | null {
  const n = typeof value === 'number' ? value : Number.parseFloat(String(value ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n <= 0) return null;
  if (n < 3) return 'low';
  if (n < 3.5) return 'midlow';
  if (n < 4) return 'mid';
  if (n < 4.5) return 'high';
  return 'top';
}
