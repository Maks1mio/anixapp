<script lang="ts">
  import { iconChevronLeft, iconChevronRight } from '../icons';
  import UiV2RoundButton from './UiV2RoundButton.svelte';

  export type UiV2PillBarItem = {
    id: string;
    label: string;
  };

  type Props = {
    items: UiV2PillBarItem[];
    activeIndex?: number;
    backLabel?: string;
    forwardLabel?: string;
    /** Стрелки всегда видны (для превью / постоянного хрома) */
    alwaysShowArrows?: boolean;
    onBack?: () => void;
    onForward?: () => void;
    onSelect?: (index: number) => void;
  };

  let {
    items,
    activeIndex = 0,
    backLabel = 'Назад',
    forwardLabel = 'Вперёд',
    alwaysShowArrows = false,
    onBack,
    onForward,
    onSelect,
  }: Props = $props();

  let rootEl = $state<HTMLElement | undefined>();
  let crumbsEl = $state<HTMLElement | undefined>();
  let hovered = $state(false);
  /** Только клавиатурный фокус — клик мышью не держит стрелки */
  let keyboardFocus = $state(false);

  const safeIndex = $derived(
    items.length === 0 ? 0 : Math.max(0, Math.min(activeIndex, items.length - 1)),
  );
  const canBack = $derived(safeIndex > 0);
  const canForward = $derived(safeIndex < items.length - 1);
  const showArrows = $derived(alwaysShowArrows || hovered || keyboardFocus);

  function scrollActiveIntoView() {
    const root = crumbsEl;
    if (!root) return;
    const active = root.querySelector('.uiv2-pill-bar__crumb--active') as HTMLElement | null;
    active?.scrollIntoView({ behavior: 'smooth', inline: 'center', block: 'nearest' });
  }

  function blurIfInside() {
    const active = document.activeElement;
    if (active instanceof HTMLElement && rootEl?.contains(active)) {
      active.blur();
    }
    keyboardFocus = false;
  }

  function handleBack() {
    if (!canBack) return;
    onBack?.();
    blurIfInside();
  }

  function handleForward() {
    if (!canForward) return;
    onForward?.();
    blurIfInside();
  }

  function handleSelect(index: number) {
    if (index === safeIndex) return;
    onSelect?.(index);
    blurIfInside();
  }

  function onMouseLeave() {
    hovered = false;
    blurIfInside();
  }

  function onFocusIn(e: FocusEvent) {
    // Tab / клавиатура → :focus-visible; клик мышью — нет
    const t = e.target;
    if (t instanceof HTMLElement && t.matches(':focus-visible')) {
      keyboardFocus = true;
    }
  }

  function onFocusOut(e: FocusEvent) {
    const next = e.relatedTarget;
    if (next instanceof Node && rootEl?.contains(next)) return;
    keyboardFocus = false;
  }

  $effect(() => {
    void safeIndex;
    void items.length;
    queueMicrotask(() => scrollActiveIntoView());
  });
</script>

<div
  bind:this={rootEl}
  class="uiv2-pill-bar"
  class:uiv2-pill-bar--arrows={showArrows}
  role="navigation"
  aria-label="Навигация"
  onmouseenter={() => { hovered = true; }}
  onmouseleave={onMouseLeave}
  onfocusin={onFocusIn}
  onfocusout={onFocusOut}
>
  <UiV2RoundButton
    label={backLabel}
    disabled={!canBack}
    tabindex={showArrows ? 0 : -1}
    onclick={handleBack}
  >
    {@html iconChevronLeft(18)}
  </UiV2RoundButton>

  <div class="uiv2-pill-bar__pill" bind:this={crumbsEl}>
    <div class="uiv2-pill-bar__track">
      {#each items as item, i (item.id)}
        {#if i > 0}
          <span class="uiv2-pill-bar__sep" aria-hidden="true"></span>
        {/if}
        <button
          type="button"
          class="uiv2-pill-bar__crumb"
          class:uiv2-pill-bar__crumb--active={i === safeIndex}
          onclick={() => handleSelect(i)}
          aria-current={i === safeIndex ? 'page' : undefined}
        >
          {item.label}
        </button>
      {/each}
    </div>
  </div>

  <UiV2RoundButton
    label={forwardLabel}
    disabled={!canForward}
    tabindex={showArrows ? 0 : -1}
    onclick={handleForward}
  >
    {@html iconChevronRight(18)}
  </UiV2RoundButton>
</div>

