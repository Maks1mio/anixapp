<script lang="ts">
  import ReleaseCardUiV2 from '../../../components/ReleaseCardUiV2.svelte';
  import UiV2ReleaseCarousel from '../../../components/uikit-v2/UiV2ReleaseCarousel.svelte';
  import type { ReleaseCardData } from '../../../types/release';

  interface Props {
    items: ReleaseCardData[];
  }

  let { items }: Props = $props();

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
    const scroll = getScrollEl();
    const panel = panelEl;
    if (!scroll || !panel) {
      bgVisible = false;
      return;
    }

    const scrollRect = scroll.getBoundingClientRect();
    const panelRect = panel.getBoundingClientRect();

    bgTop = panelRect.top - scrollRect.top + scroll.scrollTop;
    bgWidth = scroll.offsetWidth;
    bgHeight = panel.offsetHeight;
    bgVisible = true;
  }

  $effect(() => {
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
