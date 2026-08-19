<script lang="ts">
  import type { Snippet } from 'svelte';
  import { scale, fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../actions/portal';
  import { tick } from 'svelte';
  import { iconCheck, iconChevronRight, iconSearch, iconX } from '../icons';
  import UiV2Tooltip from './UiV2Tooltip.svelte';

  export type UiV2PopupMenuItemType = 'action' | 'toggle' | 'radio' | 'slider' | 'label';

  export type UiV2PopupMenuItem = {
    id: string;
    label: string;
    /** HTML иконки (например из icons.ts) */
    icon?: string;
    danger?: boolean;
    disabled?: boolean;
    /** Разделитель перед пунктом */
    dividerBefore?: boolean;
    /** Вложенное меню (hover → панель рядом) */
    children?: UiV2PopupMenuItem[];
    /** Широкая панель подменю (длинные названия и т.п.) */
    submenuWide?: boolean;
    /** Кастомное подменю через snippet submenuContent */
    customSubmenu?: boolean;
    /** @deprecated используйте children / customSubmenu */
    hasSubmenu?: boolean;
    type?: UiV2PopupMenuItemType;
    /** Состояние toggle / radio */
    checked?: boolean;
    /** Не закрывать меню после клика */
    keepOpen?: boolean;
    /** Текущее значение для type: slider */
    value?: number;
    min?: number;
    max?: number;
    step?: number;
    /** Подпись значения (например «1.00×») */
    valueText?: string;
    minLabel?: string;
    maxLabel?: string;
    /** Порог «быстрого» режима / предупреждения */
    warnAt?: number;
    warnText?: string;
    showReset?: boolean;
    resetValue?: number;
    resetLabel?: string;
    /** Кнопка справа от пункта (вне основного button — валидный HTML) */
    trailingIcon?: string;
    trailingLabel?: string;
    trailingActive?: boolean;
  };

  type Props = {
    open: boolean;
    /** clientX якоря */
    x: number;
    /** clientY якоря */
    y: number;
    items: UiV2PopupMenuItem[];
    /** 'point' — у курсора; 'anchor' — рядом с кнопкой (x/y = центр кнопки) */
    placement?: 'point' | 'anchor';
    onClose?: () => void;
    onSelect?: (id: string, item: UiV2PopupMenuItem) => void;
    /** Изменение toggle / radio */
    onCheckedChange?: (id: string, checked: boolean, item: UiV2PopupMenuItem) => void;
    /** Изменение slider */
    onValueChange?: (id: string, value: number, item: UiV2PopupMenuItem) => void;
    /** Кастомное содержимое подменю (для item.customSubmenu) */
    submenuContent?: Snippet<[UiV2PopupMenuItem]>;
    /** Заголовок панели (как «10 серий») */
    title?: string;
    /** Кнопка лупы и поле фильтра по label */
    searchable?: boolean;
    searchPlaceholder?: string;
    searchInputMode?: 'text' | 'search' | 'numeric' | 'decimal';
    emptyLabel?: string;
    /** Шире обычного меню (длинные названия, слайдер на корне) */
    wide?: boolean;
    /** Триггер: клик по нему не считается click-outside */
    anchor?: HTMLElement | null;
    /** Клик по trailingIcon */
    onTrailingClick?: (id: string, item: UiV2PopupMenuItem) => void;
  };

  let {
    open = false,
    x = 0,
    y = 0,
    items = [],
    placement = 'point',
    onClose,
    onSelect,
    onCheckedChange,
    onValueChange,
    submenuContent,
    title = '',
    searchable = false,
    searchPlaceholder = 'Поиск…',
    searchInputMode = 'text',
    emptyLabel = 'Нет результатов',
    wide = false,
    anchor = null,
    onTrailingClick,
  }: Props = $props();

  let panelEl = $state<HTMLDivElement | null>(null);
  let subPanelEl = $state<HTMLDivElement | null>(null);
  let left = $state(0);
  let top = $state(0);
  let originX = $state('50%');
  let originY = $state('0%');
  let openDown = $state(true);
  let openRight = $state(true);

  let openSubId = $state<string | null>(null);
  let subLeft = $state(0);
  let subTop = $state(0);
  let subOpenRight = $state(true);
  let leavePopupTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSubHeight = 0;
  let lastSubPlaceId = '';
  /** Курсор уже побывал на панели — после этого уход за пределы закрывает меню. */
  let pointerEnteredPopup = false;
  /** Не закрывать, пока тянут слайдер за пределы панели. */
  let pointerDownInside = false;

  const SUBMENU_GAP = 12;
  const POPUP_HIT_PAD = 8;
  const POPUP_LEAVE_MS = 160;
  const labelId = `uiv2-popup-menu-${Math.random().toString(36).slice(2, 9)}`;

  let searchOpen = $state(false);
  let searchQuery = $state('');
  let searchInputEl = $state<HTMLInputElement | null>(null);

  const panelWide = $derived(wide || items.some((it) => it.type === 'slider'));
  const visibleItems = $derived(filterMenuItems(items, searchQuery));

  const activeSubItem = $derived(
    openSubId ? items.find((it) => it.id === openSubId) ?? null : null,
  );
  const subItems = $derived(activeSubItem?.children ?? []);
  const subHasSlider = $derived(subItems.some((it) => it.type === 'slider'));
  const subWide = $derived(!!activeSubItem?.submenuWide || subHasSlider || !!activeSubItem?.customSubmenu);
  const subCustom = $derived(!!activeSubItem?.customSubmenu && !!submenuContent);
  const subVisible = $derived(!!activeSubItem && (subItems.length > 0 || subCustom));

  function itemHasSubmenu(item: UiV2PopupMenuItem): boolean {
    return !!(item.children?.length || item.customSubmenu || item.hasSubmenu);
  }

  function filterMenuItems(list: UiV2PopupMenuItem[], query: string): UiV2PopupMenuItem[] {
    const q = query.trim().toLowerCase();
    if (!q) return list;
    const out: UiV2PopupMenuItem[] = [];
    let pendingLabel: UiV2PopupMenuItem | null = null;
    for (const item of list) {
      if (item.type === 'label') {
        pendingLabel = item;
        continue;
      }
      const hay = `${item.label} ${item.id}`.toLowerCase();
      if (hay.includes(q)) {
        if (pendingLabel) {
          out.push(pendingLabel);
          pendingLabel = null;
        }
        out.push(item);
      }
    }
    return out;
  }

  function resetSearch() {
    searchOpen = false;
    searchQuery = '';
  }

  async function toggleSearch() {
    searchOpen = !searchOpen;
    if (!searchOpen) {
      searchQuery = '';
      return;
    }
    await tick();
    searchInputEl?.focus();
    searchInputEl?.select();
  }

  function clearLeavePopupTimer() {
    if (leavePopupTimer != null) {
      clearTimeout(leavePopupTimer);
      leavePopupTimer = null;
    }
  }

  function closeSubmenu() {
    openSubId = null;
    lastSubHeight = 0;
    lastSubPlaceId = '';
  }

  type HitRect = { left: number; top: number; right: number; bottom: number };

  function inflateRect(r: DOMRect, pad: number): HitRect {
    return {
      left: r.left - pad,
      top: r.top - pad,
      right: r.right + pad,
      bottom: r.bottom + pad,
    };
  }

  function pointInRect(x: number, y: number, r: HitRect): boolean {
    return x >= r.left && x <= r.right && y >= r.top && y <= r.bottom;
  }

  function corridorBetween(a: DOMRect, b: DOMRect): HitRect | null {
    const extra = 20;
    const top = Math.min(a.top, b.top) - extra;
    const bottom = Math.max(a.bottom, b.bottom) + extra;
    if (b.left >= a.right - 1) {
      return { left: a.right, right: b.left, top, bottom };
    }
    if (a.left >= b.right - 1) {
      return { left: b.right, right: a.left, top, bottom };
    }
    return null;
  }

  /** Родитель + подменю + зазор между ними — переход в раскрытый блок не считается уходом. */
  function popupContainsPoint(x: number, y: number): boolean {
    const pad = POPUP_HIT_PAD;
    const panelRect = panelEl?.getBoundingClientRect();
    const subRect = openSubId && subPanelEl ? subPanelEl.getBoundingClientRect() : null;
    if (panelRect && pointInRect(x, y, inflateRect(panelRect, pad))) return true;
    if (subRect && pointInRect(x, y, inflateRect(subRect, pad))) return true;
    if (panelRect && subRect) {
      const corridor = corridorBetween(panelRect, subRect);
      if (corridor && pointInRect(x, y, corridor)) return true;
    } else if (panelRect && openSubId) {
      const sidePad = SUBMENU_GAP + 16;
      const extended = inflateRect(panelRect, pad);
      if (subOpenRight) extended.right += sidePad;
      else extended.left -= sidePad;
      if (pointInRect(x, y, extended)) return true;
    }
    return false;
  }

  function resetHoverTracking() {
    pointerEnteredPopup = false;
    pointerDownInside = false;
    clearLeavePopupTimer();
  }

  function scheduleClosePopup() {
    if (pointerDownInside || leavePopupTimer != null) return;
    leavePopupTimer = setTimeout(() => {
      leavePopupTimer = null;
      if (pointerDownInside) return;
      onClose?.();
    }, POPUP_LEAVE_MS);
  }

  async function place() {
    await tick();
    const el = panelEl;
    if (!el) return;
    const pad = 8;
    const gap = 6;
    const w = el.offsetWidth || el.getBoundingClientRect().width;
    const h = el.offsetHeight || el.getBoundingClientRect().height;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceBelow = vh - pad - y;
    const spaceAbove = y - pad;
    const spaceRight = vw - pad - x;
    const spaceLeft = x - pad;

    const fitsBelow = spaceBelow >= h + gap;
    const fitsAbove = spaceAbove >= h + gap;
    let down: boolean;
    if (fitsBelow && fitsAbove) down = spaceBelow >= spaceAbove;
    else if (fitsBelow) down = true;
    else if (fitsAbove) down = false;
    else down = spaceBelow >= spaceAbove;

    const fitsRight = spaceRight >= w;
    const fitsLeft = spaceLeft >= w;
    let right: boolean;
    if (fitsRight && fitsLeft) right = spaceRight >= spaceLeft;
    else if (fitsRight) right = true;
    else if (fitsLeft) right = false;
    else right = spaceRight >= spaceLeft;

    openDown = down;
    openRight = right;

    let nextTop = down ? y + gap : y - gap - h;
    let nextLeft = right ? x : x - w;

    if (placement === 'anchor' && !down) {
      nextTop = y - gap - h;
    }

    nextLeft = Math.max(pad, Math.min(nextLeft, vw - pad - w));
    nextTop = Math.max(pad, Math.min(nextTop, vh - pad - h));

    left = nextLeft;
    top = nextTop;

    const ox = ((x - nextLeft) / Math.max(1, w)) * 100;
    const oy = ((y - nextTop) / Math.max(1, h)) * 100;
    originX = `${Math.max(0, Math.min(100, ox))}%`;
    originY = `${Math.max(0, Math.min(100, oy))}%`;
  }

  async function placeSubmenu(anchorEl: HTMLElement, itemId?: string) {
    await tick();
    const sub = subPanelEl;
    if (!sub) return;
    const pad = 8;
    const gap = SUBMENU_GAP;
    const ar = anchorEl.getBoundingClientRect();
    const panelRect = panelEl?.getBoundingClientRect();
    const w = sub.offsetWidth || sub.getBoundingClientRect().width || 200;
    const h = sub.offsetHeight || sub.getBoundingClientRect().height || 120;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const edgeLeft = panelRect?.left ?? ar.left;
    const edgeRight = panelRect?.right ?? ar.right;
    const spaceRight = vw - pad - edgeRight;
    const spaceLeft = edgeLeft - pad;
    const preferRight = spaceRight >= w + gap && spaceRight >= spaceLeft;
    subOpenRight = preferRight;

    let nextLeft = preferRight ? edgeRight + gap : edgeLeft - gap - w;

    const rowTop = (
      panelRect && (ar.top < panelRect.top - 24 || ar.top > panelRect.bottom + 24)
    ) ? panelRect.top : ar.top;
    let nextTop = rowTop - 4;

    const sameItem = !!itemId && lastSubPlaceId === itemId;
    if (sameItem && lastSubHeight > 0 && h <= lastSubHeight && subTop > 0) {
      nextTop = subTop;
    }

    nextLeft = Math.max(pad, Math.min(nextLeft, vw - pad - w));
    nextTop = Math.max(pad, Math.min(nextTop, vh - pad - h));

    subLeft = nextLeft;
    subTop = nextTop;
    lastSubHeight = h;
    if (itemId) lastSubPlaceId = itemId;
  }

  function openSubmenu(item: UiV2PopupMenuItem, rowEl: HTMLElement) {
    if (!itemHasSubmenu(item)) {
      closeSubmenu();
      return;
    }
    openSubId = item.id;
    void placeSubmenu(rowEl, item.id);
    window.setTimeout(() => {
      if (openSubId === item.id) void placeSubmenu(rowEl, item.id);
    }, 200);
  }

  $effect(() => {
    if (!open) {
      closeSubmenu();
      resetSearch();
      resetHoverTracking();
      return;
    }

    left = x;
    top = y;
    void place();

    let raf = 0;
    const schedule = () => {
      if (raf) cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        raf = 0;
        void place();
      });
    };

    window.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('resize', schedule);
    window.visualViewport?.addEventListener('scroll', schedule);
    window.addEventListener('anix:uiZoomChanged', schedule);

    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(schedule)
      : null;
    ro?.observe(document.documentElement);
    if (panelEl) ro?.observe(panelEl);

    void tick().then(() => {
      panelEl
        ?.querySelector<HTMLElement>('.uiv2-popup-menu__item--checked')
        ?.scrollIntoView({ block: 'nearest' });
    });

    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('resize', schedule);
      window.visualViewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('anix:uiZoomChanged', schedule);
      ro?.disconnect();
    };
  });

  $effect(() => {
    if (!open) return;
    const count = visibleItems.length;
    const q = searchQuery;
    void count;
    void q;
    void place();
  });

  $effect(() => {
    if (!open || !openSubId || !subVisible) return;
    void left;
    void top;
    void tick().then(() => {
      const id = openSubId;
      if (!id) return;
      const row = panelEl?.querySelector<HTMLElement>(`[data-menu-id="${CSS.escape(id)}"]`);
      if (row) void placeSubmenu(row, id);
    });
  });

  $effect(() => {
    if (!open || !openSubId || !subPanelEl) return;
    const id = openSubId;
    const row = () => panelEl?.querySelector<HTMLElement>(`[data-menu-id="${CSS.escape(id)}"]`);
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          const el = row();
          if (el) void placeSubmenu(el, id);
        })
      : null;
    ro?.observe(subPanelEl);
    return () => ro?.disconnect();
  });

  function onWindowKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (searchOpen) {
        resetSearch();
        return;
      }
      if (openSubId) closeSubmenu();
      else onClose?.();
    }
  }

  function onWindowPointerDown(e: PointerEvent) {
    if (!open) return;
    const t = e.target;
    if (t instanceof Node) {
      if (panelEl?.contains(t) || subPanelEl?.contains(t)) {
        pointerDownInside = true;
        pointerEnteredPopup = true;
        clearLeavePopupTimer();
        return;
      }
      if (anchor?.contains(t)) return;
    }
    onClose?.();
  }

  function onWindowPointerMove(e: PointerEvent) {
    if (!open) return;
    if (popupContainsPoint(e.clientX, e.clientY)) {
      pointerEnteredPopup = true;
      clearLeavePopupTimer();
      return;
    }
    if (!pointerEnteredPopup || pointerDownInside) return;
    scheduleClosePopup();
  }

  function onWindowPointerUp(e: PointerEvent) {
    pointerDownInside = false;
    if (!open || !pointerEnteredPopup) return;
    if (popupContainsPoint(e.clientX, e.clientY)) {
      clearLeavePopupTimer();
      return;
    }
    scheduleClosePopup();
  }

  function shouldKeepOpen(item: UiV2PopupMenuItem): boolean {
    if (item.keepOpen != null) return item.keepOpen;
    return item.type === 'toggle' || item.type === 'radio' || item.type === 'slider';
  }

  function handleItemClick(item: UiV2PopupMenuItem, e: MouseEvent) {
    if (item.disabled || item.type === 'label') return;
    if (itemHasSubmenu(item)) {
      openSubmenu(item, e.currentTarget as HTMLElement);
      return;
    }

    if (item.type === 'toggle') {
      const next = !item.checked;
      onCheckedChange?.(item.id, next, item);
      onSelect?.(item.id, item);
      if (!shouldKeepOpen(item)) onClose?.();
      return;
    }

    if (item.type === 'radio') {
      onCheckedChange?.(item.id, true, item);
      onSelect?.(item.id, item);
      if (!shouldKeepOpen(item)) onClose?.();
      return;
    }

    if (item.type === 'slider') return;

    onSelect?.(item.id, item);
    if (!shouldKeepOpen(item)) onClose?.();
  }

  function showChevron(item: UiV2PopupMenuItem): boolean {
    return itemHasSubmenu(item);
  }

  function sliderMin(item: UiV2PopupMenuItem): number {
    return item.min ?? 0;
  }

  function sliderMax(item: UiV2PopupMenuItem): number {
    return item.max ?? 1;
  }

  function sliderStep(item: UiV2PopupMenuItem): number {
    return item.step ?? 0.05;
  }

  function sliderValue(item: UiV2PopupMenuItem): number {
    const min = sliderMin(item);
    const max = sliderMax(item);
    const raw = item.value ?? item.resetValue ?? min;
    return Math.min(max, Math.max(min, raw));
  }

  function sliderFillPercent(item: UiV2PopupMenuItem): number {
    const min = sliderMin(item);
    const max = sliderMax(item);
    const span = max - min;
    if (span <= 0) return 0;
    return ((sliderValue(item) - min) / span) * 100;
  }

  function sliderWarnPercent(item: UiV2PopupMenuItem): number | null {
    if (item.warnAt == null) return null;
    const min = sliderMin(item);
    const max = sliderMax(item);
    const span = max - min;
    if (span <= 0) return null;
    return ((item.warnAt - min) / span) * 100;
  }

  function sliderIsFast(item: UiV2PopupMenuItem): boolean {
    return item.warnAt != null && sliderValue(item) > item.warnAt;
  }

  function sliderCanReset(item: UiV2PopupMenuItem): boolean {
    if (!item.showReset) return false;
    const reset = item.resetValue ?? 1;
    return Math.abs(sliderValue(item) - reset) > 1e-6;
  }

  function emitSliderValue(item: UiV2PopupMenuItem, next: number) {
    if (item.disabled) return;
    const min = sliderMin(item);
    const max = sliderMax(item);
    const step = sliderStep(item);
    const stepped = Math.round(next / step) * step;
    const clamped = Math.min(max, Math.max(min, Number(stepped.toFixed(4))));
    onValueChange?.(item.id, clamped, item);
    onSelect?.(item.id, item);
  }

  function onSliderInput(item: UiV2PopupMenuItem, e: Event) {
    e.stopPropagation();
    emitSliderValue(item, Number((e.target as HTMLInputElement).value));
  }

  function stepSlider(item: UiV2PopupMenuItem, dir: -1 | 1) {
    emitSliderValue(item, sliderValue(item) + dir * sliderStep(item));
  }

  function resetSlider(item: UiV2PopupMenuItem) {
    emitSliderValue(item, item.resetValue ?? 1);
  }

  function onTrailing(item: UiV2PopupMenuItem, e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (item.disabled) return;
    onTrailingClick?.(item.id, item);
  }
