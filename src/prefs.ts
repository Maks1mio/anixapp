import {
  SIDEBAR_NAV_IDS,
  SIDEBAR_NAV_ITEMS,
  SIDEBAR_PINS_SOURCE_OPTIONS,
  SIDEBAR_NAV_FOLDER_ICON_OPTIONS,
  collectPlacedNavIds,
  createSidebarNavFolder,
  type SidebarNavEntry,
  type SidebarNavFolderDef,
  type SidebarNavFolderIconId,
  type SidebarNavId,
  type SidebarNavPlacement,
  type SidebarPinsPlacement,
  type SidebarPinsSource,
} from './constants/sidebar-nav';

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

const SCHEDULE_PANEL_WIDTH_KEY = 'anixapp.schedulePanelWidth';
const PROFILE_PANEL_WIDTH_KEY = 'anixapp.profilePanelWidth';

/** Дефолты: 22rem / 26rem при 16px root */
export const DEFAULT_SCHEDULE_PANEL_WIDTH_PX = 352;
export const DEFAULT_PROFILE_PANEL_WIDTH_PX = 416;
export const SIDEBAR_PANEL_WIDTH_MIN_PX = 380;
export const SIDEBAR_PANEL_WIDTH_MAX_PX = 720;

function readPanelWidthPx(key: string, fallback: number): number {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return fallback;
  }
  const raw = Number(window.localStorage.getItem(key));
  if (!Number.isFinite(raw)) return fallback;
  return clampSidebarPanelWidthPx(raw);
}

export function clampSidebarPanelWidthPx(widthPx: number): number {
  const max =
    typeof window !== 'undefined'
      ? Math.min(SIDEBAR_PANEL_WIDTH_MAX_PX, Math.max(SIDEBAR_PANEL_WIDTH_MIN_PX, window.innerWidth - 96))
      : SIDEBAR_PANEL_WIDTH_MAX_PX;
  return Math.round(Math.min(max, Math.max(SIDEBAR_PANEL_WIDTH_MIN_PX, widthPx)));
}

export function getSchedulePanelWidthPx(): number {
  return readPanelWidthPx(SCHEDULE_PANEL_WIDTH_KEY, DEFAULT_SCHEDULE_PANEL_WIDTH_PX);
}

export function setSchedulePanelWidthPx(widthPx: number): number {
  const next = clampSidebarPanelWidthPx(widthPx);
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return next;
  window.localStorage.setItem(SCHEDULE_PANEL_WIDTH_KEY, String(next));
  return next;
}

export function getProfilePanelWidthPx(): number {
  return readPanelWidthPx(PROFILE_PANEL_WIDTH_KEY, DEFAULT_PROFILE_PANEL_WIDTH_PX);
}

export function setProfilePanelWidthPx(widthPx: number): number {
  const next = clampSidebarPanelWidthPx(widthPx);
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return next;
  window.localStorage.setItem(PROFILE_PANEL_WIDTH_KEY, String(next));
  return next;
}

const SCHEDULE_INFO_DISMISSED_KEY = 'anixapp.scheduleInfoDismissed';

export function getScheduleInfoDismissed(): boolean {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return false;
  }
  return window.localStorage.getItem(SCHEDULE_INFO_DISMISSED_KEY) === '1';
}

export function setScheduleInfoDismissed(dismissed: boolean): void {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return;
  if (dismissed) window.localStorage.setItem(SCHEDULE_INFO_DISMISSED_KEY, '1');
  else window.localStorage.removeItem(SCHEDULE_INFO_DISMISSED_KEY);
}

// ── Navigation (sidebar) ─────────────────────────────────────────────────────

const SIDEBAR_NAV_LAYOUT_KEY = 'anixapp.sidebarNavLayout';
/** @deprecated migrated → SIDEBAR_NAV_LAYOUT_KEY */
const SIDEBAR_NAV_PLACEMENT_KEY = 'anixapp.sidebarNavPlacement';
const SIDEBAR_PINS_SOURCE_KEY = 'anixapp.sidebarPinsSource';
const SIDEBAR_PINS_PLACEMENT_KEY = 'anixapp.sidebarPinsPlacement';

export type SidebarNavPlacementMap = Record<SidebarNavId, SidebarNavPlacement>;

export interface SidebarNavLayout {
  left: SidebarNavEntry[];
  right: SidebarNavEntry[];
}

export const DEFAULT_SIDEBAR_NAV_LAYOUT: SidebarNavLayout = {
  left: SIDEBAR_NAV_IDS.map((id) => ({ kind: 'item' as const, id })),
  right: [],
};

