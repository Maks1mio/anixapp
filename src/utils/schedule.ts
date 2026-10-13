import { mapCardData } from '../views/Release/_utils';
import type { ReleaseCardData } from '../types/release';
import { formatReleaseEpisodes } from './release-card';

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

const SCHEDULE_CACHE_TTL_MS = 5 * 60 * 1000;
let scheduleCache: { at: number; data: Record<string, ReleaseCardData[]> } | null = null;
let scheduleInflight: Promise<Record<string, ReleaseCardData[]>> | null = null;

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

export async function fetchSchedule(force = false): Promise<Record<string, ReleaseCardData[]>> {
  if (!force && scheduleCache && Date.now() - scheduleCache.at < SCHEDULE_CACHE_TTL_MS) {
    return scheduleCache.data;
  }
  if (!force && scheduleInflight) return scheduleInflight;
  if (!window.anixApi?.release?.schedule) {
    throw new Error('API недоступен');
  }
  scheduleInflight = (async () => {
    const data = await window.anixApi.release.schedule() as Record<string, unknown>;
    const mapped = mapScheduleResponse(data);
    scheduleCache = { at: Date.now(), data: mapped };
    return mapped;
  })();
  try {
    return await scheduleInflight;
  } finally {
    scheduleInflight = null;
  }
}

export function findReleaseScheduleDay(
  releaseId: number,
  byDay: Record<string, ReleaseCardData[]>,
): { day: ScheduleDay; item: ReleaseCardData } | null {
  if (!Number.isFinite(releaseId) || releaseId <= 0) return null;
  for (const day of SCHEDULE_DAYS) {
    const item = byDay[day.key]?.find((release) => release.id === releaseId);
    if (item) return { day, item };
  }
  return null;
}

export function scheduleHasReleases(byDay: Record<string, ReleaseCardData[]>): boolean {
  return SCHEDULE_DAYS.some((day) => (byDay[day.key]?.length ?? 0) > 0);
}

export function formatScheduleEpisodes(item: ReleaseCardData): string {
  return formatReleaseEpisodes(item.episodesReleased, item.episodesTotal);
}
