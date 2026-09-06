export type CardLayout = 'wide' | 'mini';

export type BookmarksTabId =
  | 'collections'
  | 'history'
  | 'votes'
  | 'favorites'
  | 'watching'
  | 'planned'
  | 'completed'
  | 'on_hold'
  | 'dropped';

const CARD_LAYOUT_KEY = 'anixapp.cardLayout';
const BOOKMARKS_DEFAULT_TAB_KEY = 'anixapp.bookmarksDefaultTab';
const RELEASE_FRIENDS_SORT_KEY = 'anixapp.releaseFriendsSort';
const RELEASE_FRIENDS_LAYOUT_KEY = 'anixapp.releaseFriendsLayout';

export type ReleaseFriendsSort = 'status' | 'nickname';
export type ReleaseFriendsLayout = 'grid' | 'mini';

const BOOKMARKS_TAB_IDS: readonly BookmarksTabId[] = [
  'watching',
  'planned',
  'completed',
  'on_hold',
  'dropped',
  'collections',
  'history',
  'votes',
  'favorites',
];

export const DEFAULT_BOOKMARKS_TAB: BookmarksTabId = 'collections';

export function isBookmarksTabId(value: string | null | undefined): value is BookmarksTabId {
  return !!value && (BOOKMARKS_TAB_IDS as readonly string[]).includes(value);
}

export function resolveBookmarksTab(value: string | null | undefined): BookmarksTabId {
  return isBookmarksTabId(value) ? value : DEFAULT_BOOKMARKS_TAB;
}

export function getDefaultBookmarksTab(): BookmarksTabId {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return DEFAULT_BOOKMARKS_TAB;
  }
  return resolveBookmarksTab(window.localStorage.getItem(BOOKMARKS_DEFAULT_TAB_KEY));
}

export function setDefaultBookmarksTab(tabId: string): BookmarksTabId {
  const next = resolveBookmarksTab(tabId);
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return next;
  window.localStorage.setItem(BOOKMARKS_DEFAULT_TAB_KEY, next);
  window.dispatchEvent(new CustomEvent('anix:bookmarksDefaultTabChanged', { detail: { tabId: next } }));
  return next;
}

export function getCardLayout(): CardLayout {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return 'wide';
  }
  const stored = window.localStorage.getItem(CARD_LAYOUT_KEY);
  return stored === 'mini' ? 'mini' : 'wide';
}

export function setCardLayout(layout: CardLayout): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  window.localStorage.setItem(CARD_LAYOUT_KEY, layout);
  window.dispatchEvent(new CustomEvent('anix:cardLayoutChanged', { detail: { layout } }));
}

export function getReleaseFriendsSort(): ReleaseFriendsSort {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return 'status';
  }
  return window.localStorage.getItem(RELEASE_FRIENDS_SORT_KEY) === 'nickname'
    ? 'nickname'
    : 'status';
}

export function setReleaseFriendsSort(sort: ReleaseFriendsSort): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  window.localStorage.setItem(RELEASE_FRIENDS_SORT_KEY, sort);
  window.dispatchEvent(new CustomEvent('anix:releaseFriendsSortChanged', { detail: { sort } }));
}

export function getReleaseFriendsLayout(): ReleaseFriendsLayout {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return 'grid';
  }
  return window.localStorage.getItem(RELEASE_FRIENDS_LAYOUT_KEY) === 'mini'
    ? 'mini'
    : 'grid';
}

export function setReleaseFriendsLayout(layout: ReleaseFriendsLayout): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  window.localStorage.setItem(RELEASE_FRIENDS_LAYOUT_KEY, layout);
  window.dispatchEvent(new CustomEvent('anix:releaseFriendsLayoutChanged', { detail: { layout } }));
}
