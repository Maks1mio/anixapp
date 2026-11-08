<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { iconChevronLeft } from './icons';
  import UiV2RoundButton from './uikit-v2/UiV2RoundButton.svelte';
  import { isMobileMode } from '../platform/mobile';

  interface Props {
    title: string;
    subtitle?: string;
    backLabel?: string;
    onBack?: () => void;
    actions?: Snippet;
    /** Полоса под заголовком (вкладки) — при прокрутке закрепляется у верхнего края */
    children?: Snippet;
  }

  let { title, subtitle, backLabel = 'Назад', onBack, actions, children }: Props = $props();

  /** Шапка ушла под верхний край — показываем её полосу поверх контента */
  let docked = $state(false);
  let heroEl: HTMLElement | undefined = $state();

  onMount(() => {
    if (!heroEl) return;
    const root = (heroEl.closest('.page__scroll') as HTMLElement | null)
      ?? document.getElementById('content');
    // Панель не меняет раскладку (лежит поверх), поэтому прокрутка не дёргается.
    // Отступ — низ вкладок в закреплённой панели: она появляется, когда настоящие встали на её место.
    const io = new IntersectionObserver(
      ([entry]) => { docked = !entry.isIntersecting; },
      { root, rootMargin: `-${isMobileMode() ? 48 : 52}px 0px 0px 0px`, threshold: 0 },
    );
    io.observe(heroEl);
    return () => io.disconnect();
  });
</script>

<div class="discover-hero-dock">
  <div
    class="discover-hero-dock__bar"
    class:discover-hero-dock__bar--visible={docked}
    aria-hidden={!docked}
    inert={!docked}
  >
    {#if children}
      <div class="discover-hero__foot">
        {@render children()}
      </div>
    {/if}
  </div>
</div>

<header class="discover-hero" bind:this={heroEl}>
  <div class="discover-hero__head">
    <div class="discover-hero__lead">
      {#if onBack}
        <UiV2RoundButton label={backLabel} class="discover-hero__back" onclick={onBack}>
          {@html iconChevronLeft(20)}
        </UiV2RoundButton>
      {/if}
      <div class="discover-hero__text">
        <h1 class="discover-hero__title">{title}</h1>
        {#if subtitle}
          <p class="discover-hero__subtitle">{subtitle}</p>
        {/if}
      </div>
    </div>
    {#if actions}
      <div class="discover-hero__actions">
        {@render actions()}
      </div>
    {/if}
  </div>

  {#if children}
    <div class="discover-hero__foot">
      {@render children()}
    </div>
  {/if}
</header>
