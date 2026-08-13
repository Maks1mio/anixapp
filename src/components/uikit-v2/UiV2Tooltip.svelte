<script lang="ts">
  import type { Snippet } from 'svelte';
  import { tick } from 'svelte';
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../actions/portal';

  export type UiV2TooltipStatus = 'good' | 'medium' | 'bad' | 'offline' | 'neutral';

  export type UiV2TooltipLine = {
    label: string;
    value: string;
  };

  type Placement = 'auto' | 'top' | 'bottom' | 'left' | 'right';

  type Props = {
    /** Однострочный текст (простой режим) */
    text?: string;
    /** Заголовок (расширенный режим) */
    title?: string;
    /** Описание под заголовком */
    description?: string;
    /** Строки «ключ — значение» */
    lines?: UiV2TooltipLine[];
    /** HTML-иконка слева от заголовка */
    icon?: string;
    /** Цветовой индикатор (ping / статус) */
    status?: UiV2TooltipStatus;
    /** Подпись справа (например «42 ms») */
    meta?: string;
    /** Произвольная разметка */
    content?: Snippet;
    /** Триггер */
    children?: Snippet;
    placement?: Placement;
    showDelay?: number;
    hideDelay?: number;
    disabled?: boolean;
    /**
     * Интерактивный tip: pointer-events + не закрывается при наведении на tip.
     * Нужен для popover с кнопками (TitleInfoTrigger и т.п.).
     */
    interactive?: boolean;
    class?: string;
  };

  let {
    text = '',
    title = '',
    description = '',
    lines = [],
    icon,
    status,
    meta = '',
    content,
    children,
    placement = 'auto',
    showDelay = 120,
    hideDelay = 60,
    disabled = false,
    interactive = false,
    class: className = '',
  }: Props = $props();

  const GAP = 10;
  const EDGE = 12;
  const tipId = `uiv2-tooltip-${Math.random().toString(36).slice(2, 9)}`;

  let triggerEl = $state<HTMLElement | null>(null);
  let tipEl = $state<HTMLElement | null>(null);
  let visible = $state(false);
  let below = $state(true);
  let side: 'top' | 'bottom' | 'left' | 'right' = $state('bottom');
  let tipLeft = $state(0);
  let tipTop = $state(0);
  let showTimer: ReturnType<typeof setTimeout> | null = null;
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const hasStructured = $derived(!!title || !!description || lines.length > 0 || !!status || !!meta || !!icon);
  const hasContent = $derived(!!text || !!content || hasStructured);

  function clearTimers() {
    if (showTimer) {
      clearTimeout(showTimer);
      showTimer = null;
    }
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }
  }

  async function updatePosition() {
    if (!triggerEl || !tipEl) return;
    await tick();

    const anchor = triggerEl.getBoundingClientRect();
    const tipRect = tipEl.getBoundingClientRect();
    const tw = tipRect.width || tipEl.offsetWidth;
    const th = tipRect.height || tipEl.offsetHeight;
    const anchorCenterX = anchor.left + anchor.width / 2;
    const anchorCenterY = anchor.top + anchor.height / 2;

    if (placement === 'right' || placement === 'left') {
      side = placement;
      tipTop = Math.max(
        EDGE,
        Math.min(anchorCenterY - th / 2, window.innerHeight - EDGE - th),
      );
      tipLeft =
        placement === 'right'
          ? Math.min(anchor.right + GAP, window.innerWidth - EDGE - tw)
          : Math.max(EDGE, anchor.left - GAP - tw);
      below = false;
      return;
    }

    if (placement === 'bottom') {
      below = true;
      side = 'bottom';
    } else if (placement === 'top') {
      below = false;
      side = 'top';
    } else {
      const spaceAbove = anchor.top;
      const spaceBelow = window.innerHeight - anchor.bottom;
      below = spaceBelow >= spaceAbove;
      side = below ? 'bottom' : 'top';
    }

    tipTop = below ? anchor.bottom + GAP : anchor.top - th - GAP;
    let left = anchorCenterX - tw / 2;
    left = Math.max(EDGE, Math.min(left, window.innerWidth - EDGE - tw));
    tipLeft = left;
  }

  function scheduleShow() {
    if (disabled || !hasContent) return;
    clearTimers();
    showTimer = setTimeout(async () => {
      showTimer = null;
      visible = true;
      await tick();
      await updatePosition();
      requestAnimationFrame(() => updatePosition());
    }, showDelay);
  }

  function scheduleHide() {
    clearTimers();
    hideTimer = setTimeout(() => {
      hideTimer = null;
      visible = false;
    }, hideDelay);
  }

  function onTriggerEnter() {
    scheduleShow();
  }

  function onTriggerLeave(e: FocusEvent | MouseEvent) {
    const related = (e as MouseEvent).relatedTarget as Node | null;
    if (related && triggerEl?.contains(related)) return;
    if (interactive && related && tipEl?.contains(related)) return;
    scheduleHide();
  }

  function onTipEnter() {
    if (!interactive) return;
    clearTimers();
  }

  function onTipLeave(e: MouseEvent) {
    if (!interactive) return;
    const related = e.relatedTarget as Node | null;
    if (related && (triggerEl?.contains(related) || tipEl?.contains(related))) return;
    scheduleHide();
  }

  function onScrollOrResize() {
    if (!visible) return;
    updatePosition();
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && visible) {
      clearTimers();
      visible = false;
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} onscroll={onScrollOrResize} onresize={onScrollOrResize} />