export const DEFAULT_SIDEBAR_NAV_PLACEMENT: SidebarNavPlacementMap = Object.fromEntries(
  SIDEBAR_NAV_IDS.map((id) => [id, 'left' as SidebarNavPlacement]),
) as SidebarNavPlacementMap;

export const DEFAULT_SIDEBAR_PINS_SOURCE: SidebarPinsSource = 'favorites';
export const DEFAULT_SIDEBAR_PINS_PLACEMENT: SidebarPinsPlacement = 'left';

function isSidebarNavId(value: unknown): value is SidebarNavId {
  return typeof value === 'string' && (SIDEBAR_NAV_IDS as readonly string[]).includes(value);
}

function isSidebarFolderIconId(value: unknown): value is SidebarNavFolderIconId {
  return typeof value === 'string'
    && SIDEBAR_NAV_FOLDER_ICON_OPTIONS.some((o) => o.id === value);
}

function isSidebarPinsSource(value: unknown): value is SidebarPinsSource {
  return typeof value === 'string'
    && SIDEBAR_PINS_SOURCE_OPTIONS.some((o) => o.id === value);
}

function isSidebarPinsPlacement(value: unknown): value is SidebarPinsPlacement {
  return value === 'left' || value === 'right' || value === 'none';
}

function sanitizeNavIds(ids: unknown): SidebarNavId[] {
  if (!Array.isArray(ids)) return [];
  const out: SidebarNavId[] = [];
  const seen = new Set<SidebarNavId>();
  for (const raw of ids) {
    if (!isSidebarNavId(raw) || seen.has(raw)) continue;
    seen.add(raw);
    out.push(raw);
  }
  return out;
}

function sanitizeFolder(raw: unknown, usedIds: Set<SidebarNavId>): SidebarNavFolderDef | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const id = typeof obj.id === 'string' && obj.id.startsWith('folder_')
    ? obj.id
    : createSidebarNavFolder().id;
  const name = typeof obj.name === 'string' && obj.name.trim()
    ? obj.name.trim().slice(0, 32)
    : 'Папка';
  const icon = isSidebarFolderIconId(obj.icon) ? obj.icon : 'folder';
  const children = sanitizeNavIds(obj.children).filter((cid) => {
    if (usedIds.has(cid)) return false;
    usedIds.add(cid);
    return true;
  });
  return { id, name, icon, children };
}

function sanitizeEntries(raw: unknown, usedIds: Set<SidebarNavId>): SidebarNavEntry[] {
  if (!Array.isArray(raw)) return [];
  const out: SidebarNavEntry[] = [];
  const usedFolderIds = new Set<string>();

  for (const entry of raw) {
    // Legacy: plain id string
    if (isSidebarNavId(entry)) {
      if (usedIds.has(entry)) continue;
      usedIds.add(entry);
      out.push({ kind: 'item', id: entry });
      continue;
    }
    if (!entry || typeof entry !== 'object') continue;
    const obj = entry as Record<string, unknown>;

    if (obj.kind === 'folder' || obj.folder || (typeof obj.id === 'string' && String(obj.id).startsWith('folder_'))) {
      const folderRaw = obj.folder && typeof obj.folder === 'object' ? obj.folder : obj;
      const folder = sanitizeFolder(folderRaw, usedIds);
      if (!folder || usedFolderIds.has(folder.id)) continue;
      usedFolderIds.add(folder.id);
      out.push({ kind: 'folder', folder });
      continue;
    }

    const id = obj.kind === 'item' ? obj.id : obj.id;
    if (!isSidebarNavId(id) || usedIds.has(id)) continue;
    usedIds.add(id);
    out.push({ kind: 'item', id });
  }

  return out;
}

function normalizeSidebarNavLayout(input: Partial<SidebarNavLayout> | null | undefined): SidebarNavLayout {
  const usedIds = new Set<SidebarNavId>();
  const left = sanitizeEntries(input?.left, usedIds);
  const right = sanitizeEntries(input?.right, usedIds);
  if (left.length === 0 && right.length === 0) {
    return {
      left: DEFAULT_SIDEBAR_NAV_LAYOUT.left.map((e) => ({ ...e })),
      right: [],
    };
  }
  return { left, right };
}

function migratePlacementToLayout(): SidebarNavLayout | null {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SIDEBAR_NAV_PLACEMENT_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const left: SidebarNavEntry[] = [];
    const right: SidebarNavEntry[] = [];
    for (const id of SIDEBAR_NAV_IDS) {
      const v = parsed[id];
      if (v === 'right') right.push({ kind: 'item', id });
      else if (v === 'left') left.push({ kind: 'item', id });
    }
    return normalizeSidebarNavLayout({ left, right });
  } catch {
    return null;
  }
}

