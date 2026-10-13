import { navigate } from '../stores/navigation';
import { getPath } from '../router';

/** Открыть поиск ленты по хэштегу. */
export function openFeedHashtagSearch(raw: string): void {
  const q = String(raw ?? '').replace(/^#/, '').trim();
  if (!q) return;
  if (getPath() === '/feed') {
    window.dispatchEvent(new CustomEvent('anix:feed-search', { detail: { q } }));
    return;
  }
  navigate(`/feed?q=${encodeURIComponent(q)}`);
}
