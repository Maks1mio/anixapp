import { navigate } from './stores/navigation';
import { getPath } from './router';

export function openSearch(): void {
  if (getPath() === '/search') {
    focusSearch();
    return;
  }
  navigate('/search');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => focusSearch());
  });
}

const SEARCH_PAGE_INPUT_ID = 'search-page-input';

export function focusSearch(): void {
  const input = document.getElementById(SEARCH_PAGE_INPUT_ID) as HTMLInputElement | null;
  if (input) {
    input.focus();
    input.setSelectionRange(0, input.value.length);
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

    if (e.key === '/' && !isInputFocused()) {
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
