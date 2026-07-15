import { get, writable } from 'svelte/store';
import { getPath } from '../router';
import { rendererLogger } from '../services/logger';

export type SidebarTabId = 'home' | 'overview' | 'popular' | 'collections' | 'bookmarks' | 'downloads';

export const SIDEBAR_TAB_ROOTS: Record<SidebarTabId, string> = {
  home: '/',
  overview: '/overview',
  popular: '/overview/popular',
  collections: '/collections',
  bookmarks: '/bookmarks',
  downloads: '/downloads',
};

const HREF_TO_TAB: Record<string, SidebarTabId> = {
  '/': 'home',
  '/overview': 'overview',
  '/overview/popular': 'popular',
  '/collections': 'collections',
  '/bookmarks': 'bookmarks',
  '/downloads': 'downloads',
};

/** Активная секция сайдбара (контекст навигации, включая /release и др.) */
export const activeSidebarTab = writable<SidebarTabId>('home');

const lastPaths = new Map<SidebarTabId, string>();

function initLastPaths(): void {
  for (const [id, root] of Object.entries(SIDEBAR_TAB_ROOTS)) {
    lastPaths.set(id as SidebarTabId, root);
  }
}

/** Путь явно принадлежит корню секции сайдбара (не release/search и т.п.) */
export function resolveTabFromPath(path: string): SidebarTabId | null {
  if (path === '/' || path === '') return 'home';
  if (path === '/overview') return 'overview';
  if (path === '/overview/popular' || path.startsWith('/overview/popular/')) return 'popular';
  if (path === '/collections' || path.startsWith('/collections/') || path.startsWith('/collection/')) {
    return 'collections';
  }
  if (path === '/bookmarks' || path.startsWith('/bookmarks/')) return 'bookmarks';
  if (path === '/downloads' || path.startsWith('/downloads/')) return 'downloads';
  return null;
}

export function tabIdFromHref(href: string): SidebarTabId | null {
  return HREF_TO_TAB[href] ?? null;
}

function findTabOwningPath(path: string): SidebarTabId | null {
  const current = get(activeSidebarTab);
  if (lastPaths.get(current) === path) return current;
  for (const [id, saved] of lastPaths) {
    if (saved === path && id !== current) return id;
  }
  return null;
}

export function initTabNavigation(path: string = getPath()): void {
  initLastPaths();
  const tab = resolveTabFromPath(path);
  if (tab) {
    activeSidebarTab.set(tab);
    lastPaths.set(tab, path);
  } else {
    activeSidebarTab.set('home');
    lastPaths.set('home', path);
  }
  rendererLogger.debug('tab-nav', 'init', {
    path,
    tab: get(activeSidebarTab),
    lastPaths: Object.fromEntries(lastPaths),
  });
}

/** Вызывается после смены URL (navigate, popstate, hashchange). */
export function recordTabNavigation(to: string): void {
  const explicitTab = resolveTabFromPath(to);
  const prevTab = get(activeSidebarTab);

  if (explicitTab !== null) {
    activeSidebarTab.set(explicitTab);
    lastPaths.set(explicitTab, to);
    rendererLogger.debug('tab-nav', 'record-explicit', { to, tab: explicitTab, prevTab });
    return;
  }

  const ownerTab = findTabOwningPath(to);
  if (ownerTab) {
    activeSidebarTab.set(ownerTab);
    lastPaths.set(ownerTab, to);
    rendererLogger.debug('tab-nav', 'record-owned', { to, tab: ownerTab });
    return;
  }

  lastPaths.set(prevTab, to);
  rendererLogger.debug('tab-nav', 'record-context', { to, tab: prevTab });
}

export function prepareSidebarTabSwitch(href: string): string | null {
  const tabId = tabIdFromHref(href);
  if (!tabId) return null;

  const root = SIDEBAR_TAB_ROOTS[tabId];
  const currentTab = get(activeSidebarTab);
  const from = getPath();

  if (currentTab === tabId) {
    lastPaths.set(tabId, root);
    rendererLogger.info('tab-nav', 'reset-root', { tab: tabId, root, from });
    return root;
  }

  lastPaths.set(currentTab, from);
  activeSidebarTab.set(tabId);
  const target = lastPaths.get(tabId) ?? root;
  rendererLogger.info('tab-nav', 'switch-tab', { fromTab: currentTab, toTab: tabId, from, target });
  return target;
}

export function isSidebarTabActive(href: string, path: string = getPath()): boolean {
  const tabId = tabIdFromHref(href);
  if (!tabId) return false;

  const explicitTab = resolveTabFromPath(path);
  if (explicitTab !== null) return explicitTab === tabId;

  return get(activeSidebarTab) === tabId;
}
