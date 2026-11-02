import { isCurrentAppRoute, navigate } from './stores/navigation';
import { addSearchHistory } from './utils/search-history';
import { RELEASE_SEARCH_BY } from './views/Release/_metaInfo';

const TITLEBAR_INPUT_ID = 'titlebar-search-input';

export type SearchTab = 'releases' | 'collections' | 'profiles';

export const SEARCH_TABS: { id: SearchTab; label: string }[] = [
  { id: 'releases', label: 'Тайтлы' },
  { id: 'collections', label: 'Коллекции' },
  { id: 'profiles', label: 'Пользователи' },
];

/** Поле поиска тайтлов (search_by в API). */
export const RELEASE_SEARCH_BY_OPTIONS: { value: string; label: string }[] = [
  { value: String(RELEASE_SEARCH_BY.title), label: 'Название' },
  { value: String(RELEASE_SEARCH_BY.studio), label: 'Студия' },
  { value: String(RELEASE_SEARCH_BY.director), label: 'Режиссёр' },
  { value: String(RELEASE_SEARCH_BY.author), label: 'Автор' },
  { value: String(RELEASE_SEARCH_BY.genre), label: 'Жанр' },
  { value: String(RELEASE_SEARCH_BY.source), label: 'Первоисточник' },
];

export function isSearchTab(value: string | null | undefined): value is SearchTab {
  return value === 'releases' || value === 'collections' || value === 'profiles';
}

export function buildSearchRoute(query: string, tab: SearchTab = 'releases', searchBy = 0): string {
  const params = new URLSearchParams({ q: query.trim() });
  if (tab !== 'releases') params.set('tab', tab);
  if (tab === 'releases' && searchBy > 0) params.set('by', String(searchBy));
  return `/search?${params.toString()}`;
}

/** Открыть страницу результатов. */
export function openSearchPage(query: string, tab: SearchTab = 'releases', searchBy = 0): void {
  const q = query.trim();
  if (!q) return;
  addSearchHistory(q);
  const route = buildSearchRoute(q, tab, searchBy);
  // Тот же запрос — уже на странице (navigate прислал бы маршрут без query)
  if (isCurrentAppRoute(route)) return;
  navigate(route);
}

/** Фокус в поле поиска в тайтлбаре (опционально с текстом). */
export function openSearch(query?: string): void {
  window.dispatchEvent(new CustomEvent('anix:openSearchIsland', { detail: { q: query } }));
  requestAnimationFrame(() => focusSearch());
}

export function focusSearch(): void {
  const titlebar = document.getElementById(TITLEBAR_INPUT_ID) as HTMLInputElement | null;
  if (titlebar) {
    titlebar.focus();
    titlebar.setSelectionRange(0, titlebar.value.length);
  }
}

let hotkeysBound = false;

export function bindSearchHotkeys(): void {
  if (hotkeysBound) return;
  hotkeysBound = true;

  document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyK') {
      e.preventDefault();
      openSearch();
      return;
    }

    // Ctrl+/ занят списком страниц (App.svelte)
    if (e.key === '/' && !e.ctrlKey && !e.metaKey && !isInputFocused()) {
      e.preventDefault();
      openSearch();
    }
  });
}

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || (el as HTMLElement).isContentEditable;
}
