<script lang="ts">
  import type { Snippet } from 'svelte';
  import { onMount } from 'svelte';
  import { fade } from 'svelte/transition';
  import { iconChevronLeft } from './icons';
  import UiV2RoundButton from './uikit-v2/UiV2RoundButton.svelte';

  interface Props {
    title: string;
    subtitle?: string;
    /** Картинка для размытого фона баннера (обложка первого элемента) */
    backdrop?: string | null;
    backLabel?: string;
    onBack?: () => void;
    actions?: Snippet;
    /** Нижняя полоса баннера (вкладки, фильтры) — дублируется в компактной панели */
    children?: Snippet;
    /** Под нижней полосой, только в полном баннере (строка фильтров) — в компактную панель не попадает */
    below?: Snippet;
  }

  let { title, subtitle, backdrop, backLabel = 'Назад', onBack, actions, children, below }: Props = $props();

  /** Последний известный фон: пока список перезагружается, старый цвет держится до прихода нового */
  let shownBackdrop = $state<string | null>(null);
  /** Баннер ушёл под верхний край — показываем компактную панель поверх контента */
  let docked = $state(false);
  let heroEl: HTMLElement | undefined = $state();

  $effect(() => {
    if (backdrop) shownBackdrop = backdrop;
  });

  onMount(() => {
    if (!heroEl) return;
    const root = (heroEl.closest('.page__scroll') as HTMLElement | null)
      ?? document.getElementById('content');
    // Панель не меняет раскладку (лежит поверх), поэтому прокрутка не дёргается
    const io = new IntersectionObserver(
      ([entry]) => { docked = !entry.isIntersecting; },
      { root, rootMargin: '-72px 0px 0px 0px', threshold: 0 },
    );
    io.observe(heroEl);
    return () => io.disconnect();
  });
</script>

{#snippet background()}
  <div class="discover-hero__bg" aria-hidden="true">
    {#if shownBackdrop}
      {#key shownBackdrop}
        <img
          class="discover-hero__backdrop"
          src={shownBackdrop}
          alt=""
          decoding="async"
          transition:fade={{ duration: 900 }}
        />
      {/key}
    {/if}
  </div>
{/snippet}

<div class="discover-hero-dock">
  <div
    class="discover-hero-dock__bar"
    class:discover-hero-dock__bar--visible={docked}
    aria-hidden={!docked}
    inert={!docked}
  >
    {@render background()}
    <span class="discover-hero__title discover-hero-dock__title">{title}</span>
    {#if children}
      <div class="discover-hero__foot discover-hero-dock__foot">
        {@render children()}
      </div>
    {/if}
  </div>
</div>

<header class="discover-hero" class:discover-hero--with-foot={!!children} bind:this={heroEl}>
  {@render background()}

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

  {#if below}
    <div class="discover-hero__below">
      {@render below()}
    </div>
  {/if}
</header>
