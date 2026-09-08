import { navigate } from '../stores/navigation';
import { getPath, getSearchParams } from '../router';

/** Открыть поиск ленты по хэштегу. */
export function openFeedHashtagSearch(raw: string): void {
  const q = String(raw ?? '').replace(/^#/, '').trim();
  if (!q) return;
  const path = `/feed?q=${encodeURIComponent(q)}`;
  if (getPath() === '/feed' && getSearchParams().get('q') === q) {
    window.dispatchEvent(new CustomEvent('anix:feed-search', { detail: { q } }));
    return;
  }
  navigate(path);
  window.dispatchEvent(new CustomEvent('anix:feed-search', { detail: { q } }));
}
