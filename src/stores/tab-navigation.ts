import { get, writable } from 'svelte/store';
import { getPath, getSearchParams } from '../router';
import { rendererLogger } from '../services/logger';

export type SidebarTabId = 'home' | 'overview' | 'fluo' | 'popular' | 'collections' | 'bookmarks' | 'downloads';
export type IndependentTabId = 'favorites' | 'search';
export type NavigationContextId = SidebarTabId | IndependentTabId;

export const SIDEBAR_TAB_ROOTS: Record<SidebarTabId, string> = {
  home: '/',
  overview: '/overview',
  fluo: '/fluo',
  popular: '/overview/popular',
  collections: '/collections',
  bookmarks: '/bookmarks',
  downloads: '/downloads',
};

const HREF_TO_TAB: Record<string, SidebarTabId> = {
  '/': 'home',
  '/overview': 'overview',
  '/fluo': 'fluo',
  '/overview/popular': 'popular',
  '/collections': 'collections',
  '/bookmarks': 'bookmarks',
  '/downloads': 'downloads',
};

/** Активный навигационный контекст, включая независимые Избранное и Поиск. */
export const activeNavigationContext = writable<NavigationContextId>('home');
/** Совместимость для существующего Layout. */
export const activeSidebarTab = activeNavigationContext;

const lastPaths = new Map<NavigationContextId, string>();

function getCurrentRoute(): string {
  const path = getPath();
  const query = getSearchParams().toString();
  return query ? `${path}?${query}` : path;
}

function initLastPaths(): void {
  for (const [id, root] of Object.entries(SIDEBAR_TAB_ROOTS)) {
    lastPaths.set(id as SidebarTabId, root);
  }
  lastPaths.set('favorites', '/bookmarks?tab=favorites');
  lastPaths.set('search', '/search');
}

/** Путь явно принадлежит корню секции сайдбара (не release/search и т.п.) */
export function resolveTabFromPath(path: string): NavigationContextId | null {
  const pathname = path.split('?')[0] || '/';
  if (pathname === '/' || pathname === '') return 'home';
  if (pathname === '/overview') return 'overview';
  if (pathname === '/fluo' || pathname.startsWith('/fluo/')) return 'fluo';
  if (pathname === '/overview/popular' || pathname.startsWith('/overview/popular/')) return 'popular';
  if (pathname === '/collections' || pathname.startsWith('/collections/') || pathname.startsWith('/collection/')) {
    return 'collections';
  }
  if (pathname === '/bookmarks' || pathname.startsWith('/bookmarks/')) return 'bookmarks';
  if (pathname === '/downloads' || pathname.startsWith('/downloads/')) return 'downloads';
  if (pathname === '/search') return 'search';
  return null;
}

export function tabIdFromHref(href: string): SidebarTabId | null {
  return HREF_TO_TAB[href] ?? null;
}

function findTabOwningPath(path: string): NavigationContextId | null {
  const current = get(activeNavigationContext);
  if (lastPaths.get(current) === path) return current;
  for (const [id, saved] of lastPaths) {
    if (saved === path && id !== current) return id;
  }
  return null;
}

export function initTabNavigation(path: string = getPath()): void {
  initLastPaths();
  const initialPath = path.includes('?') || path !== getPath() ? path : getCurrentRoute();
  const tab = resolveTabFromPath(initialPath);
  if (tab) {
    activeSidebarTab.set(tab);
    lastPaths.set(tab, initialPath);
  } else {
    activeSidebarTab.set('home');
    lastPaths.set('home', initialPath);
  }
  rendererLogger.debug('tab-nav', 'init', {
    path: initialPath,
    tab: get(activeSidebarTab),
    lastPaths: Object.fromEntries(lastPaths),
  });
}

/** Вызывается после смены URL (navigate, popstate, hashchange). */
export function recordTabNavigation(to: string): void {
  const effectiveTo = to.includes('?') || to !== getPath() ? to : getCurrentRoute();
  const explicitTab = resolveTabFromPath(effectiveTo);
  const prevTab = get(activeSidebarTab);

  if (explicitTab !== null) {
    activeSidebarTab.set(explicitTab);
    lastPaths.set(explicitTab, effectiveTo);
    rendererLogger.debug('tab-nav', 'record-explicit', { to: effectiveTo, tab: explicitTab, prevTab });
    return;
  }

  const ownerTab = findTabOwningPath(effectiveTo);
  if (ownerTab) {
    activeSidebarTab.set(ownerTab);
    lastPaths.set(ownerTab, effectiveTo);
    rendererLogger.debug('tab-nav', 'record-owned', { to: effectiveTo, tab: ownerTab });
    return;
  }

  lastPaths.set(prevTab, effectiveTo);
  rendererLogger.debug('tab-nav', 'record-context', { to: effectiveTo, tab: prevTab });
}

export function prepareSidebarTabSwitch(href: string): string | null {
  const tabId = tabIdFromHref(href);
  if (!tabId) return null;

  const root = SIDEBAR_TAB_ROOTS[tabId];
  const currentTab = get(activeSidebarTab);
  const from = getCurrentRoute();

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

/** Открывает конкретный путь в независимом контексте (например, пин Избранного). */
export function prepareIndependentNavigation(tabId: IndependentTabId, target: string): string {
  const currentTab = get(activeNavigationContext);
  const from = getCurrentRoute();
  if (currentTab !== tabId) lastPaths.set(currentTab, from);
  activeNavigationContext.set(tabId);
  lastPaths.set(tabId, target);
  rendererLogger.info('tab-nav', 'open-independent', {
    fromTab: currentTab,
    toTab: tabId,
    from,
    target,
  });
  return target;
}

/** Переключает независимую вкладку, восстанавливая её последний путь. */
export function prepareIndependentTabSwitch(tabId: IndependentTabId, root: string): string {
  const currentTab = get(activeNavigationContext);
  const from = getCurrentRoute();

  if (currentTab === tabId) {
    lastPaths.set(tabId, root);
    return root;
  }

  lastPaths.set(currentTab, from);
  activeNavigationContext.set(tabId);
  const target = lastPaths.get(tabId) ?? root;
  rendererLogger.info('tab-nav', 'switch-independent', {
    fromTab: currentTab,
    toTab: tabId,
    from,
    target,
  });
  return target;
}

export function isIndependentTabActive(tabId: IndependentTabId): boolean {
  return get(activeNavigationContext) === tabId;
}

export function isSidebarTabActive(href: string, path: string = getPath()): boolean {
  const tabId = tabIdFromHref(href);
  if (!tabId) return false;

  const explicitTab = resolveTabFromPath(path);
  if (explicitTab !== null) return explicitTab === tabId;

  return get(activeSidebarTab) === tabId;
}
