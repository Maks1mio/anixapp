/**
 * Всплывашка под полем поиска: три варианта (Поиск / Коллекции / Пользователи) + разделитель + история.
 * Рендерится в body, позиция и ширина по якорю (обёртка поиска).
 */

import { renderPage } from './page';
import { getSearchHistory } from '../utils/search-history';

const GAP = 4;
const EDGE = 8;

export type SearchDropdownTab = 'releases' | 'profiles' | 'collections';

export interface SearchDropdownSelect {
  query: string;
  tab?: SearchDropdownTab;
}

let activeClose: (() => void) | null = null;

export function closeSearchDropdown(): void {
  activeClose?.();
}

function esc(s: string): string {
  const d = document.createElement('div');
  d.textContent = s;
  return d.innerHTML;
}

function positionDropdown(dropdown: HTMLElement, anchor: HTMLElement): void {
  const rect = anchor.getBoundingClientRect();
  const vh = document.documentElement.clientHeight;
  const dropdownHeight = dropdown.offsetHeight;

  let top = rect.bottom + GAP;
  if (top + dropdownHeight > vh - EDGE) {
    top = Math.max(EDGE, rect.top - dropdownHeight - GAP);
  }
  dropdown.style.position = 'fixed';
  dropdown.style.left = `${rect.left}px`;
  dropdown.style.top = `${top}px`;
  dropdown.style.width = `${rect.width}px`;
  dropdown.style.minWidth = `${rect.width}px`;
}

function buildContent(query: string, history: string[]): string {
  const q = query.trim();
  const qLower = q.toLowerCase();
  const filteredHistory =
    q.length > 0 ? history.filter((h) => h.toLowerCase().includes(qLower)) : history;
  const rows: string[] = [];

  if (filteredHistory.length > 0) {
    rows.push('<div class="search-dropdown__section">Недавние запросы</div>');
    filteredHistory.forEach((h) => {
      rows.push(`<button type="button" class="search-dropdown__history-item">${esc(h)}</button>`);
    });
  }

  return rows.join('');
}

export function openSearchDropdown(
  anchor: HTMLElement,
  input: HTMLInputElement,
  onSelect: (params: SearchDropdownSelect) => void,
): () => void {
  closeSearchDropdown();

  const dropdown = document.createElement('div');
  dropdown.className = 'search-dropdown';
  dropdown.setAttribute('role', 'listbox');

  const page = renderPage();
  const scrollEl = page.querySelector<HTMLElement>('#content');
  if (!scrollEl) {
    // Fallback: если по какой-то причине структура Page изменилась
    activeClose = null;
    return () => {};
  }

  dropdown.appendChild(page);

  const history = getSearchHistory();

  let currentIndex = -1;

  function getItems(): HTMLButtonElement[] {
    return Array.from(
      dropdown.querySelectorAll<HTMLButtonElement>('.search-dropdown__option, .search-dropdown__history-item'),
    );
  }

  function setActive(index: number): void {
    const items = getItems();
    items.forEach((el, i) => {
      el.classList.toggle('search-dropdown__item--active', i === index);
    });
    // Фокус не переносим — остаётся в инпуте, чтобы не слетал при ↑/↓
  }

  function render(): void {
    const q = input.value.trim();
    scrollEl.innerHTML = buildContent(q || '', history);
    scrollEl.querySelectorAll('.search-dropdown__history-item').forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.preventDefault();
        // Capture textContent before close() removes the element from DOM.
        const query = (btn as HTMLElement).textContent?.trim() ?? '';
        close();
        onSelect({ query });
      });
    });

    // Если после рендера нет ни одного элемента — скрываем контейнер полностью
    if (!scrollEl.innerHTML.trim()) {
      dropdown.style.display = 'none';
    } else {
      dropdown.style.display = 'block';
      positionDropdown(dropdown, anchor);
    }

    const items = getItems();
    if (!items.length) {
      currentIndex = -1;
    } else if (currentIndex >= items.length) {
      currentIndex = items.length - 1;
    }
    if (currentIndex >= 0) {
      setActive(currentIndex);
    }
  }

  render();
  input.addEventListener('input', render);

  document.body.appendChild(dropdown);

  function close(): void {
    input.removeEventListener('input', render);
    if (dropdown.parentElement) dropdown.parentElement.removeChild(dropdown);
    document.removeEventListener('keydown', onKeyDown, true);
    document.removeEventListener('mousedown', onMouseDown);
    if (activeClose === close) activeClose = null;
  }

  function onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      e.preventDefault();
      close();
      return;
    }

    const items = getItems();
    if (!items.length) return;

    if (e.key === 'ArrowDown') {
      e.preventDefault();
      currentIndex = (currentIndex + 1 + items.length) % items.length;
      setActive(currentIndex);
      return;
    }

    if (e.key === 'ArrowUp') {
      e.preventDefault();
      currentIndex = (currentIndex - 1 + items.length) % items.length;
      setActive(currentIndex);
      return;
    }

    if (e.key === 'Enter' && currentIndex >= 0) {
      e.preventDefault();
      e.stopPropagation(); // prevent Layout.svelte's Enter handler from also firing
      const target = items[currentIndex];
      target.click();
    }
  }

  function onMouseDown(e: MouseEvent): void {
    const target = e.target as Node;
    if (dropdown.contains(target) || anchor.contains(target)) return;
    close();
  }

  // Use capture phase so this fires before the input element's own keydown handlers.
  // This lets us intercept Enter on a highlighted item before Layout.svelte reads
  // the (potentially empty) input value.
  document.addEventListener('keydown', onKeyDown, true);
  document.addEventListener('mousedown', onMouseDown);
  activeClose = close;

  return close;
}