export function getSidebarNavLayout(): SidebarNavLayout {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return {
      left: DEFAULT_SIDEBAR_NAV_LAYOUT.left.map((e) => ({ ...e })),
      right: [],
    };
  }
  try {
    const raw = window.localStorage.getItem(SIDEBAR_NAV_LAYOUT_KEY);
    if (raw) {
      return normalizeSidebarNavLayout(JSON.parse(raw) as Partial<SidebarNavLayout>);
    }
  } catch {
    /* fall through */
  }
  const migrated = migratePlacementToLayout();
  if (migrated) {
    setSidebarNavLayout(migrated);
    return migrated;
  }
  return {
    left: DEFAULT_SIDEBAR_NAV_LAYOUT.left.map((e) => ({ ...e })),
    right: [],
  };
}

export function setSidebarNavLayout(next: SidebarNavLayout): SidebarNavLayout {
  const normalized = normalizeSidebarNavLayout(next);
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    window.localStorage.setItem(SIDEBAR_NAV_LAYOUT_KEY, JSON.stringify(normalized));
    window.localStorage.removeItem(SIDEBAR_NAV_PLACEMENT_KEY);
    window.dispatchEvent(new CustomEvent('anix:sidebarNavPrefsChanged', { detail: { layout: normalized } }));
  }
  return normalized;
}

const SIDEBAR_DEFAULT_NAV_KEY = 'anixapp.sidebarDefaultNavId';

export function getSidebarDefaultNavId(): SidebarNavId {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return 'home';
  }
  const raw = window.localStorage.getItem(SIDEBAR_DEFAULT_NAV_KEY);
  return isSidebarNavId(raw) ? raw : 'home';
}

export function setSidebarDefaultNavId(id: SidebarNavId): SidebarNavId {
  const next = isSidebarNavId(id) ? id : 'home';
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    window.localStorage.setItem(SIDEBAR_DEFAULT_NAV_KEY, next);
    window.dispatchEvent(new CustomEvent('anix:sidebarDefaultNavChanged', { detail: { id: next } }));
  }
  return next;
}

export function getSidebarDefaultNavHref(): string {
  const id = getSidebarDefaultNavId();
  return SIDEBAR_NAV_ITEMS.find((item) => item.id === id)?.href ?? '/';
}

/** @deprecated use getSidebarNavLayout */
export function getSidebarNavPlacement(): SidebarNavPlacementMap {
  const layout = getSidebarNavLayout();
  const map = { ...DEFAULT_SIDEBAR_NAV_PLACEMENT };
  for (const id of SIDEBAR_NAV_IDS) map[id] = 'hidden';
  for (const id of collectPlacedNavIds(layout.left)) map[id] = 'left';
  for (const id of collectPlacedNavIds(layout.right)) map[id] = 'right';
  return map;
}

/** @deprecated use setSidebarNavLayout */
export function setSidebarNavPlacement(next: SidebarNavPlacementMap): SidebarNavPlacementMap {
  const left: SidebarNavEntry[] = [];
  const right: SidebarNavEntry[] = [];
  for (const id of SIDEBAR_NAV_IDS) {
    if (next[id] === 'right') right.push({ kind: 'item', id });
    else if (next[id] === 'left') left.push({ kind: 'item', id });
  }
  setSidebarNavLayout({ left, right });
  return getSidebarNavPlacement();
}

/** @deprecated use setSidebarNavLayout */
export function setSidebarNavItemPlacement(
  id: SidebarNavId,
  placement: SidebarNavPlacement,
): SidebarNavPlacementMap {
  const layout = getSidebarNavLayout();
  const strip = (entries: SidebarNavEntry[]) => entries
    .map((entry) => {
      if (entry.kind === 'item') return entry.id === id ? null : entry;
      return {
        kind: 'folder' as const,
        folder: {
          ...entry.folder,
          children: entry.folder.children.filter((cid) => cid !== id),
        },
      };
    })
    .filter((e): e is SidebarNavEntry => e != null);
  let left = strip(layout.left);
  let right = strip(layout.right);
  if (placement === 'left') left = [...left, { kind: 'item', id }];
  if (placement === 'right') right = [...right, { kind: 'item', id }];
  setSidebarNavLayout({ left, right });
  return getSidebarNavPlacement();
}

