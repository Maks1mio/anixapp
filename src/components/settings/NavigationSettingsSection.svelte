<script lang="ts">
  import { onMount, onDestroy, tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { crossfade, fade, scale } from 'svelte/transition';
  import { cubicOut, quintOut } from 'svelte/easing';
  import {
    SIDEBAR_NAV_ITEMS,
    SIDEBAR_NAV_FOLDER_ICON_OPTIONS,
    SIDEBAR_PINS_CONTENT_OPTIONS,
    SIDEBAR_PINS_PLACEMENT_OPTIONS,
    createSidebarNavFolder,
    sidebarNavFolderIconSvg,
    type SidebarNavEntry,
    type SidebarNavFolderIconId,
    type SidebarNavId,
    type SidebarPinsPlacement,
    type SidebarPinsSource,
  } from '../../constants/sidebar-nav';
  import {
    getSidebarNavLayout,
    setSidebarNavLayout,
    getSidebarPinsSource,
    setSidebarPinsSource,
    getSidebarPinsPlacement,
    setSidebarPinsPlacement,
    getSidebarDefaultNavId,
    setSidebarDefaultNavId,
    type SidebarNavLayout,
  } from '../../prefs';
  import {
    addFolderToSide,
    dissolveFolder,
    isSidebarNavLayoutViable,
    moveFolderToSide,
    placedIdsOf,
    putItemInFolder,
    putItemOnSide,
    setFolderIcon,
    setFolderName,
    stripNavId,
  } from '../../utils/sidebar-nav-layout';
  import {
    iconBan,
    iconBookmark,
    iconChevronLeft,
    iconChevronRight,
    iconClock,
    iconEye,
    iconCircleCheck,
    iconFolder,
    iconLayoutGrid,
    iconList,
    iconPause,
    iconPencil,
    iconPin,
    iconStar,
    iconX,
  } from '../icons';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from '../uikit-v2/UiV2PopupMenu.svelte';
  import UiV2Card from '../uikit-v2/UiV2Card.svelte';
  import UiV2RoundButton from '../uikit-v2/UiV2RoundButton.svelte';
  import { uiv2CustomScroll } from '../../actions/uiv2CustomScroll';
  import { portal } from '../../actions/portal';

  type DropZone = 'left' | 'right' | 'pool';
  type MenuTarget =
    | { type: 'item'; id: SidebarNavId }
    | { type: 'folder'; id: string };

  let layout = $state<SidebarNavLayout>(getSidebarNavLayout());
  let pinsSource = $state<SidebarPinsSource>(getSidebarPinsSource());
  let pinsPlacement = $state<SidebarPinsPlacement>(getSidebarPinsPlacement());
  let defaultNavId = $state<SidebarNavId>(getSidebarDefaultNavId());
  let reducedMotion = $state(false);

  let dragItemId = $state<SidebarNavId | null>(null);
  let dragFolderId = $state<string | null>(null);
  /** Новая папка из пула «Разделы» */
  let dragNewFolder = $state(false);
  let overZone = $state<DropZone | null>(null);
  let overIndex = $state<number | null>(null);
  let overFolderId = $state<string | null>(null);
  /** Индекс вставки среди children папки (null = в конец). */
  let overChildIndex = $state<number | null>(null);

  let menuOpen = $state(false);
  let menuX = $state(0);
  let menuY = $state(0);
  let menuTarget = $state<MenuTarget | null>(null);

  let renamingFolderId = $state<string | null>(null);
  let renameValue = $state('');
  let renameInputEl = $state<HTMLInputElement | null>(null);

  $effect(() => {
    if (!renamingFolderId || !renameInputEl) return;
    const el = renameInputEl;
    tick().then(() => {
      if (renameInputEl !== el) return;
      el.focus();
      el.select();
    });
  });

  const placed = $derived(placedIdsOf(layout));
  const dragging = $derived(!!dragItemId || !!dragFolderId || dragNewFolder);

  function railSourceIndex(side: 'left' | 'right'): number {
    const list = layout[side];
    if (dragItemId) {
      return list.findIndex((e) => e.kind === 'item' && e.id === dragItemId);
    }
    if (dragFolderId) {
      return list.findIndex((e) => e.kind === 'folder' && e.folder.id === dragFolderId);
    }
    return -1;
  }

  /** Слот-зазор в списке панели (не no-op сдвиг на соседнюю позицию). */
  function showRailDropGap(side: 'left' | 'right', at: number): boolean {
    if (!dragging || overZone !== side || overFolderId != null || overIndex !== at) return false;
    const from = railSourceIndex(side);
    if (from >= 0 && (at === from || at === from + 1)) return false;
    return true;
  }

  function showKidDropGap(folderId: string, at: number, children: SidebarNavId[]): boolean {
    if (!dragItemId || overFolderId !== folderId || overChildIndex !== at) return false;
    const from = children.indexOf(dragItemId);
    if (from >= 0 && (at === from || at === from + 1)) return false;
    return true;
  }

  const menuItems = $derived.by((): UiV2PopupMenuItem[] => {
    const target = menuTarget;
    if (!target) return [];

    if (target.type === 'item') {
      const isDefault = defaultNavId === target.id;
      return [
        {
          id: 'default',
          label: 'Открывать окно по умолчанию',
          icon: iconPin(16),
          checked: isDefault,
          type: 'radio',
          disabled: isDefault,
        },
        {
          id: 'remove',
          label: 'Убрать',
          icon: iconX(16),
          danger: true,
          dividerBefore: true,
        },
      ];
    }

    return [
      {
        id: 'rename',
        label: 'Переименовать',
        icon: iconPencil(16),
      },
      {
        id: 'icon',
        label: 'Иконка',
        icon: iconLayoutGrid(16),
      },
      {
        id: 'dissolve',
        label: 'Удалить папку',
        icon: iconX(16),
        danger: true,
        dividerBefore: true,
      },
    ];
  });

  let iconPickerOpen = $state(false);
  let iconPickerX = $state(0);
  let iconPickerY = $state(0);
  let iconPickerFolderId = $state<string | null>(null);
  let iconPickerEl = $state<HTMLDivElement | null>(null);

  const iconPickerCurrent = $derived.by((): SidebarNavFolderIconId => {
    const id = iconPickerFolderId;
    if (!id) return 'folder';
    const folder = [...layout.left, ...layout.right].find(
      (e) => e.kind === 'folder' && e.folder.id === id,
    );
    return folder?.kind === 'folder' ? folder.folder.icon : 'folder';
  });

  const [send, receive] = crossfade({
    duration: (d) => (reducedMotion ? 0 : Math.min(Math.sqrt(d * 220), 340)),
    fallback(node) {
      const style = getComputedStyle(node);
      const transform = style.transform === 'none' ? '' : style.transform;
      return {
        duration: reducedMotion ? 0 : 260,
        easing: quintOut,
        css: (t) => `
          transform: ${transform} scale(${0.86 + 0.14 * t});
          opacity: ${t};
        `,
      };
    },
  });

  function flipMs() {
    return reducedMotion ? 0 : 300;
  }

  function itemById(id: SidebarNavId) {
    return SIDEBAR_NAV_ITEMS.find((item) => item.id === id)!;
  }

  function entryKey(entry: SidebarNavEntry): string {
    return entry.kind === 'item' ? `item:${entry.id}` : `folder:${entry.folder.id}`;
  }

  function pinsIcon(source: SidebarPinsSource): string {
    switch (source) {
      case 'none': return iconBan(18);
      case 'watching': return iconEye(18);
      case 'planned': return iconList(18);
      case 'completed': return iconCircleCheck(18);
      case 'on_hold': return iconPause(18);
      case 'dropped': return iconX(18);
      case 'collections': return iconLayoutGrid(18);
      case 'history': return iconClock(18);
      case 'votes': return iconStar(18);
      case 'favorites': return iconBookmark(18);
      default: return iconBookmark(18);
    }
  }

  function placementIcon(placement: SidebarPinsPlacement): string {
    switch (placement) {
      case 'left': return iconChevronLeft(18);
      case 'right': return iconChevronRight(18);
      default: return iconBan(18);
    }
  }

  function persist(next: SidebarNavLayout) {
    if (!isSidebarNavLayoutViable(next)) return;
    layout = setSidebarNavLayout(next);
  }

  function setPins(source: SidebarPinsSource) {
    pinsSource = setSidebarPinsSource(source);
  }

  function setPlacement(placement: SidebarPinsPlacement) {
    pinsPlacement = setSidebarPinsPlacement(placement);
  }

  const NAV_DND = 'application/x-anix-sidebar-nav';

  function setDragPayload(e: DragEvent, payload: Record<string, string>) {
    const json = JSON.stringify(payload);
    e.dataTransfer?.setData(NAV_DND, json);
    e.dataTransfer?.setData('text/plain', payload.type === 'new-folder' ? 'new-folder' : (payload.id || payload.type));
  }

  function readDropPayload(e: DragEvent): { type: string; id?: string } | null {
    try {
      const raw = e.dataTransfer?.getData(NAV_DND);
      if (raw) return JSON.parse(raw) as { type: string; id?: string };
    } catch {
      /* ignore */
    }
    const plain = e.dataTransfer?.getData('text/plain') ?? '';
    if (plain === 'new-folder') return { type: 'new-folder' };
    if (plain.startsWith('folder_')) return { type: 'folder', id: plain };
    if ((SIDEBAR_NAV_ITEMS as readonly { id: string }[]).some((it) => it.id === plain)) {
      return { type: 'item', id: plain };
    }
    return null;
  }

  function clearDrag() {
    dragItemId = null;
    dragFolderId = null;
    dragNewFolder = false;
    overZone = null;
    overIndex = null;
    overFolderId = null;
    overChildIndex = null;
    document.querySelectorAll('.nav-board__chip--ghost').forEach((el) => {
      el.classList.remove('nav-board__chip--ghost');
    });
  }

  function onItemDragStart(id: SidebarNavId, from: DropZone, e: DragEvent) {
    if (from === 'pool' && placed.has(id)) {
      e.preventDefault();
      return;
    }
    e.stopPropagation();
    if (renamingFolderId) commitRename();
    dragItemId = id;
    dragFolderId = null;
    dragNewFolder = false;
    e.dataTransfer!.effectAllowed = 'move';
    setDragPayload(e, { type: 'item', id });
    try {
      e.dataTransfer?.setDragImage(e.currentTarget as Element, 24, 24);
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => {
      (e.currentTarget as HTMLElement | null)?.classList.add('nav-board__chip--ghost');
    });
  }

  function onFolderDragStart(folderId: string, e: DragEvent) {
    e.stopPropagation();
    if (renamingFolderId === folderId) {
      e.preventDefault();
      return;
    }
    if (renamingFolderId) commitRename();
    dragFolderId = folderId;
    dragItemId = null;
    dragNewFolder = false;
    e.dataTransfer!.effectAllowed = 'move';
    setDragPayload(e, { type: 'folder', id: folderId });
    try {
      const root = (e.currentTarget as HTMLElement).closest('.nav-board__folder');
      e.dataTransfer?.setDragImage(root ?? (e.currentTarget as Element), 24, 16);
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => {
      const root = (e.currentTarget as HTMLElement | null)?.closest('.nav-board__folder');
      root?.classList.add('nav-board__chip--ghost');
    });
  }

  let suppressFolderClick = false;

  function onNewFolderDragStart(e: DragEvent) {
    suppressFolderClick = true;
    dragNewFolder = true;
    dragItemId = null;
    dragFolderId = null;
    e.dataTransfer!.effectAllowed = 'copyMove';
    setDragPayload(e, { type: 'new-folder' });
    try {
      e.dataTransfer?.setDragImage(e.currentTarget as Element, 24, 24);
    } catch {
      /* ignore */
    }
    requestAnimationFrame(() => {
      (e.currentTarget as HTMLElement | null)?.classList.add('nav-board__chip--ghost');
    });
  }

  /** Клик по «Папка» в пуле — создать ещё одну (лимита нет). */
  function onNewFolderClick() {
    if (suppressFolderClick || dragging) {
      suppressFolderClick = false;
      return;
    }
    const side = layout.left.length <= layout.right.length ? 'left' : 'right';
    insertNewFolder(side, null);
  }

  function pickFolderIcon(iconId: SidebarNavFolderIconId) {
    const folderId = iconPickerFolderId;
    if (!folderId) return;
    persist(setFolderIcon(layout, folderId, iconId));
    closeIconPicker();
  }

  function closeIconPicker() {
    iconPickerOpen = false;
    iconPickerFolderId = null;
  }

  function placeIconPicker() {
    const el = iconPickerEl;
    if (!el) return;
    const pad = 8;
    const w = el.offsetWidth || 220;
    const h = el.offsetHeight || 280;
    let left = iconPickerX;
    let top = iconPickerY;
    if (left + w > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - w - pad);
    if (top + h > window.innerHeight - pad) top = Math.max(pad, window.innerHeight - h - pad);
    if (left < pad) left = pad;
    if (top < pad) top = pad;
    el.style.left = `${left}px`;
    el.style.top = `${top}px`;
  }

  function onIconPickerWindowDown(e: MouseEvent) {
    if (!iconPickerOpen) return;
    const t = e.target as Node | null;
    if (iconPickerEl && t && iconPickerEl.contains(t)) return;
    closeIconPicker();
  }

  function onIconPickerKey(e: KeyboardEvent) {
    if (!iconPickerOpen) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      closeIconPicker();
    }
  }

  function onDragEnd() {
    clearDrag();
    // После drag клик срабатывает — гасим один раз
    if (suppressFolderClick) {
      requestAnimationFrame(() => {
        suppressFolderClick = false;
      });
    }
  }

  /** Всегда preventDefault — иначе HTML5 DnD запрещает drop. */
  function acceptDrag(e: DragEvent, dropEffect: 'move' | 'copy' = 'move') {
    e.preventDefault();
    if (e.dataTransfer) e.dataTransfer.dropEffect = dropEffect;
  }

  function onZoneDragOver(zone: DropZone, e: DragEvent) {
    acceptDrag(e, dragNewFolder ? 'copy' : 'move');
    overZone = zone;
    overFolderId = null;
    overChildIndex = null;
    if (zone === 'pool') {
      overIndex = null;
      return;
    }
    const col = (e.currentTarget as HTMLElement).closest('.nav-board__col') as HTMLElement | null
      ?? (e.currentTarget as HTMLElement);
    const slots = col.querySelectorAll<HTMLElement>('.nav-board__slot');
    if (!slots.length) {
      overIndex = 0;
      return;
    }
    const y = e.clientY;
    let next = slots.length;
    for (let i = 0; i < slots.length; i++) {
      const r = slots[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        next = i;
        break;
      }
    }
    overIndex = next;
  }

  function onSlotDragOver(zone: 'left' | 'right', index: number, e: DragEvent) {
    acceptDrag(e, dragNewFolder ? 'copy' : 'move');
    e.stopPropagation();
    overZone = zone;
    overFolderId = null;
    overChildIndex = null;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    overIndex = before ? index : index + 1;
  }

  /**
   * Над папкой: вкладку — внутрь (середина) или до/после (края);
   * другую папку — переставить до/после.
   */
  function onFolderShellDragOver(
    folderId: string,
    side: 'left' | 'right',
    index: number,
    e: DragEvent,
  ) {
    if (dragNewFolder) return;
    acceptDrag(e, 'move');
    e.stopPropagation();

    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const edge = Math.min(14, Math.max(8, rect.height * 0.18));
    const nearTop = e.clientY < rect.top + edge;
    const nearBottom = e.clientY > rect.bottom - edge;

    if (dragFolderId) {
      if (dragFolderId === folderId) return;
      overFolderId = null;
      overChildIndex = null;
      overZone = side;
      overIndex = nearTop || (!nearBottom && e.clientY < rect.top + rect.height / 2)
        ? index
        : index + 1;
      return;
    }

    // Вкладки: края слота — порядок на панели, середина — внутрь папки
    if (nearTop || nearBottom) {
      overFolderId = null;
      overChildIndex = null;
      overZone = side;
      overIndex = nearTop ? index : index + 1;
      return;
    }

    overFolderId = folderId;
    overChildIndex = null;
    overZone = null;
    overIndex = null;
  }

  function onFolderKidsDragOver(folderId: string, e: DragEvent) {
    if (dragNewFolder || dragFolderId) return;
    acceptDrag(e, 'move');
    e.stopPropagation();
    overFolderId = folderId;
    overChildIndex = null;
    overZone = null;
    overIndex = null;
  }

  function onKidDragOver(folderId: string, kidIndex: number, e: DragEvent) {
    if (dragNewFolder || dragFolderId) return;
    acceptDrag(e, 'move');
    e.stopPropagation();
    overFolderId = folderId;
    overZone = null;
    overIndex = null;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    overChildIndex = before ? kidIndex : kidIndex + 1;
  }

  function insertNewFolder(side: 'left' | 'right', index: number | null) {
    const folder = createSidebarNavFolder();
    let next = addFolderToSide(layout, side, folder);
    if (index != null) {
      const list = next[side];
      const folderEntry = list[list.length - 1];
      const without = list.slice(0, -1);
      const at = Math.max(0, Math.min(index, without.length));
      next = {
        ...next,
        [side]: [...without.slice(0, at), folderEntry, ...without.slice(at)],
      };
    }
    persist(next);
  }

  function applyDrop(zone: DropZone, index: number | null, e?: DragEvent) {
    const payload = e ? readDropPayload(e) : null;
    const isNewFolder = dragNewFolder || payload?.type === 'new-folder';
    const itemId = (dragItemId ?? (payload?.type === 'item' ? payload.id : null)) as SidebarNavId | null;
    const folderId = dragFolderId ?? (payload?.type === 'folder' ? payload.id : null);

    if (isNewFolder) {
      if (zone === 'left' || zone === 'right') insertNewFolder(zone, index);
      requestAnimationFrame(() => clearDrag());
      return;
    }
    if (itemId) {
      if (zone === 'pool') persist(stripNavId(layout, itemId));
      else persist(putItemOnSide(layout, zone, itemId, index));
      requestAnimationFrame(() => clearDrag());
      return;
    }
    if (folderId && (zone === 'left' || zone === 'right')) {
      persist(moveFolderToSide(layout, folderId, zone, index));
      requestAnimationFrame(() => clearDrag());
    }
  }

  function onZoneDrop(zone: DropZone, e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const payload = readDropPayload(e);
    const itemId = (dragItemId ?? (payload?.type === 'item' ? payload.id : null)) as SidebarNavId | null;
    if (overFolderId && itemId && payload?.type !== 'new-folder' && !dragFolderId) {
      persist(putItemInFolder(layout, overFolderId, itemId, overChildIndex));
      requestAnimationFrame(() => clearDrag());
      return;
    }
    applyDrop(zone, zone === 'pool' ? null : overIndex, e);
  }

  function onSlotDrop(zone: 'left' | 'right', index: number, e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const payload = readDropPayload(e);
    const itemId = (dragItemId ?? (payload?.type === 'item' ? payload.id : null)) as SidebarNavId | null;
    if (overFolderId && itemId && !dragFolderId && payload?.type !== 'new-folder') {
      persist(putItemInFolder(layout, overFolderId, itemId, overChildIndex));
      requestAnimationFrame(() => clearDrag());
      return;
    }
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    applyDrop(zone, before ? index : index + 1, e);
  }

  function onFolderDrop(folderId: string, side: 'left' | 'right', index: number, e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const payload = readDropPayload(e);
    if (payload?.type === 'new-folder' || dragNewFolder) return;

    const movingFolderId = dragFolderId ?? (payload?.type === 'folder' ? payload.id : null);
    if (movingFolderId) {
      if (movingFolderId === folderId) {
        clearDrag();
        return;
      }
      const at = overIndex ?? (() => {
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        return e.clientY < rect.top + rect.height / 2 ? index : index + 1;
      })();
      persist(moveFolderToSide(layout, movingFolderId, side, at));
      requestAnimationFrame(() => clearDrag());
      return;
    }

    const itemId = (dragItemId ?? (payload?.type === 'item' ? payload.id : null)) as SidebarNavId | null;
    if (!itemId) return;

    // Край папки во время dragover выставил overZone/overIndex — вынести на панель
    if (!overFolderId && overZone === side && overIndex != null) {
      persist(putItemOnSide(layout, side, itemId, overIndex));
      requestAnimationFrame(() => clearDrag());
      return;
    }

    persist(putItemInFolder(layout, folderId, itemId, overChildIndex));
    requestAnimationFrame(() => clearDrag());
  }

  function onKidDrop(folderId: string, kidIndex: number, e: DragEvent) {
    e.preventDefault();
    e.stopPropagation();
    const payload = readDropPayload(e);
    if (payload?.type === 'new-folder' || dragNewFolder || dragFolderId) return;
    const itemId = (dragItemId ?? (payload?.type === 'item' ? payload.id : null)) as SidebarNavId | null;
    if (!itemId) return;
    const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const before = e.clientY < rect.top + rect.height / 2;
    persist(putItemInFolder(layout, folderId, itemId, before ? kidIndex : kidIndex + 1));
    requestAnimationFrame(() => clearDrag());
  }

  function openItemMenu(id: SidebarNavId, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (dragging) return;
    menuTarget = { type: 'item', id };
    menuX = e.clientX;
    menuY = e.clientY;
    menuOpen = true;
  }

  function openFolderMenu(folderId: string, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (dragging) return;
    menuTarget = { type: 'folder', id: folderId };
    menuX = e.clientX;
    menuY = e.clientY;
    menuOpen = true;
  }

  function closeMenu() {
    menuOpen = false;
  }

  function onMenuSelect(id: string) {
    const target = menuTarget;
    menuOpen = false;
    if (!target) return;

    if (target.type === 'item') {
      if (id === 'default') {
        defaultNavId = setSidebarDefaultNavId(target.id);
        return;
      }
      if (id === 'remove') {
        persist(stripNavId(layout, target.id));
      }
      return;
    }

    if (id === 'rename') {
      void startRename(target.id);
      return;
    }
    if (id === 'icon') {
      iconPickerFolderId = target.id;
      iconPickerX = menuX + 12;
      iconPickerY = menuY;
      iconPickerOpen = true;
      tick().then(() => placeIconPicker());
      return;
    }
    if (id.startsWith('icon:')) {
      const icon = id.slice(5) as SidebarNavFolderIconId;
      persist(setFolderIcon(layout, target.id, icon));
      return;
    }
    if (id === 'dissolve') {
      persist(dissolveFolder(layout, target.id));
    }
  }

  async function startRename(folderId: string) {
    const folder = [...layout.left, ...layout.right].find(
      (e) => e.kind === 'folder' && e.folder.id === folderId,
    );
    renameValue = folder?.kind === 'folder' ? folder.folder.name : 'Папка';
    renamingFolderId = folderId;
    menuOpen = false;
    await tick();
    renameInputEl?.focus();
    renameInputEl?.select();
  }

  function commitRename() {
    if (!renamingFolderId) return;
    persist(setFolderName(layout, renamingFolderId, renameValue));
    renamingFolderId = null;
    renameValue = '';
    renameInputEl = null;
  }

  function cancelRename() {
    renamingFolderId = null;
    renameValue = '';
    renameInputEl = null;
  }

  function onNavPrefsChanged(e: Event) {
    const detail = (e as CustomEvent<{ layout?: SidebarNavLayout }>).detail;
    layout = detail?.layout ? getSidebarNavLayout() : getSidebarNavLayout();
  }

  function onPinsPrefsChanged() {
    pinsSource = getSidebarPinsSource();
    pinsPlacement = getSidebarPinsPlacement();
  }

  function onDefaultNavChanged(e: Event) {
    const detail = (e as CustomEvent<{ id?: SidebarNavId }>).detail;
    defaultNavId = detail?.id ?? getSidebarDefaultNavId();
  }

  onMount(() => {
    layout = getSidebarNavLayout();
    pinsSource = getSidebarPinsSource();
    pinsPlacement = getSidebarPinsPlacement();
    defaultNavId = getSidebarDefaultNavId();
    const motionQuery = window.matchMedia('(prefers-reduced-motion: reduce)');
    const syncMotion = () => { reducedMotion = motionQuery.matches; };
    syncMotion();
    motionQuery.addEventListener('change', syncMotion);
    window.addEventListener('anix:sidebarNavPrefsChanged', onNavPrefsChanged);
    window.addEventListener('anix:sidebarPinsPrefsChanged', onPinsPrefsChanged);
    window.addEventListener('anix:sidebarDefaultNavChanged', onDefaultNavChanged);
    window.addEventListener('mousedown', onIconPickerWindowDown, true);
    window.addEventListener('keydown', onIconPickerKey, true);
    return () => {
      motionQuery.removeEventListener('change', syncMotion);
      window.removeEventListener('mousedown', onIconPickerWindowDown, true);
      window.removeEventListener('keydown', onIconPickerKey, true);
    };
  });

  onDestroy(() => {
    window.removeEventListener('anix:sidebarNavPrefsChanged', onNavPrefsChanged);
    window.removeEventListener('anix:sidebarPinsPrefsChanged', onPinsPrefsChanged);
    window.removeEventListener('anix:sidebarDefaultNavChanged', onDefaultNavChanged);
    window.removeEventListener('mousedown', onIconPickerWindowDown, true);
    window.removeEventListener('keydown', onIconPickerKey, true);
  });
