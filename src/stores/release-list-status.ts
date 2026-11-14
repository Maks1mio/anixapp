import { writable, type Readable } from 'svelte/store';
import type { ReleaseCardData } from '../types/release';

export type ReleaseListStatusValue = NonNullable<ReleaseCardData['listStatus']>;

const NUM_TO_STATUS: Record<number, ReleaseListStatusValue> = {
  1: 'watching',
  2: 'planned',
  3: 'completed',
  4: 'on_hold',
  5: 'dropped',
};

const VALID = new Set<string>(Object.values(NUM_TO_STATUS));

function normalizeStatus(value: unknown): ReleaseListStatusValue | null {
  if (typeof value === 'number') return NUM_TO_STATUS[value] ?? null;
  if (typeof value === 'string' && VALID.has(value)) return value as ReleaseListStatusValue;
  return null;
}

/**
 * Статусы списков, которые пользователь поменял в этой сессии (releaseId → статус, null = убран).
 * Карточки берут статус отсюда поверх данных из кэша страницы: главная и закладки
 * восстанавливаются из view-state при «назад» и иначе показывают старую подпись.
 */
const overrides = writable<ReadonlyMap<number, ReleaseListStatusValue | null>>(new Map());

export const releaseListStatusOverrides: Readable<ReadonlyMap<number, ReleaseListStatusValue | null>> = {
  subscribe: overrides.subscribe,
};

export function setReleaseListStatusOverride(releaseId: number, status: unknown): void {
  if (!releaseId) return;
  const next = normalizeStatus(status);
  overrides.update((map) => {
    if (map.has(releaseId) && map.get(releaseId) === next) return map;
    const copy = new Map(map);
    copy.set(releaseId, next);
    return copy;
  });
}

/** Статус с учётом локальных изменений; без изменений — значение из данных карточки. */
export function resolveReleaseListStatus(
  map: ReadonlyMap<number, ReleaseListStatusValue | null>,
  releaseId: number | null | undefined,
  fallback: ReleaseListStatusValue | null | undefined,
): ReleaseListStatusValue | null {
  if (releaseId && map.has(releaseId)) return map.get(releaseId) ?? null;
  return fallback ?? null;
}

if (typeof window !== 'undefined') {
  window.addEventListener('anix:bookmarksChanged', (e) => {
    const detail = (e as CustomEvent<{ kind?: string; releaseId?: number; statusId?: unknown }>).detail;
    if (detail?.kind !== 'list' || typeof detail.releaseId !== 'number') return;
    setReleaseListStatusOverride(detail.releaseId, detail.statusId);
  });
}
