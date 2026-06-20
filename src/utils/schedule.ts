import { mapCardData } from '../views/Release/_utils';
import type { ReleaseCardData } from '../types/release';

export interface ScheduleDay {
  key: string;
  label: string;
}

export const SCHEDULE_DAYS: ScheduleDay[] = [
  { key: 'monday', label: 'Понедельник' },
  { key: 'tuesday', label: 'Вторник' },
  { key: 'wednesday', label: 'Среда' },
  { key: 'thursday', label: 'Четверг' },
  { key: 'friday', label: 'Пятница' },
  { key: 'saturday', label: 'Суббота' },
  { key: 'sunday', label: 'Воскресенье' },
];

const JS_DAY_TO_KEY = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'] as const;

export function getTodayScheduleKey(): string {
  return JS_DAY_TO_KEY[new Date().getDay()] ?? 'monday';
}

export function mapScheduleResponse(data: Record<string, unknown>): Record<string, ReleaseCardData[]> {
  const result: Record<string, ReleaseCardData[]> = {};
  for (const day of SCHEDULE_DAYS) {
    const raw = data[day.key];
    if (!Array.isArray(raw)) {
      result[day.key] = [];
      continue;
    }
    result[day.key] = raw
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map(mapCardData);
  }
  return result;
}

export async function fetchSchedule(): Promise<Record<string, ReleaseCardData[]>> {
  if (!window.anixApi?.release?.schedule) {
    throw new Error('API недоступен');
  }
  const data = await window.anixApi.release.schedule() as Record<string, unknown>;
  return mapScheduleResponse(data);
}

export function scheduleHasReleases(byDay: Record<string, ReleaseCardData[]>): boolean {
  return SCHEDULE_DAYS.some((day) => (byDay[day.key]?.length ?? 0) > 0);
}

export function formatScheduleEpisodes(item: ReleaseCardData): string {
  const released = item.episodesReleased;
  const total = item.episodesTotal;
  if (released != null && total != null && total > 0) return `${released} из ${total} эп`;
  if (released != null) return `${released} эп`;
  if (total != null && total > 0) return `${total} эп`;
  return '';
}
