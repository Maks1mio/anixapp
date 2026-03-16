import { renderFeed } from './views/feed';
import { renderRelease } from './views/release';
import { renderRelated } from './views/related';
import { renderHome } from './views/home';
import { renderUikit } from './views/uikit';
import { renderCatalog } from './views/catalog';
import { renderBookmarks } from './views/bookmarks';
import { renderNotifications } from './views/notifications';
import { renderProfile } from './views/profile';
import { renderSearch } from './views/search';
import { renderCollection } from './views/collection';
import { renderWatch } from './views/watch';

/** Путь: в prod (file://) pathname — полный путь к файлу, поэтому опираемся на hash. Всегда с ведущим /. */
export function getPath(): string {
  const hash = window.location.hash || '';
  if (hash.startsWith('#/')) {
    const pathPart = hash.slice(2).split('?')[0]?.trim() || '';
    if (!pathPart) return '/';
    return pathPart.startsWith('/') ? pathPart : '/' + pathPart;
  }
  if (typeof window !== 'undefined' && window.location.protocol === 'file:') {
    return '/';
  }
  const p = window.location.pathname || '/';
  return p.startsWith('/') ? p : '/' + p;
}

/** Параметры страницы просмотра (из query в hash или из search) */
export function getWatchParams(): URLSearchParams {
  const hash = window.location.hash || '';
  const search = window.location.search || '';
  const fromHash = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  const fromSearch = search.startsWith('?') ? search.slice(1) : search;
  return new URLSearchParams(fromHash || fromSearch);
}

/** Query-параметры страницы: в file:// они могут быть в hash (#/path?q=...) */
function getSearchParams(): URLSearchParams {
  const hash = window.location.hash || '';
  const fromHash = hash.includes('?') ? hash.slice(hash.indexOf('?') + 1) : '';
  if (fromHash) return new URLSearchParams(fromHash);
  return new URLSearchParams(window.location.search || '');
}

function updateSidebarActive(): void {
  const path = getPath();
  document.querySelectorAll('.sidebar__link[href]').forEach((a) => {
    const el = a as HTMLAnchorElement;
    const href = el.getAttribute('href') || '';
    const isActive = href === path || (href === '/' && (path === '' || path === '/'));
    el.classList.toggle('sidebar__link--active', !!isActive);
  });
}

export function handleRoute(container: HTMLElement): void {
  const path = getPath();
  console.log('[handleRoute] path:', path, 'protocol:', typeof window !== 'undefined' ? window.location.protocol : '');
  container.innerHTML = '';

  if (path === '/' || path === '') {
    container.appendChild(renderHome());
    updateSidebarActive();
    return;
  }

  const relatedMatch = path.match(/^\/release\/(\d+)\/related$/);
  if (relatedMatch) {
    const id = parseInt(relatedMatch[1], 10);
    container.appendChild(renderRelated(id));
    updateSidebarActive();
    return;
  }

  const releaseMatch = path.match(/^\/release\/(\d+)$/);
  if (releaseMatch) {
    const id = parseInt(releaseMatch[1], 10);
    container.appendChild(renderRelease(id));
    updateSidebarActive();
    return;
  }

  if (path === '/watch') {
    container.appendChild(renderWatch());
    updateSidebarActive();
    return;
  }

  if (path === '/feed') {
    const page = parseInt(getSearchParams().get('page') || '1', 10);
    container.appendChild(renderFeed(page));
    updateSidebarActive();
    return;
  }

  if (path === '/uikit') {
    container.appendChild(renderUikit());
    updateSidebarActive();
    return;
  }

  if (path === '/catalog') {
    container.appendChild(renderCatalog());
    updateSidebarActive();
    return;
  }

  if (path === '/bookmarks') {
    container.appendChild(renderBookmarks());
    updateSidebarActive();
    return;
  }

  if (path === '/notifications') {
    container.appendChild(renderNotifications());
    updateSidebarActive();
    return;
  }

  if (path === '/profile') {
    container.appendChild(renderProfile());
    updateSidebarActive();
    return;
  }

  const profileMatch = path.match(/^\/profile\/(\d+)$/);
  if (profileMatch) {
    const id = parseInt(profileMatch[1], 10);
    container.appendChild(renderProfile(id));
    updateSidebarActive();
    return;
  }

  if (path === '/search') {
    const params = getSearchParams();
    const q = params.get('q') || '';
    const tab = params.get('tab') || 'releases';
    container.appendChild(renderSearch(q, tab as 'releases' | 'profiles' | 'collections'));
    const titlebarInput = document.getElementById('titlebar-search-input');
    if (titlebarInput instanceof HTMLInputElement && q) titlebarInput.value = q;
    updateSidebarActive();
    return;
  }

  const collectionMatch = path.match(/^\/collection\/(\d+)$/);
  if (collectionMatch) {
    const id = parseInt(collectionMatch[1], 10);
    container.appendChild(renderCollection(id));
    updateSidebarActive();
    return;
  }

  container.appendChild(renderHome());
  updateSidebarActive();
}
