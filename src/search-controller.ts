import { navigate } from './app';
import { getPath } from './router';

export function openSearch(): void {
  if (getPath() === '/search') {
    focusSearch();
    return;
  }
  const input = document.getElementById(TITLEBAR_SEARCH_ID) as HTMLInputElement | null;
  const q = input?.value?.trim() ?? '';
  navigate(q ? `/search?q=${encodeURIComponent(q)}` : '/search');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => focusSearch());
  });
}

const TITLEBAR_SEARCH_ID = 'titlebar-search-input';

export function focusSearch(): void {
  const input = document.getElementById(TITLEBAR_SEARCH_ID) as HTMLInputElement | null;
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