</script>

{#snippet navChip(id: SidebarNavId, zone: DropZone)}
  {@const item = itemById(id)}
  <button
    type="button"
    class="uiv2-btn uiv2-btn--sm uiv2-btn--icon nav-board__chip nav-board__chip--icon"
    class:uiv2-btn--chrome={defaultNavId !== id}
    class:uiv2-btn--primary={defaultNavId === id}
    class:nav-board__chip--dragging={dragItemId === id}
    class:nav-board__chip--default={defaultNavId === id}
    draggable="true"
    aria-label={defaultNavId === id ? `${item.label} (по умолчанию)` : item.label}
    ondragstart={(e) => onItemDragStart(id, zone, e)}
    ondragend={onDragEnd}
    oncontextmenu={(e) => openItemMenu(id, e)}
  >
    <span class="uiv2-btn__icon" aria-hidden="true">{@html item.icon}</span>
    {#if defaultNavId === id}
      <span class="nav-board__chip-pin" aria-hidden="true">{@html iconPin(10)}</span>
    {/if}
  </button>
{/snippet}

{#snippet railDropGap()}
  <div
    class="nav-board__drop-gap"
    aria-hidden="true"
    transition:scale={{ duration: reducedMotion ? 0 : 120, start: 0.5, opacity: 0 }}
  ></div>
{/snippet}

{#snippet railColumn(side: 'left' | 'right', entries: SidebarNavEntry[], label: string)}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    class="nav-board__col"
    class:nav-board__col--active={overZone === side}
    class:nav-board__col--empty={entries.length === 0}
    data-side={side}
    role="group"
    aria-label={label}
    ondragover={(e) => onZoneDragOver(side, e)}
    ondrop={(e) => onZoneDrop(side, e)}
    ondragleave={() => {
      if (overZone === side) {
        overZone = null;
        overIndex = null;
      }
    }}
  >
    <UiV2Card {label} class="nav-board__card">
      <div
        class="nav-board__scroll uiv2-scroll-area uiv2-scroll-area--y"
        use:uiv2CustomScroll={{ axis: 'y' }}
      >
        <div
          class="nav-board__body uiv2-scroll-area__viewport"
          role="list"
          aria-label={label}
          data-uiv2-scroll
          ondragover={(e) => onZoneDragOver(side, e)}
          ondrop={(e) => onZoneDrop(side, e)}
        >
          {#if entries.length === 0}
            <p class="nav-board__hint nav-board__hint--fill" transition:fade={{ duration: reducedMotion ? 0 : 180 }}>
              Перетащите сюда
            </p>
          {/if}
          {#each entries as entry, index (entryKey(entry))}
            <div
              class="nav-board__slot-wrap"
              animate:flip={{ duration: flipMs(), easing: cubicOut }}
              in:receive={{ key: entryKey(entry) }}
              out:send={{ key: entryKey(entry) }}
            >
              {#if showRailDropGap(side, index)}
                {@render railDropGap()}
              {/if}
              <div
                class="nav-board__slot"
                class:nav-board__slot--dragging={
                  (entry.kind === 'item' && dragItemId === entry.id)
                  || (entry.kind === 'folder' && dragFolderId === entry.folder.id)
                }
                role="listitem"
                ondragover={(e) => onSlotDragOver(side, index, e)}
                ondrop={(e) => onSlotDrop(side, index, e)}
              >
              {#if entry.kind === 'item'}
                {@render navChip(entry.id, side)}
              {:else}
                <!-- svelte-ignore a11y_no_static_element_interactions -->
                <div
                  class="nav-board__folder"
                  class:nav-board__folder--over={overFolderId === entry.folder.id}
                  class:nav-board__folder--dragging={dragFolderId === entry.folder.id}
                  ondragover={(e) => onFolderShellDragOver(entry.folder.id, side, index, e)}
                  ondrop={(e) => onFolderDrop(entry.folder.id, side, index, e)}
                  oncontextmenu={(e) => openFolderMenu(entry.folder.id, e)}
                >
                  <!-- svelte-ignore a11y_no_static_element_interactions -->
                  <div
                    class="nav-board__folder-head"
                    draggable={renamingFolderId !== entry.folder.id}
                    ondragstart={(e) => onFolderDragStart(entry.folder.id, e)}
                    ondragend={onDragEnd}
                    ondblclick={(e) => {
                      e.preventDefault();
                      e.stopPropagation();
                      if (dragging || renamingFolderId === entry.folder.id) return;
                      void startRename(entry.folder.id);
                    }}
                  >
                    <span class="nav-board__folder-icon" aria-hidden="true">
                      {@html sidebarNavFolderIconSvg(entry.folder.icon, 16)}
                    </span>
                    {#if renamingFolderId === entry.folder.id}
                      <input
                        bind:this={renameInputEl}
                        class="nav-board__folder-input"
                        bind:value={renameValue}
                        maxlength={32}
                        aria-label="Название папки"
                        onkeydown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            commitRename();
                          }
                          if (e.key === 'Escape') {
                            e.preventDefault();
                            cancelRename();
                          }
                        }}
                        onblur={commitRename}
                        onmousedown={(e) => e.stopPropagation()}
                        onclick={(e) => e.stopPropagation()}
                        ondblclick={(e) => e.stopPropagation()}
                        ondragstart={(e) => e.preventDefault()}
                      />
                    {:else}
                      <span class="nav-board__folder-name">{entry.folder.name}</span>
                    {/if}
                  </div>
                  <div
                    class="nav-board__folder-kids"
                    role="list"
                    aria-label={`Вкладки в «${entry.folder.name}»`}
                    ondragover={(e) => onFolderKidsDragOver(entry.folder.id, e)}
                    ondrop={(e) => onFolderDrop(entry.folder.id, side, index, e)}
                  >
                    {#each entry.folder.children as childId, kidIndex (childId)}
                      {#if showKidDropGap(entry.folder.id, kidIndex, entry.folder.children)}
                        <div
                          class="nav-board__drop-gap nav-board__drop-gap--kid"
                          aria-hidden="true"
                          transition:scale={{ duration: reducedMotion ? 0 : 120, start: 0.5, opacity: 0 }}
                        ></div>
                      {/if}
                      <div
                        class="nav-board__folder-kid"
                        role="listitem"
                        ondragover={(e) => onKidDragOver(entry.folder.id, kidIndex, e)}
                        ondrop={(e) => onKidDrop(entry.folder.id, kidIndex, e)}
                      >
                        {@render navChip(childId, side)}
                      </div>
                    {:else}
                      <p class="nav-board__folder-empty">Перетащите сюда</p>
                    {/each}
                    {#if showKidDropGap(entry.folder.id, entry.folder.children.length, entry.folder.children)}
                      <div
                        class="nav-board__drop-gap nav-board__drop-gap--kid"
                        aria-hidden="true"
                        transition:scale={{ duration: reducedMotion ? 0 : 120, start: 0.5, opacity: 0 }}
                      ></div>
                    {/if}
                  </div>
                </div>
              {/if}
              </div>
            </div>
          {/each}
          {#if showRailDropGap(side, entries.length)}
            {@render railDropGap()}
          {/if}
        </div>
        <div class="uiv2-scroll-area__v-track" aria-hidden="true">
          <div class="uiv2-scroll-area__v-thumb"></div>
        </div>
      </div>
    </UiV2Card>
  </div>
{/snippet}

<section class="uiv2-settings__block nav-settings">
  <h3 class="uiv2-settings__title">Настройка навигации</h3>
  <p class="uiv2-settings__desc">
    Перетащите разделы и папку из центра на панели. Вкладки можно класть в папки и менять порядок внутри.
    ПКМ или двойной клик по папке — имя; ПКМ — ещё иконка.
    Левую панель нельзя оставить пустой, пока справа ничего нет; если справа уже есть вкладки — можно перенести всё туда, тогда Discord, Telegram, Boosty и Команда переедут вниз справа.
  </p>

  <div class="nav-board" class:nav-board--dragging={dragging}>
    {@render railColumn('left', layout.left, 'Левая панель')}

    <!-- svelte-ignore a11y_no_static_element_interactions -->
    <div
      class="nav-board__col"
      class:nav-board__col--active={overZone === 'pool'}
      role="group"
      aria-label="Доступные разделы"
      ondragover={(e) => onZoneDragOver('pool', e)}
      ondrop={(e) => onZoneDrop('pool', e)}
      ondragleave={() => { if (overZone === 'pool') overZone = null; }}
    >
      <UiV2Card title="Разделы" pill="тяните" label="Доступные разделы" class="nav-board__card">
        <div
          class="nav-board__scroll uiv2-scroll-area uiv2-scroll-area--y"
          use:uiv2CustomScroll={{ axis: 'y' }}
        >
          <div
            class="nav-board__pool-grid uiv2-scroll-area__viewport"
            role="list"
            aria-label="Доступные разделы"
            data-uiv2-scroll
          >
            {#each SIDEBAR_NAV_ITEMS as item (item.id)}
              {@const used = placed.has(item.id)}
              <div
                class="nav-board__pool-item"
                class:nav-board__pool-item--used={used}
                class:nav-board__pool-item--dragging={dragItemId === item.id}
                role="listitem"
                draggable={!used}
                title={used ? `${item.label} уже на панели` : item.label}
                aria-label={used ? `${item.label} — уже размещён` : item.label}
                ondragstart={(e) => onItemDragStart(item.id, 'pool', e)}
                ondragend={onDragEnd}
              >
                <UiV2RoundButton
                  size="md"
                  label={item.label}
                  disabled={used}
                  class={used ? 'nav-board__pool-btn--used' : ''}
                  tabindex={-1}
                >
                  {@html item.icon}
                </UiV2RoundButton>
                <span class="nav-board__pool-label">{item.label}</span>
              </div>
            {/each}
            <div
              class="nav-board__pool-item nav-board__pool-item--folder"
              class:nav-board__pool-item--dragging={dragNewFolder}
              role="button"
              tabindex="0"
              draggable="true"
              title="Клик или перетащите на панель — создать папку (без лимита)"
              aria-label="Папка — клик или перетащите на панель"
              ondragstart={onNewFolderDragStart}
              ondragend={onDragEnd}
              onclick={onNewFolderClick}
              onkeydown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onNewFolderClick();
                }
              }}
            >
              <UiV2RoundButton
                size="md"
                label="Папка"
                class="nav-board__pool-btn--folder"
                tabindex={-1}
              >
                {@html iconFolder(18)}
              </UiV2RoundButton>
              <span class="nav-board__pool-label">Папка</span>
            </div>
          </div>
          <div class="uiv2-scroll-area__v-track" aria-hidden="true">
            <div class="uiv2-scroll-area__v-thumb"></div>
          </div>
        </div>
      </UiV2Card>
    </div>

    {@render railColumn('right', layout.right, 'Правая панель')}
  </div>
</section>

<section class="uiv2-settings__block nav-settings">
  <h3 class="uiv2-settings__title">Миниатюры</h3>
  <p class="uiv2-settings__desc">
    Где показывать миниатюры под пунктами меню и что в них выводить.
  </p>

  <div class="nav-settings__placement" role="radiogroup" aria-label="Расположение миниатюр">
    {#each SIDEBAR_PINS_PLACEMENT_OPTIONS as opt (opt.id)}
      {@const on = pinsPlacement === opt.id}
      <div class="nav-settings__pin" class:nav-settings__pin--on={on}>
        <UiV2RoundButton
          size="lg"
          label={opt.label}
          title={opt.hint}
          class={on ? 'nav-settings__pin-btn--on' : (opt.id === 'none' ? 'nav-settings__pin-btn--none' : '')}
          onclick={() => setPlacement(opt.id)}
        >
          {@html placementIcon(opt.id)}
        </UiV2RoundButton>
        <span class="nav-settings__pin-label">{opt.label}</span>
      </div>
    {/each}
  </div>

  {#if pinsPlacement !== 'none'}
    <p class="uiv2-settings__desc nav-settings__source-desc">Что показывать</p>
    <div class="nav-settings__pins" role="radiogroup" aria-label="Источник миниатюр">
      {#each SIDEBAR_PINS_CONTENT_OPTIONS as opt (opt.id)}
        {@const on = pinsSource === opt.id}
        <div class="nav-settings__pin" class:nav-settings__pin--on={on}>
          <UiV2RoundButton
            size="lg"
            label={opt.label}
            title={opt.hint}
            class={on ? 'nav-settings__pin-btn--on' : ''}
            onclick={() => setPins(opt.id)}
          >
            {@html pinsIcon(opt.id)}
          </UiV2RoundButton>
          <span class="nav-settings__pin-label">{opt.label}</span>
        </div>
      {/each}
    </div>
  {/if}
</section>

<UiV2PopupMenu
  open={menuOpen}
  x={menuX}
  y={menuY}
  placement="point"
  items={menuItems}
  onClose={closeMenu}
  onSelect={onMenuSelect}
  onCheckedChange={(id) => onMenuSelect(id)}
/>

{#if iconPickerOpen}
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <div
    bind:this={iconPickerEl}
    class="nav-folder-icons-pop"
    style={`left:${iconPickerX}px;top:${iconPickerY}px;`}
    role="dialog"
    tabindex="-1"
    aria-label="Иконка папки"
    use:portal
    onclick={(e) => e.stopPropagation()}
  >
    <div
      class="nav-folder-icons nav-folder-icons--pop uiv2-scroll-area uiv2-scroll-area--y"
      use:uiv2CustomScroll={{ axis: 'y' }}
    >
      <div class="nav-folder-icons__grid uiv2-scroll-area__viewport" data-uiv2-scroll role="listbox">
        {#each SIDEBAR_NAV_FOLDER_ICON_OPTIONS as opt (opt.id)}
          {@const on = iconPickerCurrent === opt.id}
          <button
            type="button"
            class="nav-folder-icons__btn"
            class:nav-folder-icons__btn--on={on}
            role="option"
            aria-selected={on}
            title={opt.label}
            aria-label={opt.label}
            onclick={() => pickFolderIcon(opt.id)}
          >
            {@html opt.icon(18)}
          </button>
        {/each}
      </div>
      <div class="uiv2-scroll-area__v-track" aria-hidden="true">
        <div class="uiv2-scroll-area__v-thumb"></div>
      </div>
    </div>
  </div>
{/if}