</script>

{#snippet menuRow(item: UiV2PopupMenuItem, opts?: { root?: boolean })}
  {#if item.dividerBefore}
    <li class="uiv2-popup-menu__divider" role="separator"></li>
  {/if}

  {#if item.type === 'label'}
    <li class="uiv2-popup-menu__section" role="presentation">
      <span class="uiv2-popup-menu__section-label">{item.label}</span>
    </li>
  {:else if item.type === 'slider'}
    {@const val = sliderValue(item)}
    {@const fill = sliderFillPercent(item)}
    {@const warnPct = sliderWarnPercent(item)}
    {@const fast = sliderIsFast(item)}
    <li role="none">
      <div
        class="uiv2-popup-menu__slider"
        class:uiv2-popup-menu__slider--fast={fast}
        class:uiv2-popup-menu__slider--disabled={item.disabled}
        role="group"
        aria-label={item.label}
      >
        <div class="uiv2-popup-menu__slider-head">
          <span class="uiv2-popup-menu__slider-title">{item.label}</span>
          {#if item.showReset}
            <button
              type="button"
              class="uiv2-popup-menu__slider-reset"
              disabled={item.disabled || !sliderCanReset(item)}
              onclick={(e) => {
                e.stopPropagation();
                resetSlider(item);
              }}
            >{item.resetLabel ?? 'Сброс'}</button>
          {/if}
        </div>

        <div class="uiv2-popup-menu__slider-value">
          {item.valueText ?? String(val)}
        </div>

        <div class="uiv2-popup-menu__slider-row">
          <button
            type="button"
            class="uiv2-popup-menu__slider-step"
            aria-label="Уменьшить"
            disabled={item.disabled || val <= sliderMin(item)}
            onclick={(e) => {
              e.stopPropagation();
              stepSlider(item, -1);
            }}
          >−</button>
          <div class="uiv2-popup-menu__slider-track">
            <input
              type="range"
              class="uiv2-popup-menu__slider-input"
              style={`--slider-fill:${fill}%;${warnPct != null ? `--slider-warn:${warnPct}%;` : ''}`}
              min={sliderMin(item)}
              max={sliderMax(item)}
              step={sliderStep(item)}
              value={val}
              disabled={item.disabled}
              aria-label={item.label}
              aria-valuemin={sliderMin(item)}
              aria-valuemax={sliderMax(item)}
              aria-valuenow={val}
              aria-valuetext={item.valueText ?? String(val)}
              oninput={(e) => onSliderInput(item, e)}
              onclick={(e) => e.stopPropagation()}
              onpointerdown={(e) => e.stopPropagation()}
            />
          </div>
          <button
            type="button"
            class="uiv2-popup-menu__slider-step"
            aria-label="Увеличить"
            disabled={item.disabled || val >= sliderMax(item)}
            onclick={(e) => {
              e.stopPropagation();
              stepSlider(item, 1);
            }}
          >+</button>
        </div>

        <div class="uiv2-popup-menu__slider-ends" aria-hidden="true">
          <span>{item.minLabel ?? `${sliderMin(item)}`}</span>
          <span>{item.maxLabel ?? `${sliderMax(item)}`}</span>
        </div>

        {#if fast && item.warnText}
          <p class="uiv2-popup-menu__slider-warn" role="status">{item.warnText}</p>
        {/if}
      </div>
    </li>
  {:else}
    <li role="none" class="uiv2-popup-menu__row">
      <button
        type="button"
        class="uiv2-popup-menu__item"
        class:uiv2-popup-menu__item--danger={item.danger}
        class:uiv2-popup-menu__item--active={opts?.root && openSubId === item.id}
        class:uiv2-popup-menu__item--checked={!!item.checked}
        data-menu-id={opts?.root ? item.id : undefined}
        role={item.type === 'toggle' ? 'menuitemcheckbox' : item.type === 'radio' ? 'menuitemradio' : 'menuitem'}
        aria-checked={item.type === 'toggle' || item.type === 'radio' ? !!item.checked : undefined}
        aria-haspopup={itemHasSubmenu(item) ? 'menu' : undefined}
        aria-expanded={itemHasSubmenu(item) ? openSubId === item.id : undefined}
        disabled={item.disabled}
        onmouseenter={(e) => {
          if (!opts?.root) return;
          if (itemHasSubmenu(item)) openSubmenu(item, e.currentTarget as HTMLElement);
          else closeSubmenu();
        }}
        onclick={(e) => handleItemClick(item, e)}
      >
        {#if item.icon}
          <span class="uiv2-popup-menu__icon" aria-hidden="true">{@html item.icon}</span>
        {:else if item.type === 'radio'}
          <span
            class="uiv2-popup-menu__icon"
            class:uiv2-popup-menu__icon--check={item.checked}
            aria-hidden="true"
          >
            {#if item.checked}
              {@html iconCheck(16)}
            {/if}
          </span>
        {:else}
          <span class="uiv2-popup-menu__icon uiv2-popup-menu__icon--empty" aria-hidden="true"></span>
        {/if}
        <span class="uiv2-popup-menu__label">{item.label}</span>
        {#if item.type === 'toggle'}
          <span
            class="uiv2-popup-menu__switch"
            class:uiv2-popup-menu__switch--on={item.checked}
            aria-hidden="true"
          >
            <span class="uiv2-popup-menu__switch-thumb"></span>
          </span>
        {:else if showChevron(item)}
          <span class="uiv2-popup-menu__chevron" aria-hidden="true">{@html iconChevronRight(14)}</span>
        {/if}
      </button>
      {#if item.trailingIcon}
        <UiV2Tooltip
          text={item.trailingLabel ?? ''}
          placement="top"
          showDelay={80}
          disabled={!item.trailingLabel}
          class="uiv2-popup-menu__trailing-tip"
        >
          <button
            type="button"
            class="uiv2-popup-menu__trailing"
            class:uiv2-popup-menu__trailing--active={!!item.trailingActive}
            aria-label={item.trailingLabel ?? 'Дополнительно'}
            disabled={item.disabled}
            onclick={(e) => onTrailing(item, e)}
          >
            {@html item.trailingIcon}
          </button>
        </UiV2Tooltip>
      {/if}
    </li>
  {/if}
{/snippet}

{#if open}
  <div class="uiv2-popup-menu" use:portal aria-hidden="false">
    <div
      bind:this={panelEl}
      class="uiv2-popup-menu__panel"
      class:uiv2-popup-menu__panel--up={!openDown}
      class:uiv2-popup-menu__panel--left={!openRight}
      class:uiv2-popup-menu__panel--wide={panelWide}
      class:uiv2-popup-menu__panel--bridge-right={!!openSubId && subOpenRight}
      class:uiv2-popup-menu__panel--bridge-left={!!openSubId && !subOpenRight}
      style={`left:${left}px;top:${top}px;transform-origin:${originX} ${originY};`}
      role="menu"
      aria-labelledby={labelId}
      tabindex="-1"
      transition:scale={{ duration: 180, start: 0.88, opacity: 0, easing: cubicOut }}
      onpointerenter={() => {
        pointerEnteredPopup = true;
        clearLeavePopupTimer();
      }}
    >
      <span id={labelId} class="uiv2-popup-menu__sr">{title || 'Меню'}</span>
      {#if title || searchable}
        <div class="uiv2-popup-menu__header">
          <div class="uiv2-popup-menu__header-slot">
            {#if searchOpen}
              <!-- svelte-ignore a11y_autofocus -->
              <input
                bind:this={searchInputEl}
                class="uiv2-popup-menu__search-input"
                type="search"
                inputmode={searchInputMode}
                placeholder={searchPlaceholder}
                autocomplete="off"
                spellcheck="false"
                bind:value={searchQuery}
                onclick={(e) => e.stopPropagation()}
                onkeydown={(e) => e.stopPropagation()}
                in:fly={{ x: 20, duration: 180, easing: cubicOut, opacity: 0 }}
                out:fade={{ duration: 100 }}
              />
            {:else if title}
              <span
                class="uiv2-popup-menu__header-title"
                in:fade={{ duration: 140 }}
                out:fly={{ x: -8, duration: 120, easing: cubicOut }}
              >{title}</span>
            {/if}
          </div>
          {#if searchable}
            <button
              type="button"
              class="uiv2-popup-menu__header-btn"
              class:uiv2-popup-menu__header-btn--active={searchOpen}
              aria-label={searchOpen ? 'Закрыть поиск' : 'Поиск'}
              aria-pressed={searchOpen}
              onclick={(e) => {
                e.stopPropagation();
                void toggleSearch();
              }}
            >{@html searchOpen ? iconX(16) : iconSearch(16)}</button>
          {/if}
        </div>
      {/if}
      <ul class="uiv2-popup-menu__list">
        {#each visibleItems as item (item.id)}
          {@render menuRow(item, { root: true })}
        {:else}
          <li class="uiv2-popup-menu__empty" role="presentation">{emptyLabel}</li>
        {/each}
      </ul>
    </div>

    {#if openSubId && activeSubItem && subVisible}
      <div
        bind:this={subPanelEl}
        class="uiv2-popup-menu__panel uiv2-popup-menu__panel--sub"
        class:uiv2-popup-menu__panel--sub-left={!subOpenRight}
        class:uiv2-popup-menu__panel--sub-wide={subWide}
        style={`left:${subLeft}px;top:${subTop}px;`}
        role="menu"
        tabindex="-1"
        transition:scale={{ duration: 150, start: 0.94, opacity: 0, easing: cubicOut }}
        onpointerenter={() => {
          pointerEnteredPopup = true;
          clearLeavePopupTimer();
        }}
      >
        {#if subCustom && submenuContent}
          {@render submenuContent(activeSubItem)}
        {:else}
          <ul class="uiv2-popup-menu__list">
            {#each subItems as item (item.id)}
              {@render menuRow(item)}
            {/each}
          </ul>
        {/if}
      </div>
    {/if}
  </div>
{/if}

<svelte:window
  onkeydown={onWindowKeydown}
  onpointerdown={onWindowPointerDown}
  onpointermove={onWindowPointerMove}
  onpointerup={onWindowPointerUp}
  onpointercancel={onWindowPointerUp}
/>
