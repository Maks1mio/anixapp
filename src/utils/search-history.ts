/** История поиска: у тайтлов, коллекций, пользователей своя, у всех вкладок закладок общая. */
const STORAGE_KEY = 'anix-search-history';
const MAX_ITEMS = 10;

export type SearchHistoryScope = 'releases' | 'collections' | 'profiles' | 'bookmarks';

/** У тайтлов прежний ключ: накопленная история не пропадает. */
function storageKey(scope: SearchHistoryScope): string {
  return scope === 'releases' ? STORAGE_KEY : `${STORAGE_KEY}:${scope}`;
}

export function getSearchHistory(scope: SearchHistoryScope = 'releases'): string[] {
  try {
    const raw = localStorage.getItem(storageKey(scope));
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function addSearchHistory(query: string, scope: SearchHistoryScope = 'releases'): void {
  const trimmed = query.trim();
  if (!trimmed) return;
  let list = getSearchHistory(scope);
  list = list.filter((q) => q !== trimmed);
  list.unshift(trimmed);
  list = list.slice(0, MAX_ITEMS);
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function removeSearchHistory(query: string, scope: SearchHistoryScope = 'releases'): void {
  const list = getSearchHistory(scope).filter((q) => q !== query);
  try {
    localStorage.setItem(storageKey(scope), JSON.stringify(list));
  } catch {
    // ignore
  }
}

export function clearSearchHistory(scope: SearchHistoryScope = 'releases'): void {
  try {
    localStorage.removeItem(storageKey(scope));
  } catch {
    // ignore
  }
}
