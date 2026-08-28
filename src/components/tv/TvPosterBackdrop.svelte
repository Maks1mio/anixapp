<script lang="ts">
  import { onMount } from 'svelte';

  const CARD_SEL = '.uiv2-anime-card:not(.tv-category-see-all)';
  const POSTER_IMG_SEL = '.uiv2-anime-card__poster img';
  const CROSSFADE_MS = 1100;

  let slotA = $state('');
  let slotB = $state('');
  let activeSlot = $state<'a' | 'b'>('a');
  let visible = $state(false);
  let hideTimer: ReturnType<typeof setTimeout> | null = null;

  const activeUrl = $derived(activeSlot === 'a' ? slotA : slotB);

  function posterFromCard(card: Element | null): string {
    if (!card || !(card instanceof HTMLElement)) return '';
    const img = card.querySelector(POSTER_IMG_SEL);
    if (!(img instanceof HTMLImageElement)) return '';
    const src = img.currentSrc || img.src;
    return src && !src.startsWith('data:') ? src : '';
  }

  function posterFromFocused(): string {
    const focused = document.querySelector('[data-tv-focus="true"]');
    if (!focused) return '';
    const card = focused.matches(CARD_SEL)
      ? focused
      : focused.closest(CARD_SEL);
    return posterFromCard(card);
  }

  function setPoster(next: string) {
    if (hideTimer) {
      clearTimeout(hideTimer);
      hideTimer = null;
    }

    if (!next) {
      visible = false;
      hideTimer = setTimeout(() => {
        if (!visible) {
          slotA = '';
          slotB = '';
        }
        hideTimer = null;
      }, CROSSFADE_MS);
      return;
    }

    if (next === activeUrl) {
      visible = true;
      return;
    }

    if (activeSlot === 'a') {
      slotB = next;
      activeSlot = 'b';
    } else {
      slotA = next;
      activeSlot = 'a';
    }
    visible = true;
  }

  function syncFromFocus() {
    setPoster(posterFromFocused());
  }

  function onPointerOver(event: PointerEvent) {
    if (event.pointerType === 'mouse') {
      const card = (event.target as Element | null)?.closest(CARD_SEL);
      if (card) setPoster(posterFromCard(card));
    }
  }

  function onPointerOut(event: PointerEvent) {
    if (event.pointerType !== 'mouse') return;
    const fromCard = (event.target as Element | null)?.closest(CARD_SEL);
    const toCard = (event.relatedTarget as Element | null)?.closest(CARD_SEL);
    if (fromCard && fromCard !== toCard) syncFromFocus();
  }

  onMount(() => {
    const observer = new MutationObserver(syncFromFocus);
    observer.observe(document.body, {
      subtree: true,
      attributes: true,
      attributeFilter: ['data-tv-focus'],
    });

    document.addEventListener('focusin', syncFromFocus, true);
    document.addEventListener('pointerover', onPointerOver, true);
    document.addEventListener('pointerout', onPointerOut, true);

    syncFromFocus();

    return () => {
      observer.disconnect();
      document.removeEventListener('focusin', syncFromFocus, true);
      document.removeEventListener('pointerover', onPointerOver, true);
      document.removeEventListener('pointerout', onPointerOut, true);
      if (hideTimer) clearTimeout(hideTimer);
    };
  });
</script>

<div
  class="tv-layout__hero-bg"
  class:tv-layout__hero-bg--visible={visible && !!activeUrl}
  aria-hidden="true"
>
  {#if slotA}
    <img
      class="tv-layout__hero-bg-img"
      class:tv-layout__hero-bg-img--active={activeSlot === 'a'}
      src={slotA}
      alt=""
      decoding="async"
    />
  {/if}
  {#if slotB}
    <img
      class="tv-layout__hero-bg-img"
      class:tv-layout__hero-bg-img--active={activeSlot === 'b'}
      src={slotB}
      alt=""
      decoding="async"
    />
  {/if}
  <div class="tv-layout__hero-bg-scrim"></div>
</div>
