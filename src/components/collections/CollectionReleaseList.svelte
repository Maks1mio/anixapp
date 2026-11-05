<script lang="ts">
  /**
   * Список тайтлов редактора с перетаскиванием на pointer-событиях: соседи плавно разъезжаются,
   * под строкой видно место вставки, у краёв прокрутки список едет сам. Мышью строку можно тянуть
   * целиком; на тач-экране — только за ручку, чтобы свайп оставался прокруткой.
   */
  import { onDestroy, tick } from 'svelte';
  import { flip } from 'svelte/animate';
  import { fade } from 'svelte/transition';
  import { iconGripVertical, iconX } from '../icons';
  import UiV2RoundButton from '../uikit-v2/UiV2RoundButton.svelte';
  import { toPosterDisplayUrl } from '../../utils/posterUrl';
  import {
    mapReleaseRawToCard,
    releaseCardMeta,
    releaseCardTitle,
    releaseListStatusLabel,
  } from '../../utils/release-card';

  type Raw = Record<string, unknown>;

  interface Props {
    releases: Raw[];
    onReorder: (next: Raw[]) => void;
    onRemove: (id: number) => void;
  }

  let { releases, onReorder, onRemove }: Props = $props();

  const DRAG_THRESHOLD = 4;
  const DROP_MS = 180;
  const EDGE_PX = 88;
  const MAX_SCROLL_PER_FRAME = 16;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  type DragState = {
    from: number;
    /** Куда встанет строка, если отпустить */
    over: number;
    dy: number;
    height: number;
    gap: number;
    tops: number[];
    heights: number[];
    dropping: boolean;
  };

  let listEl = $state<HTMLElement | null>(null);
  let drag = $state<DragState | null>(null);

  const cards = $derived(releases.map((raw) => ({ raw, card: mapReleaseRawToCard(raw) })));

  let press: { index: number; pointerId: number; startY: number; lastY: number } | null = null;
  let scroller: HTMLElement | null = null;
  let startScrollTop = 0;
  let rafId = 0;
  let dropTimer: ReturnType<typeof setTimeout> | undefined;

  function findScroller(el: HTMLElement): HTMLElement {
    for (let node = el.parentElement; node; node = node.parentElement) {
      const { overflowY } = getComputedStyle(node);
      if ((overflowY === 'auto' || overflowY === 'scroll') && node.scrollHeight > node.clientHeight) return node;
    }
    return document.scrollingElement as HTMLElement;
  }

  function shiftOf(index: number, d: DragState): number {
    if (index === d.from) return d.dy;
    const step = d.height + d.gap;
    if (d.from < d.over && index > d.from && index <= d.over) return -step;
    if (d.over < d.from && index >= d.over && index < d.from) return step;
    return 0;
  }

  function slotTop(d: DragState): number {
    return d.over <= d.from ? d.tops[d.over] : d.tops[d.over] + d.heights[d.over] - d.height;
  }

  function onPointerDown(e: PointerEvent, index: number) {
    if (e.button !== 0 || drag || !e.isPrimary) return;
    const target = e.target as Element;
    const onHandle = !!target.closest('.collection-editor__handle');
    if (!onHandle && (e.pointerType !== 'mouse' || target.closest('button, a, input'))) return;
    if (e.pointerType === 'mouse') e.preventDefault();
    press = { index, pointerId: e.pointerId, startY: e.clientY, lastY: e.clientY };
    window.addEventListener('pointermove', onPointerMove);
    window.addEventListener('pointerup', onPointerUp);
    window.addEventListener('pointercancel', onPointerCancel);
    window.addEventListener('keydown', onDragKeydown, true);
  }

  function startDrag() {
    if (!press || !listEl) return;
    const rows = [...listEl.querySelectorAll<HTMLElement>(':scope > .collection-editor__row')];
    const tops = rows.map((row) => row.offsetTop);
    const heights = rows.map((row) => row.offsetHeight);
    const from = press.index;
    drag = {
      from,
      over: from,
      dy: 0,
      height: heights[from],
      gap: rows.length > 1 ? tops[1] - tops[0] - heights[0] : 0,
      tops,
      heights,
      dropping: false,
    };
    scroller = findScroller(listEl);
    startScrollTop = scroller.scrollTop;
    document.body.classList.add('collection-editor--grabbing');
    rafId = requestAnimationFrame(autoScroll);
  }

  function updateDrag() {
    if (!press || !drag || !scroller) return;
    const d = drag;
    const rawDy = press.lastY - press.startY + scroller.scrollTop - startScrollTop;
    const last = d.tops.length - 1;
    const minDy = -d.tops[d.from];
    const maxDy = d.tops[last] + d.heights[last] - d.height - d.tops[d.from];
    d.dy = Math.min(maxDy, Math.max(minDy, rawDy));
    const center = d.tops[d.from] + d.dy + d.height / 2;
    let over = 0;
    d.tops.forEach((top, i) => {
      if (i !== d.from && top + d.heights[i] / 2 < center) over += 1;
    });
    d.over = over;
  }

  function autoScroll() {
    if (!press || !drag || !scroller) return;
    const rect = scroller.getBoundingClientRect();
    const top = Math.max(rect.top, 0);
    const bottom = Math.min(rect.bottom, window.innerHeight);
    const y = press.lastY;
    const strength = y < top + EDGE_PX ? -(top + EDGE_PX - y) : y > bottom - EDGE_PX ? y - (bottom - EDGE_PX) : 0;
    if (strength) {
      const ratio = Math.min(1, Math.abs(strength) / EDGE_PX);
      scroller.scrollTop += Math.sign(strength) * Math.ceil(ratio * ratio * MAX_SCROLL_PER_FRAME);
      updateDrag();
    }
    rafId = requestAnimationFrame(autoScroll);
  }

  function onPointerMove(e: PointerEvent) {
    if (!press || e.pointerId !== press.pointerId) return;
    press.lastY = e.clientY;
    if (!drag) {
      if (Math.abs(e.clientY - press.startY) < DRAG_THRESHOLD) return;
      startDrag();
    }
    updateDrag();
  }

  function removeListeners() {
    window.removeEventListener('pointermove', onPointerMove);
    window.removeEventListener('pointerup', onPointerUp);
    window.removeEventListener('pointercancel', onPointerCancel);
    window.removeEventListener('keydown', onDragKeydown, true);
    cancelAnimationFrame(rafId);
    document.body.classList.remove('collection-editor--grabbing');
    press = null;
  }

  function moved(from: number, to: number): Raw[] {
    const next = [...releases];
    const [item] = next.splice(from, 1);
    next.splice(to, 0, item);
    return next;
  }

  function finish(cancelled: boolean) {
    const d = drag;
    removeListeners();
    if (!d) return;
    if (cancelled) d.over = d.from;
    d.dropping = true;
    d.dy = slotTop(d) - d.tops[d.from];
    // Строка доезжает до места, и только потом порядок меняется: DOM встаёт туда же, без скачка.
    dropTimer = setTimeout(
      () => {
        if (d.over !== d.from) onReorder(moved(d.from, d.over));
        drag = null;
      },
      reducedMotion ? 0 : DROP_MS,
    );
  }

  function onPointerUp(e: PointerEvent) {
    if (press && e.pointerId === press.pointerId) finish(false);
  }

  function onPointerCancel(e: PointerEvent) {
    if (press && e.pointerId === press.pointerId) finish(true);
  }

  function onDragKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape' || !drag) return;
    e.preventDefault();
    e.stopPropagation();
    finish(true);
  }

  /** С клавиатуры: стрелки на ручке двигают строку на одну позицию. */
  async function onHandleKeydown(e: KeyboardEvent, index: number) {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const to = index + (e.key === 'ArrowUp' ? -1 : 1);
    if (to < 0 || to >= releases.length) return;
    onReorder(moved(index, to));
    await tick();
    listEl?.querySelectorAll<HTMLElement>('.collection-editor__handle')[to]?.focus();
  }

  onDestroy(() => {
    removeListeners();
    clearTimeout(dropTimer);
  });
