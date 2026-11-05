<script lang="ts">
  import { openImageLightboxGallery } from '../_utils';
  import PosterImage from '../../../components/PosterImage.svelte';

  /** Ready-to-load URLs: Anixart's (built by the page) or anixmedia's. */
  interface Props { screenshots: string[]; }
  let { screenshots }: Props = $props();

  const urls = $derived(screenshots.slice(0, 8).filter(Boolean));

  /**
   * anixmedia frames live on our own host: a plain <img>. PosterImage is for Anixart's CDN —
   * after 8 s it switches to a made-up `mirror-*` host, which doesn't exist for ours.
   */
  const isOwnMedia = (url: string) => url.includes('/api/anixapp/files/');
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
        {#if isOwnMedia(fullUrl)}
          <img src={fullUrl} alt="" loading="lazy" decoding="async" />
        {:else}
          <PosterImage src={fullUrl} alt="" />
        {/if}
      </button>
    {/each}
  </div>
</div>
