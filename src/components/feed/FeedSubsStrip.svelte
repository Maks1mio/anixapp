<script lang="ts">
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import UserAvatar from '../UserAvatar.svelte';
  import { iconChevronLeft, iconChevronRight, iconPin } from '../icons';

  export type FeedSubsItem = {
    id: number;
    title: string;
    avatar?: string | null;
    cover?: string | null;
    isBlog?: boolean;
    fresh?: boolean;
    pinned?: boolean;
  };

  type Props = {
    items: FeedSubsItem[];
    selectedId?: number | null;
    loading?: boolean;
    onSelect: (id: number | null) => void;
    onPin?: (id: number) => void;
  };

  let {
    items,
    selectedId = null,
    loading = false,
    onSelect,
    onPin,
  }: Props = $props();

  let scrollEl = $state<HTMLUListElement | null>(null);
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);
  let hasOverflow = $state(false);

  const SCROLL_EDGE = 4;
  const hasStrip = $derived(items.length > 0 || loading);
  const hasSelection = $derived(selectedId != null);
  const measureKey = $derived(`${items.length}:${loading ? 1 : 0}`);

  function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  function subsFlip(
    node: HTMLElement,
    rects: { from: DOMRect; to: DOMRect },
  ) {
    if (prefersReducedMotion()) return flip(node, rects, { duration: 0 });
    const dx = rects.from.left - rects.to.left;
    if (Math.abs(dx) > 1) node.style.zIndex = '6';
    const animation = flip(node, rects, {
      duration: (d) => Math.min(560, 260 + Math.sqrt(d) * 14),
      easing: cubicOut,
    });
    const css = animation.css;
    return {
      ...animation,
      css: css
        ? (t: number, u: number) => {
          if (t >= 1) node.style.zIndex = '';
          return css(t, u);
        }
        : css,
    };
  }

  function updateScrollState() {
    const el = scrollEl;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    const overflow = scrollWidth > clientWidth + 1;
    hasOverflow = overflow;
    canScrollLeft = overflow && scrollLeft > SCROLL_EDGE;
    canScrollRight = overflow && scrollLeft + clientWidth < scrollWidth - SCROLL_EDGE;
  }

  function getScrollStep(el: HTMLUListElement): number {
    const card = el.firstElementChild as HTMLElement | null;
    if (!card) return 280;
    const gap = parseFloat(getComputedStyle(el).columnGap || getComputedStyle(el).gap) || 0;
    const cardWidth = card.getBoundingClientRect().width;
    return Math.round(cardWidth * 3 + gap * 2);
  }

  let wheelRaf = 0;
  let wheelTarget = 0;

  function cancelWheelAnim() {
    if (!wheelRaf) return;
    cancelAnimationFrame(wheelRaf);
    wheelRaf = 0;
  }

  function clampScroll(el: HTMLElement, left: number): number {
    const max = Math.max(0, el.scrollWidth - el.clientWidth);
    return Math.max(0, Math.min(max, left));
  }

  function tickWheel() {
    const el = scrollEl;
    if (!el) {
      wheelRaf = 0;
      return;
    }
    wheelTarget = clampScroll(el, wheelTarget);
    const cur = el.scrollLeft;
    const dist = wheelTarget - cur;
    if (Math.abs(dist) < 0.4) {
      el.scrollLeft = wheelTarget;
      wheelRaf = 0;
      return;
    }
    el.scrollLeft = cur + dist * 0.2;
    wheelRaf = requestAnimationFrame(tickWheel);
  }

  function scrollByDir(dir: -1 | 1) {
    const el = scrollEl;
    if (!el) return;
    cancelWheelAnim();
    el.scrollBy({ left: dir * getScrollStep(el), behavior: 'smooth' });
  }

  function onStripWheel(e: WheelEvent) {
    const el = e.currentTarget as HTMLElement;
    if (el.scrollWidth <= el.clientWidth + 1) return;
    if (Math.abs(e.deltaY) <= Math.abs(e.deltaX)) return;
    e.preventDefault();

    let delta = e.deltaY;
    if (e.deltaMode === 1) delta *= 16;
    else if (e.deltaMode === 2) delta *= el.clientWidth;

    if (prefersReducedMotion()) {
      cancelWheelAnim();
      el.scrollLeft = clampScroll(el, el.scrollLeft + delta);
      return;
    }

    if (!wheelRaf) wheelTarget = el.scrollLeft;
    wheelTarget = clampScroll(el, wheelTarget + delta);
    if (!wheelRaf) wheelRaf = requestAnimationFrame(tickWheel);
  }

  function onPinClick(e: MouseEvent, id: number) {
    e.stopPropagation();
    e.preventDefault();
    onPin?.(id);
  }

  $effect(() => {
    measureKey;
    const el = scrollEl;
    if (!el) return;

    const update = () => {
      requestAnimationFrame(updateScrollState);
    };

    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    if (el.parentElement) ro.observe(el.parentElement);

    const onScroll = () => updateScrollState();
    el.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', update);

    return () => {
      cancelWheelAnim();
      ro.disconnect();
      el.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', update);
    };
  });
