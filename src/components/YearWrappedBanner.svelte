<script lang="ts">
  import { onDestroy, onMount } from 'svelte';
  import gsap from 'gsap';
  import { navigate } from '../stores/navigation';
  import { WRAPPED_YEAR } from '../utils/yearWrapped';
  import {
    animateBannerEnter,
    animateBannerLoop,
    prefersReducedMotion,
  } from '../views/Wrapped/shared/wrapped-animations';

  interface Props {
    previewPosters?: string[];
  }

  let { previewPosters = [] }: Props = $props();

  let rootEl = $state<HTMLElement | null>(null);
  let reduced = prefersReducedMotion();

  const titleBefore = 'Итоги ';
  const titleYear = String(WRAPPED_YEAR);
  const titleAfter = ' года';

  let loopTl: gsap.core.Timeline | null = null;

  onMount(() => {
    if (!rootEl) return;
    animateBannerEnter(rootEl, reduced);
    loopTl = animateBannerLoop(rootEl, reduced);
  });

  onDestroy(() => {
    loopTl?.kill();
  });

  function openWrapped() {
    navigate(`/wrapped/${WRAPPED_YEAR}`);
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      openWrapped();
    }
  }
</script>

<div class="year-wrapped-banner-wrap">
  <button
    type="button"
    class="year-wrapped-banner"
    data-wrapped-banner
    bind:this={rootEl}
    aria-label="Открыть итоги {WRAPPED_YEAR} года"
    onclick={openWrapped}
    onkeydown={handleKeydown}
  >
    <div class="year-wrapped-banner__glow" aria-hidden="true"></div>
    <div class="year-wrapped-banner__gradient" aria-hidden="true"></div>

    <div class="year-wrapped-banner__posters" aria-hidden="true">
      {#each previewPosters.slice(0, 5) as url, i (url + i)}
        <div
          class="year-wrapped-banner__chip"
          style="background-image:url('{url}'); --chip-i:{i}"
        ></div>
      {/each}
    </div>

    <div class="year-wrapped-banner__body">
      <span class="year-wrapped-banner__label">AnixApp Wrapped</span>
      <span class="year-wrapped-banner__title" aria-hidden="true">
        {#each titleBefore.split('') as ch}
          <span class="year-wrapped-banner__char">{ch === ' ' ? '\u00a0' : ch}</span>
        {/each}
        {#each titleYear.split('') as ch}
          <span class="year-wrapped-banner__char year-wrapped-banner__char--year">{ch}</span>
        {/each}
        {#each titleAfter.split('') as ch}
          <span class="year-wrapped-banner__char">{ch === ' ' ? '\u00a0' : ch}</span>
        {/each}
      </span>
      <span class="year-wrapped-banner__subtitle">Смотреть персональные итоги</span>
    </div>

    <span class="year-wrapped-banner__cta" aria-hidden="true">Открыть</span>
  </button>
</div>
