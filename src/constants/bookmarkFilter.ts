/** filter_announce в profile/list и favorite/all (как фильтр в закладках Anixart). */
export const BOOKMARK_ANNOUNCE_FILTERS = [
  { value: 0, label: 'Все тайтлы' },
  { value: 1, label: 'Только анонсы' },
  { value: 2, label: 'Без анонсов' },
] as const;

export const DEFAULT_BOOKMARK_ANNOUNCE_FILTER = 0;

const BOOKMARKS_FILTER_KEY = 'anixapp.bookmarksAnnounceFilter';

function isAnnounceFilterValue(value: number): boolean {
  return BOOKMARK_ANNOUNCE_FILTERS.some((o) => o.value === value);
}

export function getBookmarksAnnounceFilter(): number {
  try {
    const n = Number.parseInt(window.localStorage.getItem(BOOKMARKS_FILTER_KEY) || '', 10);
    return isAnnounceFilterValue(n) ? n : DEFAULT_BOOKMARK_ANNOUNCE_FILTER;
  } catch {
    return DEFAULT_BOOKMARK_ANNOUNCE_FILTER;
  }
}

export function setBookmarksAnnounceFilter(value: number): number {
  const next = isAnnounceFilterValue(value) ? value : DEFAULT_BOOKMARK_ANNOUNCE_FILTER;
  try {
    window.localStorage.setItem(BOOKMARKS_FILTER_KEY, String(next));
  } catch {
    // ignore
  }
  return next;
}

export function bookmarkAnnounceFilterLabel(value: number): string {
  return BOOKMARK_ANNOUNCE_FILTERS.find((o) => o.value === value)?.label ?? 'Все тайтлы';
}