</script>

{#if hasStrip}
  <section class="feed-subs" aria-label="Подписки">
    <div
      class="feed-subs__carousel"
      class:feed-subs__carousel--overflow={hasOverflow}
      class:feed-subs__carousel--can-left={canScrollLeft}
      class:feed-subs__carousel--can-right={canScrollRight}
    >
      <ul
        class="feed-subs__scroll"
        bind:this={scrollEl}
        onwheel={onStripWheel}
      >
        {#each items as item (item.id)}
          {@const active = selectedId === item.id}
          <li class="feed-subs__cell" animate:subsFlip>
            <div class="feed-subs__frame">
              <button
                type="button"
                class="feed-subs__item"
                class:feed-subs__item--active={active}
                class:feed-subs__item--dimmed={hasSelection && !active}
                class:feed-subs__item--fresh={item.fresh && !active}
                class:feed-subs__item--pinned={!!item.pinned}
                onclick={() => onSelect(item.id)}
                title={item.title}
                aria-pressed={active}
                aria-label={item.fresh
                  ? `${item.title}, есть новое`
                  : item.title}
              >
                <span class="feed-subs__avatar-wrap" aria-hidden="true">
                  <span
                    class="feed-subs__avatar"
                    class:feed-subs__avatar--channel={!item.isBlog}
                  >
                    <UserAvatar
                      src={item.avatar}
                      label={item.title}
                      shape={item.isBlog ? 'circle' : 'channel'}
                    />
                  </span>
                  {#if item.fresh && !active}
                    <span class="feed-subs__dot"></span>
                  {/if}
                </span>
                <span class="feed-subs__name">{item.title}</span>
              </button>
              {#if onPin}
                <button
                  type="button"
                  class="feed-subs__pin"
                  class:feed-subs__pin--on={!!item.pinned}
                  title={item.pinned ? 'Открепить' : 'Закрепить'}
                  aria-label={item.pinned ? `Открепить ${item.title}` : `Закрепить ${item.title}`}
                  aria-pressed={!!item.pinned}
                  onclick={(e) => onPinClick(e, item.id)}
                >
                  {@html iconPin(14)}
                </button>
              {/if}
            </div>
          </li>
        {/each}

        {#if loading && items.length === 0}
          {#each Array.from({ length: 5 }) as _, i (`skel-${i}`)}
            <li class="feed-subs__cell" aria-hidden="true">
              <div class="feed-subs__skel">
                <span class="feed-subs__skel-card"></span>
                <span class="feed-subs__skel-name"></span>
              </div>
            </li>
          {/each}
        {/if}
      </ul>

      <div
        class="feed-subs__fade feed-subs__fade--left"
        class:feed-subs__fade--visible={canScrollLeft}
        aria-hidden={!canScrollLeft}
      >
        <button
          type="button"
          class="feed-subs__arrow"
          aria-label="Прокрутить назад"
          tabindex={canScrollLeft ? 0 : -1}
          disabled={!canScrollLeft}
          onclick={() => scrollByDir(-1)}
        >
          {@html iconChevronLeft(20)}
        </button>
      </div>
      <div
        class="feed-subs__fade feed-subs__fade--right"
        class:feed-subs__fade--visible={canScrollRight}
        aria-hidden={!canScrollRight}
      >
        <button
          type="button"
          class="feed-subs__arrow"
          aria-label="Прокрутить вперёд"
          tabindex={canScrollRight ? 0 : -1}
          disabled={!canScrollRight}
          onclick={() => scrollByDir(1)}
        >
          {@html iconChevronRight(20)}
        </button>
      </div>
    </div>
  </section>
{/if}
