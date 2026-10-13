<script lang="ts">
  import { openImageLightboxGallery } from '../_utils';
  import { buildScreenshotUrl } from '../../../utils/posterUrl';
  import PosterImage from '../../../components/PosterImage.svelte';

  interface Props { screenshots: string[]; }
  let { screenshots }: Props = $props();

  const urls = $derived(
    screenshots.slice(0, 8).map((url) => buildScreenshotUrl(url)).filter(Boolean),
  );
</script>

<div class="release-page__section">
  <h2 class="release-page__block-title">Скриншоты</h2>
  <div class="release-page__screenshots">
    {#each urls as fullUrl, i (fullUrl)}
      <button
        type="button"
        class="release-page__screenshot-btn"
        aria-label="Смотреть скриншот"
        onclick={(e) => openImageLightboxGallery(urls, i, e.currentTarget as HTMLElement)}
      >
        <PosterImage src={fullUrl} alt="" />
      </button>
    {/each}
  </div>
</div>
