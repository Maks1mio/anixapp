import { get, writable } from 'svelte/store';
import { getPath, getSearchParams } from '../router';
import { captureActiveScroll, resetScrollAfterRouteChange } from './view-state';
import {
  recordTabNavigation,
  prepareSidebarTabSwitch,
  prepareIndependentNavigation,
  prepareIndependentTabSwitch,
  tabIdFromHref,
  type IndependentTabId,
} from './tab-navigation';
import { openProfileFromPath } from './user-profile';
import { closeNotificationsModal, notificationsModalOpen } from './modals';

export const currentPath = writable<string>(getPath());

const LEGACY_FEED_POST_KEY = 'anixFeedPostId';

export type FeedHistoryView = {
  tab: string;
  channelId: number | null;
  postId: number | null;
  searchQuery?: string;
  scrollTop?: number;
};

type AnixHistoryState = {
  v: 1;
  path: string;
  query: string;
  feed: FeedHistoryView | null;
};

function splitAppRoute(path: string): { pathname: string; query: string } {
  const raw = path.startsWith('#') ? path.slice(1) : path;
  const normalized = raw.startsWith('/') ? raw : `/${raw}`;
  const q = normalized.indexOf('?');
  if (q < 0) return { pathname: normalized || '/', query: '' };
  return { pathname: normalized.slice(0, q) || '/', query: normalized.slice(q + 1) };
}

function currentAppRoute(): { pathname: string; query: string } {
  return { pathname: getPath(), query: getSearchParams().toString() };
}

export function isCurrentAppRoute(path: string): boolean {
  const dest = splitAppRoute(path);
  const cur = currentAppRoute();
  return dest.pathname === cur.pathname && dest.query === cur.query;
}

function isFeedAppPath(pathname: string): boolean {
  return pathname === '/feed';
}

export function defaultFeedHistoryView(): FeedHistoryView {
  return { tab: 'my', channelId: null, postId: null, searchQuery: '', scrollTop: 0 };
}

export function feedHistoryViewEquals(
  a: FeedHistoryView | null | undefined,
  b: FeedHistoryView | null | undefined,
): boolean {
  if (!a || !b) return a == b;
  return a.tab === b.tab
    && (a.channelId ?? null) === (b.channelId ?? null)
    && (a.postId ?? null) === (b.postId ?? null)
    && (a.searchQuery ?? '') === (b.searchQuery ?? '');
}

export function currentHistoryUrl(): string {
  return `${window.location.pathname}${window.location.search}${window.location.hash}`;
}

export function historyUrlFor(path: string): string {
  const dest = splitAppRoute(path);
  const combined = dest.query ? `${dest.pathname}?${dest.query}` : dest.pathname;
  if (window.location.protocol === 'file:') {
    const hash = combined === '/' ? '#/' : `#${combined}`;
    return `${window.location.pathname}${window.location.search}${hash}`;
  }
  return combined;
}

function readRawState(): Record<string, unknown> {
  const st = history.state;
  return st && typeof st === 'object' ? { ...(st as Record<string, unknown>) } : {};
}

function parseFeedView(raw: unknown): FeedHistoryView | null {
  if (!raw || typeof raw !== 'object') return null;
  const o = raw as Record<string, unknown>;
  const tab = String(o.tab ?? 'my') || 'my';
  const channelRaw = o.channelId == null ? null : Number(o.channelId);
  const postRaw = o.postId == null ? null : Number(o.postId);
  const scrollRaw = o.scrollTop == null ? 0 : Number(o.scrollTop);
  return {
    tab,
    channelId: channelRaw != null && Number.isFinite(channelRaw) && channelRaw > 0 ? channelRaw : null,
    postId: postRaw != null && Number.isFinite(postRaw) && postRaw > 0 ? postRaw : null,
    searchQuery: String(o.searchQuery ?? '').trim(),
    scrollTop: Number.isFinite(scrollRaw) && scrollRaw > 0 ? scrollRaw : 0,
  };
}

export function readAnixHistoryState(): AnixHistoryState | null {
  const st = history.state;
  if (!st || typeof st !== 'object') return null;
  const rec = st as Record<string, unknown>;
  const anix = rec.anix;
  if (anix && typeof anix === 'object' && (anix as { v?: unknown }).v === 1) {
    const a = anix as AnixHistoryState;
    return {
      v: 1,
      path: String(a.path || getPath()),
      query: String(a.query ?? ''),
      feed: a.feed ? parseFeedView(a.feed) : null,
    };
  }
  const legacyPost = Number(rec[LEGACY_FEED_POST_KEY]);
  if (Number.isFinite(legacyPost) && legacyPost > 0) {
    return {
      v: 1,
      path: getPath(),
      query: getSearchParams().toString(),
      feed: { ...defaultFeedHistoryView(), postId: legacyPost },
    };
  }
  return null;
}

export function readFeedHistoryView(): FeedHistoryView | null {
  return readAnixHistoryState()?.feed ?? null;
}

