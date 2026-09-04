<script lang="ts">
  import ReleaseCardUiV2 from '../../../components/ReleaseCardUiV2.svelte';
  import UiV2ReleaseCarousel from '../../../components/uikit-v2/UiV2ReleaseCarousel.svelte';
  import type { ReleaseCardData } from '../../../types/release';

  interface Props {
    items: ReleaseCardData[];
    tvMode?: boolean;
  }

  let { items, tvMode = false }: Props = $props();

  let sectionEl = $state<HTMLElement | undefined>();
  let panelEl = $state<HTMLElement | undefined>();
  let bgVisible = $state(false);
  let bgTop = $state(0);
  let bgWidth = $state(0);
  let bgHeight = $state(0);

  function getScrollEl(): HTMLElement | null {
    return sectionEl?.closest('.page__scroll') as HTMLElement | null;
  }

  function syncPanelBg() {
    const section = sectionEl;
    const panel = panelEl;
    if (!section || !panel) {
      bgVisible = false;
      return;
    }

    bgTop = panel.offsetTop;
    bgWidth = section.offsetWidth;
    bgHeight = panel.offsetHeight;
    bgVisible = true;
  }

  $effect(() => {
    if (tvMode) {
      bgVisible = false;
      return;
    }

    items.length;
    const panel = panelEl;
    const scroll = getScrollEl();
    if (!panel || !scroll) {
      bgVisible = false;
      return;
    }

    const update = () => requestAnimationFrame(syncPanelBg);

    update();
    const ro = new ResizeObserver(update);
    ro.observe(panel);
    ro.observe(scroll);

    scroll.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    return () => {
      ro.disconnect();
      scroll.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  });
</script>

{#if items.length > 0}
  {#if tvMode}
    <section
      class="tv-home-row tv-release-page__recommended-row"
      aria-label="Рекомендуем также"
      data-tv-release-section="recommended"
    >
      <h2 class="tv-home-row__title">Рекомендуем также</h2>

      <UiV2ReleaseCarousel measureKey={items.length} class="tv-release-carousel">
        {#each items as item (item.id)}
          <div class="uiv2-carousel__item" data-tv-release-id={item.id}>
            <ReleaseCardUiV2 data={item} variant="vertical" showMenu={false} />
          </div>
        {/each}
      </UiV2ReleaseCarousel>
    </section>
  {:else}
    <div class="release-page__recommended" bind:this={sectionEl}>
      {#if bgVisible}
        <div
          class="release-page__section-bg"
          aria-hidden="true"
          style:top="{bgTop}px"
          style:width="{bgWidth}px"
          style:height="{bgHeight}px"
        ></div>
      {/if}

      <div class="release-page__recommended-panel" bind:this={panelEl}>
        <h2 class="release-page__block-title">Рекомендуем также</h2>

        <UiV2ReleaseCarousel measureKey={items.length}>
          {#each items as item (item.id)}
            <div class="uiv2-carousel__item">
              <ReleaseCardUiV2 data={item} variant="vertical" />
            </div>
          {/each}
        </UiV2ReleaseCarousel>
      </div>
    </div>
  {/if}
{/if}
