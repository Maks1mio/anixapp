<script lang="ts">
  import { flip } from 'svelte/animate';
  import { cubicOut } from 'svelte/easing';
  import UserAvatar from '../UserAvatar.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from '../uikit-v2/UiV2PopupMenu.svelte';
  import { iconChevronDown, iconChevronLeft, iconChevronRight, iconPin, iconPlus, iconUsers } from '../icons';

  export type FeedStoryItem = {
    id: number;
    title: string;
    avatar?: string | null;
    cover?: string | null;
    isBlog?: boolean;
    fresh?: boolean;
    pinned?: boolean;
  };

  type Props = {
    items: FeedStoryItem[];
    selectedId?: number | null;
    loading?: boolean;
    createBusy?: boolean;
    onSelect: (id: number) => void;
    onPin?: (id: number) => void;
    onCreate?: () => void;
    onManaged?: () => void;
  };

  let {
    items,
    selectedId = null,
    loading = false,
    createBusy = false,
    onSelect,
    onPin,
    onCreate,
    onManaged,
  }: Props = $props();

  let createOpen = $state(false);
  let createX = $state(0);
  let createY = $state(0);
  let createBtn = $state<HTMLButtonElement | null>(null);
  let scrollEl = $state<HTMLUListElement | null>(null);
  let canScrollLeft = $state(false);
  let canScrollRight = $state(false);
  let hasOverflow = $state(false);

  const SCROLL_EDGE = 4;
  const hasStrip = $derived(items.length > 0 || loading);
  const hasCreate = $derived(!!onCreate || !!onManaged);
  const measureKey = $derived(`${items.length}:${loading ? 1 : 0}`);

  const createItems = $derived.by((): UiV2PopupMenuItem[] => {
    const list: UiV2PopupMenuItem[] = [];
    if (onCreate) {
      list.push({
        id: 'blog',
        label: createBusy ? 'Создание…' : 'Создать блог',
        icon: iconPlus(16),
        disabled: createBusy,
      });
    }
    if (onManaged) {
      list.push({
        id: 'managed',
        label: 'Управляемые',
        icon: iconUsers(16),
        dividerBefore: list.length > 0,
      });
    }
    return list;
  });

  function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
      && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
  }

  function storyFlip(
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

  function coverStyle(url: string | null | undefined): string | undefined {
    if (!url) return undefined;
    const safe = url.replace(/\\/g, '/').replace(/"/g, '%22');
    return `--feed-story-cover:url("${safe}")`;
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

  function toggleCreate(e: MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    if (createOpen) {
      createOpen = false;
      return;
    }
    const el = createBtn;
    if (!el) return;
    const r = el.getBoundingClientRect();
    createX = r.left + r.width / 2;
    createY = r.bottom;
    createOpen = true;
  }

  function onCreateSelect(id: string) {
    createOpen = false;
    if (id === 'blog') onCreate?.();
    if (id === 'managed') onManaged?.();
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
  <section class="feed-stories" aria-label="Пользователи ленты">
    <div
      class="feed-stories__carousel"
      class:feed-stories__carousel--overflow={hasOverflow}
      class:feed-stories__carousel--can-left={canScrollLeft}
      class:feed-stories__carousel--can-right={canScrollRight}
    >
      <ul
        class="feed-stories__scroll"
        bind:this={scrollEl}
        onwheel={onStripWheel}
      >
        {#each items as item (item.id)}
          {@const active = selectedId === item.id}
          <li class="feed-stories__cell" animate:storyFlip>
            <div class="feed-stories__frame">
              <button
                type="button"
                class="feed-stories__item"
                class:feed-stories__item--active={active}
                class:feed-stories__item--fresh={item.fresh && !active}
                class:feed-stories__item--pinned={!!item.pinned}
                onclick={() => onSelect(item.id)}
                title={item.title}
                aria-pressed={active}
                aria-label={item.fresh
                  ? `${item.title}, есть новое`
                  : item.title}
              >
                <span
                  class="feed-stories__card"
                  class:feed-stories__card--empty={!item.cover}
                  style={coverStyle(item.cover)}
                  aria-hidden="true"
                >
                  <span
                    class="feed-stories__avatar"
                    class:feed-stories__avatar--channel={!item.isBlog}
                    class:feed-stories__avatar--fresh={item.fresh}
                  >
                    <UserAvatar
                      src={item.avatar}
                      label={item.title}
                      shape={item.isBlog ? 'circle' : 'channel'}
                    />
                  </span>
                </span>
                <span class="feed-stories__name">{item.title}</span>
              </button>
              {#if onPin}
                <button
                  type="button"
                  class="feed-stories__pin"
                  class:feed-stories__pin--on={!!item.pinned}
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
            <li class="feed-stories__cell" aria-hidden="true">
              <div class="feed-stories__skel">
                <span class="feed-stories__skel-card"></span>
                <span class="feed-stories__skel-name"></span>
              </div>
            </li>
          {/each}
        {/if}
      </ul>

      <div
        class="feed-stories__fade feed-stories__fade--left"
        class:feed-stories__fade--visible={canScrollLeft}
        aria-hidden={!canScrollLeft}
      >
        <button
          type="button"
          class="feed-stories__arrow"
          aria-label="Прокрутить назад"
          tabindex={canScrollLeft ? 0 : -1}
          disabled={!canScrollLeft}
          onclick={() => scrollByDir(-1)}
        >
          {@html iconChevronLeft(20)}
        </button>
      </div>
      <div
        class="feed-stories__fade feed-stories__fade--right"
        class:feed-stories__fade--visible={canScrollRight}
        aria-hidden={!canScrollRight}
      >
        <button
          type="button"
          class="feed-stories__arrow"
          aria-label="Прокрутить вперёд"
          tabindex={canScrollRight ? 0 : -1}
          disabled={!canScrollRight}
          onclick={() => scrollByDir(1)}
        >
          {@html iconChevronRight(20)}
        </button>
      </div>
    </div>

    {#if hasCreate}
      <div class="feed-stories__create-row">
        <button
          type="button"
          class="feed-stories__create"
          bind:this={createBtn}
          onclick={toggleCreate}
          disabled={createBusy}
          aria-haspopup="menu"
          aria-expanded={createOpen}
        >
          <span class="feed-stories__create-icon" aria-hidden="true">{@html iconPlus(16)}</span>
          <span>Создать</span>
          <span class="feed-stories__create-chevron" aria-hidden="true">{@html iconChevronDown(14)}</span>
        </button>
      </div>
      <UiV2PopupMenu
        open={createOpen}
        x={createX}
        y={createY}
        placement="anchor"
        items={createItems}
        onClose={() => {
          createOpen = false;
        }}
        onSelect={onCreateSelect}
      />
    {/if}
  </section>
{/if}