export function getSidebarPinsSource(): SidebarPinsSource {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return DEFAULT_SIDEBAR_PINS_SOURCE;
  }
  const raw = window.localStorage.getItem(SIDEBAR_PINS_SOURCE_KEY);
  // Старое «none» мигрирует в placement; контент по умолчанию — избранное.
  if (raw === 'none') return DEFAULT_SIDEBAR_PINS_SOURCE;
  return isSidebarPinsSource(raw) ? raw : DEFAULT_SIDEBAR_PINS_SOURCE;
}

export function setSidebarPinsSource(source: SidebarPinsSource): SidebarPinsSource {
  const next = source === 'none'
    ? DEFAULT_SIDEBAR_PINS_SOURCE
    : (isSidebarPinsSource(source) ? source : DEFAULT_SIDEBAR_PINS_SOURCE);
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    window.localStorage.setItem(SIDEBAR_PINS_SOURCE_KEY, next);
    window.dispatchEvent(new CustomEvent('anix:sidebarPinsPrefsChanged', { detail: { source: next } }));
  }
  return next;
}

export function getSidebarPinsPlacement(): SidebarPinsPlacement {
  if (typeof window === 'undefined' || typeof window.localStorage === 'undefined') {
    return DEFAULT_SIDEBAR_PINS_PLACEMENT;
  }
  const raw = window.localStorage.getItem(SIDEBAR_PINS_PLACEMENT_KEY);
  if (isSidebarPinsPlacement(raw)) return raw;
  // Миграция: раньше «Не показывать» жило в source === 'none'.
  const legacySource = window.localStorage.getItem(SIDEBAR_PINS_SOURCE_KEY);
  if (legacySource === 'none') {
    setSidebarPinsPlacement('none');
    setSidebarPinsSource(DEFAULT_SIDEBAR_PINS_SOURCE);
    return 'none';
  }
  return DEFAULT_SIDEBAR_PINS_PLACEMENT;
}

export function setSidebarPinsPlacement(placement: SidebarPinsPlacement): SidebarPinsPlacement {
  const next = isSidebarPinsPlacement(placement) ? placement : DEFAULT_SIDEBAR_PINS_PLACEMENT;
  if (typeof window !== 'undefined' && typeof window.localStorage !== 'undefined') {
    window.localStorage.setItem(SIDEBAR_PINS_PLACEMENT_KEY, next);
    window.dispatchEvent(new CustomEvent('anix:sidebarPinsPrefsChanged', {
      detail: { placement: next },
    }));
  }
  return next;
}

export type SidebarNavRailEntry =
  | { kind: 'item'; item: (typeof SIDEBAR_NAV_ITEMS)[number] }
  | {
    kind: 'folder';
    id: string;
    name: string;
    iconId: SidebarNavFolderIconId;
    children: Array<(typeof SIDEBAR_NAV_ITEMS)[number]>;
  };

export function getSidebarNavEntriesForSide(side: 'left' | 'right'): SidebarNavRailEntry[] {
  const layout = getSidebarNavLayout();
  const entries = side === 'left' ? layout.left : layout.right;
  const out: SidebarNavRailEntry[] = [];
  for (const entry of entries) {
    if (entry.kind === 'item') {
      const item = SIDEBAR_NAV_ITEMS.find((it) => it.id === entry.id);
      if (item) out.push({ kind: 'item', item });
      continue;
    }
    const children = entry.folder.children
      .map((id) => SIDEBAR_NAV_ITEMS.find((it) => it.id === id))
      .filter((it): it is (typeof SIDEBAR_NAV_ITEMS)[number] => !!it);
    out.push({
      kind: 'folder',
      id: entry.folder.id,
      name: entry.folder.name,
      iconId: entry.folder.icon,
      children,
    });
  }
  return out;
}

/** Сторона нижнего блока (Команда / Discord / Telegram / Boosty). */
export function getSidebarNavChromeSide(): 'left' | 'right' {
  const layout = getSidebarNavLayout();
  return layout.left.length > 0 ? 'left' : 'right';
}

/** @deprecated use getSidebarNavEntriesForSide */
export function getSidebarNavItemsForSide(side: 'left' | 'right') {
  return getSidebarNavEntriesForSide(side).flatMap((entry) => {
    if (entry.kind === 'item') return [entry.item];
    return entry.children;
  });
}

export type {
  SidebarNavId,
  SidebarNavPlacement,
  SidebarPinsPlacement,
  SidebarPinsSource,
  SidebarNavEntry,
  SidebarNavFolderDef,
  SidebarNavFolderIconId,
};
