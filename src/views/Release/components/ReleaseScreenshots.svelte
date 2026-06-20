<script lang="ts">
  import { openImageLightbox } from '../_utils';
  import { buildScreenshotUrl } from '../../../utils/posterUrl';
  import PosterImage from '../../../components/PosterImage.svelte';

  interface Props { screenshots: string[]; }
  let { screenshots }: Props = $props();
</script>

<div class="release-page__section">
  <h2 class="release-page__block-title">Скриншоты</h2>
  <div class="release-page__screenshots">
    {#each screenshots.slice(0, 8) as url}
      {@const fullUrl = buildScreenshotUrl(url)}
      <button type="button" class="release-page__screenshot-btn" onclick={() => openImageLightbox(fullUrl)}>
        <PosterImage src={fullUrl} alt="" />
      </button>
    {/each}
  </div>
</div>
