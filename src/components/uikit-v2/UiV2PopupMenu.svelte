<script lang="ts">
  import type { Snippet } from 'svelte';
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../actions/portal';
  import { tick } from 'svelte';
  import { iconCheck, iconChevronRight } from '../icons';

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
  let subHideTimer: ReturnType<typeof setTimeout> | null = null;
  let lastSubHeight = 0;

  const SUBMENU_GAP = 12;
  const labelId = `uiv2-popup-menu-${Math.random().toString(36).slice(2, 9)}`;

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

  function clearSubHideTimer() {
    if (subHideTimer != null) {
      clearTimeout(subHideTimer);
      subHideTimer = null;
    }
  }

  function closeSubmenu() {
    clearSubHideTimer();
    openSubId = null;
    lastSubHeight = 0;
  }

  function scheduleCloseSubmenu() {
    clearSubHideTimer();
    subHideTimer = setTimeout(() => {
      openSubId = null;
      subHideTimer = null;
    }, 220);
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

  async function placeSubmenu(anchorEl: HTMLElement) {
    await tick();
    const sub = subPanelEl;
    if (!sub) return;
    const pad = 8;
    const gap = SUBMENU_GAP;
    const ar = anchorEl.getBoundingClientRect();
    const w = sub.offsetWidth || 200;
    const h = sub.offsetHeight || 120;
    const vw = window.innerWidth;
    const vh = window.innerHeight;

    const spaceRight = vw - pad - ar.right;
    const spaceLeft = ar.left - pad;
    const preferRight = spaceRight >= w + gap || spaceRight >= spaceLeft;
    subOpenRight = preferRight;

    let nextLeft = preferRight ? ar.right + gap : ar.left - gap - w;
    let nextTop = ar.top - 6;

    // Keep current top when the panel shrinks — otherwise it jumps down,
    // the cursor leaves the panel, and hover-close kills the submenu.
    if (lastSubHeight > 0 && h <= lastSubHeight && subTop > 0) {
      nextTop = subTop;
    }

    nextLeft = Math.max(pad, Math.min(nextLeft, vw - pad - w));
    nextTop = Math.max(pad, Math.min(nextTop, vh - pad - h));

    subLeft = nextLeft;
    subTop = nextTop;
    lastSubHeight = h;
  }

  function openSubmenu(item: UiV2PopupMenuItem, rowEl: HTMLElement) {
    if (!itemHasSubmenu(item)) {
      closeSubmenu();
      return;
    }
    clearSubHideTimer();
    openSubId = item.id;
    void placeSubmenu(rowEl);
  }

  $effect(() => {
    if (!open) {
      closeSubmenu();
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
    if (!open || !openSubId || !subVisible) return;
    void tick().then(() => {
      const row = panelEl?.querySelector<HTMLElement>(`[data-menu-id="${CSS.escape(openSubId!)}"]`);
      if (row) void placeSubmenu(row);
    });
  });

  $effect(() => {
    if (!open || !openSubId || !subPanelEl) return;
    const row = () => panelEl?.querySelector<HTMLElement>(`[data-menu-id="${CSS.escape(openSubId!)}"]`);
    const ro = typeof ResizeObserver !== 'undefined'
      ? new ResizeObserver(() => {
          const el = row();
          if (el) void placeSubmenu(el);
        })
      : null;
    ro?.observe(subPanelEl);
    return () => ro?.disconnect();
  });

  function onWindowKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (openSubId) closeSubmenu();
      else onClose?.();
    }
  }

  function onWindowPointerDown(e: PointerEvent) {
    if (!open) return;
    const t = e.target;
    if (t instanceof Node) {
      if (panelEl?.contains(t) || subPanelEl?.contains(t)) return;
    }
    onClose?.();
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
    <li role="none">
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
          clearSubHideTimer();
          if (itemHasSubmenu(item)) openSubmenu(item, e.currentTarget as HTMLElement);
          else closeSubmenu();
        }}
        onmouseleave={() => {
          if (opts?.root && itemHasSubmenu(item)) scheduleCloseSubmenu();
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
      style={`left:${left}px;top:${top}px;transform-origin:${originX} ${originY};`}
      role="menu"
      aria-labelledby={labelId}
      tabindex="-1"
      transition:scale={{ duration: 180, start: 0.88, opacity: 0, easing: cubicOut }}
    >
      <span id={labelId} class="uiv2-popup-menu__sr">Меню</span>
      <ul class="uiv2-popup-menu__list">
        {#each items as item (item.id)}
          {@render menuRow(item, { root: true })}
        {/each}
      </ul>
    </div>

    {#if openSubId && activeSubItem && subVisible}
      <!-- svelte-ignore a11y_no_static_element_interactions -->
      <div
        bind:this={subPanelEl}
        class="uiv2-popup-menu__panel uiv2-popup-menu__panel--sub"
        class:uiv2-popup-menu__panel--sub-left={!subOpenRight}
        class:uiv2-popup-menu__panel--sub-wide={subWide}
        style={`left:${subLeft}px;top:${subTop}px;`}
        role="menu"
        tabindex="-1"
        transition:scale={{ duration: 150, start: 0.94, opacity: 0, easing: cubicOut }}
        onmouseenter={clearSubHideTimer}
        onmouseleave={scheduleCloseSubmenu}
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

<svelte:window onkeydown={onWindowKeydown} onpointerdown={onWindowPointerDown} />