</script>

<ul
  bind:this={listEl}
  class="collection-editor__rows"
  class:collection-editor__rows--active={!!drag}
>
  {#if drag}
    <li
      class="collection-editor__slot"
      aria-hidden="true"
      style:top="{slotTop(drag)}px"
      style:height="{drag.height}px"
    ></li>
  {/if}
  {#each cards as { raw, card }, index (raw.id)}
    {@const statusLabel = releaseListStatusLabel(card.listStatus)}
    {@const title = releaseCardTitle(card)}
    {@const shift = drag ? shiftOf(index, drag) : 0}
    <!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
    <li
      class="collection-editor__row"
      class:collection-editor__row--dragged={drag?.from === index}
      class:collection-editor__row--dropping={drag?.from === index && drag.dropping}
      style:transform={drag ? `translateY(${shift}px)` : undefined}
      onpointerdown={(e) => onPointerDown(e, index)}
      animate:flip={{ duration: reducedMotion ? 0 : (d) => Math.min(320, 120 + Math.sqrt(d) * 8) }}
      out:fade={{ duration: reducedMotion ? 0 : 140 }}
    >
      <button
        type="button"
        class="collection-editor__handle"
        aria-label={`Переместить «${title}», позиция ${index + 1} из ${releases.length}`}
        onkeydown={(e) => void onHandleKeydown(e, index)}
      >
        {@html iconGripVertical(18)}
      </button>
      <div class="collection-editor__row-poster">
        {#if card.poster}
          <img src={toPosterDisplayUrl(card.poster, 'cardHorizontal')} alt="" draggable="false" />
        {/if}
        {#if statusLabel}
          <span class="collection-editor__row-badge">{statusLabel}</span>
        {/if}
      </div>
      <div class="collection-editor__row-body">
        <h4 class="collection-editor__row-title">{title}</h4>
        <p class="collection-editor__row-meta">{releaseCardMeta(card)}</p>
        {#if card.description}
          <p class="collection-editor__row-desc">{card.description}</p>
        {/if}
      </div>
      <UiV2RoundButton
        size="sm"
        class="collection-editor__row-remove"
        label={`Убрать «${title}» из коллекции`}
        onclick={() => onRemove(Number(raw.id))}
      >
        {@html iconX(16)}
      </UiV2RoundButton>
    </li>
  {/each}
</ul>
