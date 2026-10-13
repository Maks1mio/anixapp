import {
  collectPlacedNavIds,
  createSidebarNavFolder,
  type SidebarNavEntry,
  type SidebarNavFolderDef,
  type SidebarNavFolderIconId,
  type SidebarNavId,
} from '../constants/sidebar-nav';
import type { SidebarNavLayout } from '../prefs';

export function cloneLayout(layout: SidebarNavLayout): SidebarNavLayout {
  return {
    left: layout.left.map(cloneEntry),
    right: layout.right.map(cloneEntry),
  };
}

function cloneEntry(entry: SidebarNavEntry): SidebarNavEntry {
  if (entry.kind === 'item') return { kind: 'item', id: entry.id };
  return {
    kind: 'folder',
    folder: {
      ...entry.folder,
      children: [...entry.folder.children],
    },
  };
}

export function placedIdsOf(layout: SidebarNavLayout): Set<SidebarNavId> {
  return new Set([
    ...collectPlacedNavIds(layout.left),
    ...collectPlacedNavIds(layout.right),
  ]);
}

/** Убрать вкладку отовсюду (топ-уровень и папки). */
export function stripNavId(layout: SidebarNavLayout, id: SidebarNavId): SidebarNavLayout {
  const mapSide = (entries: SidebarNavEntry[]) => entries
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

  return { left: mapSide(layout.left), right: mapSide(layout.right) };
}

export function stripFolder(layout: SidebarNavLayout, folderId: string): {
  layout: SidebarNavLayout;
  folder: SidebarNavFolderDef | null;
  side: 'left' | 'right' | null;
  index: number;
} {
  for (const side of ['left', 'right'] as const) {
    const idx = layout[side].findIndex((e) => e.kind === 'folder' && e.folder.id === folderId);
    if (idx < 0) continue;
    const entry = layout[side][idx];
    if (entry.kind !== 'folder') continue;
    const next = cloneLayout(layout);
    next[side] = next[side].filter((_, i) => i !== idx);
    return { layout: next, folder: entry.folder, side, index: idx };
  }
  return { layout: cloneLayout(layout), folder: null, side: null, index: -1 };
}

export function insertEntryAt(
  entries: SidebarNavEntry[],
  entry: SidebarNavEntry,
  index: number | null,
): SidebarNavEntry[] {
  const next = [...entries];
  const at = index == null || index < 0 || index > next.length ? next.length : index;
  next.splice(at, 0, entry);
  return next;
}

export function addFolderToSide(
  layout: SidebarNavLayout,
  side: 'left' | 'right',
  folder = createSidebarNavFolder(),
): SidebarNavLayout {
  const next = cloneLayout(layout);
  next[side] = [...next[side], { kind: 'folder', folder }];
  return next;
}

export function updateFolder(
  layout: SidebarNavLayout,
  folderId: string,
  patch: Partial<Pick<SidebarNavFolderDef, 'name' | 'icon' | 'children'>>,
): SidebarNavLayout {
  const next = cloneLayout(layout);
  for (const side of ['left', 'right'] as const) {
    next[side] = next[side].map((entry) => {
      if (entry.kind !== 'folder' || entry.folder.id !== folderId) return entry;
      return {
        kind: 'folder',
        folder: {
          ...entry.folder,
          ...patch,
          children: patch.children ? [...patch.children] : [...entry.folder.children],
          name: patch.name != null ? (patch.name.trim() || entry.folder.name) : entry.folder.name,
        },
      };
    });
  }
  return next;
}

export function findFolder(
  layout: SidebarNavLayout,
  folderId: string,
): SidebarNavFolderDef | null {
  for (const entry of [...layout.left, ...layout.right]) {
    if (entry.kind === 'folder' && entry.folder.id === folderId) return entry.folder;
  }
  return null;
}

