const STORAGE_KEY = 'anix-search-history';
const MAX_ITEMS = 10;

export function getSearchHistory(): string[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

export function addSearchHistory(query: string): void {
  const trimmed = query.trim();
  if (!trimmed) return;
  let list = getSearchHistory();
  list = list.filter((q) => q !== trimmed);
  list.unshift(trimmed);
  list = list.slice(0, MAX_ITEMS);
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(list));
  } catch {
    // ignore
  }
}
