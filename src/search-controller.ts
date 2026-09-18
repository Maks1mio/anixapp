import { navigate } from './stores/navigation';
import { getPath } from './router';

const TITLEBAR_INPUT_ID = 'titlebar-search-input';
const SEARCH_PAGE_INPUT_ID = 'search-page-input';

export function openSearch(): void {
  window.dispatchEvent(new CustomEvent('anix:openSearchIsland'));
  requestAnimationFrame(() => {
    requestAnimationFrame(() => focusSearch());
  });
}

export function focusSearch(): void {
  const titlebar = document.getElementById(TITLEBAR_INPUT_ID) as HTMLInputElement | null;
  if (titlebar) {
    titlebar.focus();
    titlebar.setSelectionRange(0, titlebar.value.length);
    return;
  }
  const page = document.getElementById(SEARCH_PAGE_INPUT_ID) as HTMLInputElement | null;
  if (page) {
    page.focus();
    page.setSelectionRange(0, page.value.length);
    return;
  }
  if (getPath() !== '/search') {
    navigate('/search');
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
