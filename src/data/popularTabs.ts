/** TopFragment tabs — POST /filter/{page} with sort=3 (popularity). */

export type PopularTabId = 'ongoing' | 'finished' | 'movies' | 'ova';

export interface PopularTabDef {
  id: PopularTabId;
  label: string;
}

export const POPULAR_TAB_DEFS: readonly PopularTabDef[] = [
  { id: 'ongoing', label: 'Онгоинги' },
  { id: 'finished', label: 'Завершенные' },
  { id: 'movies', label: 'Фильмы' },
  { id: 'ova', label: 'OVA' },
];

export const DEFAULT_POPULAR_TAB: PopularTabId = 'ongoing';

export function isPopularTabId(value: string | null | undefined): value is PopularTabId {
  return !!value && (POPULAR_TAB_DEFS as readonly { id: string }[]).some((t) => t.id === value);
}

export function resolvePopularTab(value: string | null | undefined): PopularTabId {
  return isPopularTabId(value) ? value : DEFAULT_POPULAR_TAB;
}

/** Filter body for TopTabFragment — Android TopTabState.g(3). */
export function getPopularTabFilterArgs(tab: PopularTabId): Record<string, unknown> {
  const base = { sort: 3 };
  switch (tab) {
    case 'ongoing':
      return { ...base, status_id: 2, episodes_from: 1, episodes_to: 48 };
    case 'finished':
      return { ...base, status_id: 1 };
    case 'movies':
      return { ...base, category_id: 2 };
    case 'ova':
      return { ...base, category_id: 3 };
    default:
      return base;
  }
}
