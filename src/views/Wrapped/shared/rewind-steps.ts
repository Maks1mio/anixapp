import type { WrappedScreenId } from '../components/WrappedScreenHost.svelte';
import type { WrappedData, WrappedLoadState } from './wrapped-load';
import { pluralRu } from './wrapped-utils';

/** Один «шаг» Rewind — экран или под-кадр (например, stat в «Ритм 2026»). */
export interface RewindStep {
  screenId: WrappedScreenId;
  bingeStep?: number;
}

export interface BingeStatStep {
  value: number;
  /** Заголовок над числом */
  eyebrow: string;
  /** Подпись под числом */
  label: string;
  /** Доп. строка (жаркий день) */
  note?: string;
}

export function bingeStatSteps(data: WrappedData): BingeStatStep[] {
  const d = data.watchDynamics;
  const year = data.year;
  const steps: BingeStatStep[] = [];

  if (d.episodesWatched > 0) {
    steps.push({
      value: d.episodesWatched,
      eyebrow: `Ритм ${year}`,
      label: 'Серий за год',
    });
  }
  if (d.activeDays > 0) {
    steps.push({
      value: d.activeDays,
      eyebrow: `Ритм ${year}`,
      label: pluralRu(d.activeDays, 'Активный день', 'Активных дня', 'Активных дней'),
    });
  }
  if (d.peakStreak > 0) {
    steps.push({
      value: d.peakStreak,
      eyebrow: `Ритм ${year}`,
      label: pluralRu(d.peakStreak, 'День подряд', 'Дня подряд', 'Дней подряд'),
    });
  }
  if (d.busiestDay) {
    steps.push({
      value: d.busiestDay.count,
      eyebrow: `🔥 ${d.busiestDay.label}`,
      label: 'Самый жаркий день',
      note: `${d.busiestDay.count} ${pluralRu(d.busiestDay.count, 'серия', 'серии', 'серий')} подряд`,
    });
  }
  return steps;
}

export function buildRewindSteps(d: WrappedData, state: WrappedLoadState): RewindStep[] {
  if (state === 'empty') return [{ screenId: 'empty' }];
  const steps: RewindStep[] = [{ screenId: 'welcome' }];

  if (d.isStatsHidden) {
    if (d.topThree.length) steps.push({ screenId: 'top-three' });
    steps.push({ screenId: 'privacy' });
    return steps;
  }

  const binge = bingeStatSteps(d);
  for (let i = 0; i < binge.length; i++) {
    steps.push({ screenId: 'binge', bingeStep: i });
  }
  if (d.watchedTimeMinutes > 0 || d.yearWatchMinutes > 0) steps.push({ screenId: 'time' });
  steps.push({ screenId: 'activity' });
  if (d.topThree.length) steps.push({ screenId: 'top-three' });
  if (d.collections.length) steps.push({ screenId: 'collections' });
  if (d.recommendSimilar.length || d.recommendUnwatched.length) steps.push({ screenId: 'preferences' });
  if (d.topComments.length) steps.push({ screenId: 'comments' });
  steps.push({ screenId: 'final' });
  return steps;
}

export function sameRewindScene(a: RewindStep, b: RewindStep): boolean {
  return a.screenId === b.screenId;
}