function writeHistory(
  mode: 'push' | 'replace',
  anix: AnixHistoryState,
  url: string,
): void {
  const prev = readRawState();
  const next: Record<string, unknown> = { ...prev, anix };
  if (anix.feed?.postId) next[LEGACY_FEED_POST_KEY] = anix.feed.postId;
  else delete next[LEGACY_FEED_POST_KEY];
  if (mode === 'push') history.pushState(next, '', url);
  else history.replaceState(next, '', url);
}

function buildAnixState(path: string, feed?: FeedHistoryView | null): AnixHistoryState {
  const dest = splitAppRoute(path);
  const prev = readAnixHistoryState();
  const onFeed = isFeedAppPath(dest.pathname);
  let nextFeed: FeedHistoryView | null = null;
  if (onFeed) {
    if (feed !== undefined) nextFeed = feed;
    else if (prev?.feed && prev.path === dest.pathname) nextFeed = prev.feed;
    else nextFeed = defaultFeedHistoryView();
  }
  return {
    v: 1,
    path: dest.pathname,
    query: dest.query,
    feed: nextFeed,
  };
}

function combinedFromLocation(): string {
  const query = getSearchParams().toString();
  const path = getPath();
  return query ? `${path}?${query}` : path;
}

/** Шаг истории внутри /feed (вкладка, канал, запись) — URL не меняется. */
export function pushFeedHistory(view: FeedHistoryView): void {
  writeHistory('push', buildAnixState(combinedFromLocation(), view), currentHistoryUrl());
}

export function replaceFeedHistory(view: FeedHistoryView): void {
  writeHistory('replace', buildAnixState(combinedFromLocation(), view), currentHistoryUrl());
}

/** Первая запись, чтобы «назад/вперёд» всегда читали anix-state. */
export function seedAnixHistory(): void {
  if (readAnixHistoryState()) return;
  writeHistory('replace', buildAnixState(combinedFromLocation()), currentHistoryUrl());
}

function commitLocation(path: string, mode: 'push' | 'replace', extraState?: unknown): void {
  const dest = splitAppRoute(path);
  const combined = dest.query ? `${dest.pathname}?${dest.query}` : dest.pathname;
  const anix = buildAnixState(combined);
  const extra = extraState && typeof extraState === 'object' && extraState !== null
    ? extraState as Record<string, unknown>
    : {};
  const next: Record<string, unknown> = { ...readRawState(), ...extra, anix };
  if (anix.feed?.postId) next[LEGACY_FEED_POST_KEY] = anix.feed.postId;
  else delete next[LEGACY_FEED_POST_KEY];
  const url = historyUrlFor(combined);
  if (mode === 'push') history.pushState(next, '', url);
  else history.replaceState(next, '', url);
}

function emitBeforeHistoryTravel(): void {
  window.dispatchEvent(new Event('anix:beforeHistoryTravel'));
}

/** Назад: сначала закрыть уведомления, иначе шаг истории (страницы и лента). */
export function goBack(): void {
  if (get(notificationsModalOpen)) {
    closeNotificationsModal();
    return;
  }
  emitBeforeHistoryTravel();
  const ev = new CustomEvent('anix:historyBack', { cancelable: true });
  window.dispatchEvent(ev);
  if (ev.defaultPrevented) return;
  window.history.back();
}

export function goForward(): void {
  emitBeforeHistoryTravel();
  const ev = new CustomEvent('anix:historyForward', { cancelable: true });
  window.dispatchEvent(ev);
  if (ev.defaultPrevented) return;
  window.history.forward();
}

export function navigate(path: string, _state?: unknown): void {
  if (openProfileFromPath(path)) return;

  if (_state == null && isCurrentAppRoute(path)) {
    window.dispatchEvent(new CustomEvent('anix:navigate', { detail: splitAppRoute(path).pathname }));
    return;
  }

  window.dispatchEvent(new CustomEvent('anix:beforeNavigate', { detail: { to: path } }));
  captureActiveScroll();

  commitLocation(path, 'push', _state);
  recordTabNavigation(path);
  window.dispatchEvent(new CustomEvent('anix:navigate', { detail: path }));
  currentPath.set(getPath());
  resetScrollAfterRouteChange();
}

/** Заменить текущий URL без новой записи в истории. */
export function replacePath(path: string): void {
  window.dispatchEvent(new CustomEvent('anix:beforeNavigate', { detail: { to: path } }));
  captureActiveScroll();

  commitLocation(path, 'replace');
  recordTabNavigation(path);
  window.dispatchEvent(new CustomEvent('anix:navigate', { detail: path }));
  currentPath.set(getPath());
  resetScrollAfterRouteChange();
}

/** Клик по сайдбару: восстановить последний путь секции или сбросить на корень при повторном клике. */
export function navigateSidebarTab(href: string): void {
  const tabId = tabIdFromHref(href);
  const target = prepareSidebarTabSwitch(href) ?? href;
  if (tabId && isCurrentAppRoute(target)) {
    window.dispatchEvent(new CustomEvent('anix:sidebarTabReset', { detail: { tab: tabId } }));
    return;
  }
  navigate(target);
}

export function navigateIndependentTab(tabId: IndependentTabId, path: string): void {
  navigate(prepareIndependentNavigation(tabId, path));
}

export function navigateSearchTab(): void {
  navigate(prepareIndependentTabSwitch('search', '/search'));
}
