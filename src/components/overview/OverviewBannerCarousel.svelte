<script lang="ts">
  import { navigate } from '../../stores/navigation';
  import type { OverviewBanner } from '../../utils/overview';
  import PosterImage from '../PosterImage.svelte';
  import ReleaseCarouselNav from '../../views/Release/components/ReleaseCarouselNav.svelte';

  interface Props {
    items: OverviewBanner[];
  }

  let { items }: Props = $props();

  function openBanner(banner: OverviewBanner) {
    const action = banner.action.trim();
    if (!action) return;

    if (banner.type === 1) {
      const id = parseInt(action, 10);
      if (id) navigate(`/release/${id}`);
      return;
    }
    if (banner.type === 2) {
      window.electron?.openExternal?.(action);
      return;
    }
    if (banner.type === 3) {
      const id = parseInt(action, 10);
      if (id) navigate(`/collection/${id}`);
    }
  }
</script>

{#if items.length > 0}
  <div class="overview-banners">
    <ReleaseCarouselNav measureKey={items.length} navClass="overview-banners__nav" scrollClass="overview-banners__scroll">
      {#each items as banner (banner.id)}
        <button type="button" class="overview-banner" onclick={() => openBanner(banner)}>
          <div class="overview-banner__media">
            {#if banner.image}
              <PosterImage src={banner.image} alt="" loading="eager" />
            {:else}
              <div class="overview-banner__placeholder"></div>
            {/if}
          </div>
          <div class="overview-banner__text">
            {#if banner.title}
              <div class="overview-banner__title">{banner.title}</div>
            {/if}
            {#if banner.description}
              <div class="overview-banner__desc">{banner.description}</div>
            {/if}
          </div>
        </button>
      {/each}
    </ReleaseCarouselNav>
  </div>
{/if}
