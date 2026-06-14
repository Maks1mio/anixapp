<script lang="ts">
  import { openImageLightbox } from '../_utils';

  interface Props { screenshots: string[]; }
  let { screenshots }: Props = $props();
</script>

<div class="release-page__section">
  <h2 class="release-page__block-title">Скриншоты</h2>
  <div class="release-page__screenshots">
    {#each screenshots.slice(0, 8) as url}
      {@const fullUrl = url.startsWith('http') ? url : `https://s.anixmirai.com/screenshots/${url}.jpg`}
      <button type="button" class="release-page__screenshot-btn" onclick={() => openImageLightbox(fullUrl)}>
        <img src={fullUrl} alt="" loading="lazy" />
      </button>
    {/each}
  </div>
</div>
