export type CardLayout = 'wide' | 'mini';
export type ProfileLayout = 'classic' | 'v2';

export type BookmarksTabId =
  | 'collections'
  | 'history'
  | 'favorites'
  | 'watching'
  | 'planned'
  | 'completed'
  | 'on_hold'
  | 'dropped';

const CARD_LAYOUT_KEY = 'anixapp.cardLayout';
const PROFILE_LAYOUT_KEY = 'anixapp.profileLayout';
const BOOKMARKS_DEFAULT_TAB_KEY = 'anixapp.bookmarksDefaultTab';

const BOOKMARKS_TAB_IDS: readonly BookmarksTabId[] = [
  'collections',
  'history',
  'favorites',
  'watching',
  'planned',
  'completed',
  'on_hold',
  'dropped',
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

export function getProfileLayout(): ProfileLayout {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return 'v2';
  }
  const stored = window.localStorage.getItem(PROFILE_LAYOUT_KEY);
  return stored === 'classic' ? 'classic' : 'v2';
}

export function setProfileLayout(layout: ProfileLayout): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  window.localStorage.setItem(PROFILE_LAYOUT_KEY, layout);
  window.dispatchEvent(new CustomEvent('anix:profileLayoutChanged', { detail: { layout } }));
}