<span
  bind:this={triggerEl}
  class="uiv2-tooltip__trigger {className}"
  aria-describedby={visible && hasContent ? tipId : undefined}
  onmouseenter={onTriggerEnter}
  onmouseleave={onTriggerLeave}
  onfocusin={onTriggerEnter}
  onfocusout={onTriggerLeave}
>
  {@render children?.()}
</span>

{#if visible && hasContent}
  <div
    bind:this={tipEl}
    id={tipId}
    class="uiv2-tooltip"
    class:uiv2-tooltip--rich={hasStructured && !content}
    class:uiv2-tooltip--side={side === 'left' || side === 'right'}
    class:uiv2-tooltip--interactive={interactive}
    role={interactive ? 'dialog' : 'tooltip'}
    data-placement={side}
    style:left="{tipLeft}px"
    style:top="{tipTop}px"
    use:portal
    transition:scale={{ duration: 140, start: 0.97, easing: cubicOut }}
    onmouseenter={onTipEnter}
    onmouseleave={onTipLeave}
  >
    {#if content}
      <div class="uiv2-tooltip__content">
        {@render content()}
      </div>
    {:else if hasStructured}
      <div class="uiv2-tooltip__body">
        {#if title || status || icon || meta}
          <div class="uiv2-tooltip__head">
            <span class="uiv2-tooltip__head-main">
              {#if status}
                <span class="uiv2-status-dot uiv2-status-dot--{status}" aria-hidden="true"></span>
              {/if}
              {#if icon}
                <span class="uiv2-tooltip__icon">{@html icon}</span>
              {/if}
              {#if title}
                <span class="uiv2-tooltip__title">{title}</span>
              {/if}
            </span>
            {#if meta}
              <span class="uiv2-tooltip__meta">{meta}</span>
            {/if}
          </div>
        {/if}
        {#if description}
          <p class="uiv2-tooltip__desc">{description}</p>
        {/if}
        {#if lines.length > 0}
          <dl class="uiv2-tooltip__lines">
            {#each lines as line (line.label)}
              <div class="uiv2-tooltip__line">
                <dt>{line.label}</dt>
                <dd>{line.value}</dd>
              </div>
            {/each}
          </dl>
        {/if}
      </div>
    {:else}
      <span class="uiv2-tooltip__text">{text}</span>
    {/if}
  </div>
{/if}