/** После удаления элемента слева от точки вставки индекс сдвигается на −1. */
function adjustInsertAfterRemove(fromIndex: number, toIndex: number | null): number | null {
  if (toIndex == null) return null;
  if (fromIndex >= 0 && fromIndex < toIndex) return toIndex - 1;
  return toIndex;
}

export function putItemInFolder(
  layout: SidebarNavLayout,
  folderId: string,
  itemId: SidebarNavId,
  childIndex: number | null = null,
): SidebarNavLayout {
  const before = findFolder(layout, folderId);
  const fromIndex = before?.children.indexOf(itemId) ?? -1;
  let next = stripNavId(layout, itemId);
  next = updateFolder(next, folderId, {
    children: (() => {
      const folder = [...next.left, ...next.right].find(
        (e): e is Extract<SidebarNavEntry, { kind: 'folder' }> =>
          e.kind === 'folder' && e.folder.id === folderId,
      )?.folder;
      const kids = [...(folder?.children ?? [])].filter((id) => id !== itemId);
      const adjusted = adjustInsertAfterRemove(fromIndex, childIndex);
      const at = adjusted == null || adjusted < 0 || adjusted > kids.length
        ? kids.length
        : adjusted;
      kids.splice(at, 0, itemId);
      return kids;
    })(),
  });
  return next;
}

export function putItemOnSide(
  layout: SidebarNavLayout,
  side: 'left' | 'right',
  itemId: SidebarNavId,
  index: number | null = null,
): SidebarNavLayout {
  let fromIndex = -1;
  const top = layout[side].findIndex((e) => e.kind === 'item' && e.id === itemId);
  if (top >= 0) fromIndex = top;

  let next = stripNavId(layout, itemId);
  const at = adjustInsertAfterRemove(fromIndex, index);
  next = {
    ...next,
    [side]: insertEntryAt(next[side], { kind: 'item', id: itemId }, at),
  };
  return next;
}

export function moveFolderToSide(
  layout: SidebarNavLayout,
  folderId: string,
  side: 'left' | 'right',
  index: number | null = null,
): SidebarNavLayout {
  const stripped = stripFolder(layout, folderId);
  if (!stripped.folder) return layout;
  const next = stripped.layout;
  const at = stripped.side === side
    ? adjustInsertAfterRemove(stripped.index, index)
    : index;
  next[side] = insertEntryAt(
    next[side],
    { kind: 'folder', folder: stripped.folder },
    at,
  );
  return next;
}

/** Удалить папку, вложенные вкладки вернуть на ту же панель на место папки. */
export function dissolveFolder(layout: SidebarNavLayout, folderId: string): SidebarNavLayout {
  const stripped = stripFolder(layout, folderId);
  if (!stripped.folder || !stripped.side) return layout;
  const next = stripped.layout;
  const inserts: SidebarNavEntry[] = stripped.folder.children.map((id) => ({
    kind: 'item' as const,
    id,
  }));
  next[stripped.side] = [
    ...next[stripped.side].slice(0, stripped.index),
    ...inserts,
    ...next[stripped.side].slice(stripped.index),
  ];
  return next;
}

export function setFolderIcon(
  layout: SidebarNavLayout,
  folderId: string,
  icon: SidebarNavFolderIconId,
): SidebarNavLayout {
  return updateFolder(layout, folderId, { icon });
}

export function setFolderName(
  layout: SidebarNavLayout,
  folderId: string,
  name: string,
): SidebarNavLayout {
  return updateFolder(layout, folderId, { name });
}

/** Хотя бы одна панель должна содержать элементы. */
export function isSidebarNavLayoutViable(layout: SidebarNavLayout): boolean {
  return layout.left.length > 0 || layout.right.length > 0;
}

/**
 * Сторона «хрома» (Discord / Telegram / Boosty / Команда): слева, пока там есть вкладки;
 * если левая пуста — на правой.
 */
export function getSidebarNavChromeSide(layout: SidebarNavLayout): 'left' | 'right' {
  return layout.left.length > 0 ? 'left' : 'right';
}
