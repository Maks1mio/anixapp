<script lang="ts">
  import WrappedScreenShell from '../components/WrappedScreenShell.svelte';
  import type { WrappedData } from '../shared/wrapped-load';
  import { resolveCdnAssetUrl } from '../../../utils/posterUrl';

  interface Props { data: WrappedData; }
  let { data }: Props = $props();

  const count = $derived(data.collections.length);

  function collectionTitle(c: Record<string, unknown>): string {
    return String(c.title ?? c.name ?? 'Коллекция');
  }
  function collectionImage(c: Record<string, unknown>): string {
    const img = c.image ?? c.cover;
    return typeof img === 'string' ? resolveCdnAssetUrl(img) : '';
  }
</script>

<WrappedScreenShell id="collections" align="start">
  <div class="rewind-collections">
    <h2 class="rewind-collections__title" data-wrapped-animate>Твои коллекции</h2>

    <div class="rewind-collections__row">
      {#each data.collections.slice(0, 4) as col, i (i)}
        {@const cover = collectionImage(col)}
        <div class="rewind-collection-card" data-wrapped-animate style="--i:{i}">
          <span
            class="rewind-collection-card__cover"
            style={cover ? `background-image:url('${cover}')` : ''}
          ></span>
          <span class="rewind-collection-card__name">{collectionTitle(col)}</span>
        </div>
      {/each}
      {#if count > 4}
        <div class="rewind-collection-card rewind-collection-card--more" data-wrapped-animate>
          <span class="rewind-collection-card__more">+{count - 4}</span>
        </div>
      {/if}
    </div>

    <p class="rewind-collections__note" data-wrapped-animate>
      {#if count < 3}
        Отличное начало! Коллекции помогают не потерять тайтлы и делиться ими с друзьями.
      {:else}
        {count} коллекций — целая библиотека вкуса.
      {/if}
    </p>
  </div>
</WrappedScreenShell>
