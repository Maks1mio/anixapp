<script lang="ts">
  import { navigate } from '../stores/navigation';

  export interface SearchFranchiseData {
    images: string[];
    name: string;
    releaseCount?: number;
    firstReleaseId?: number;
    relatedId?: number;
  }

  interface Props {
    data: SearchFranchiseData;
  }

  let { data }: Props = $props();

  const targetId = $derived(
    typeof data.relatedId === 'number' ? data.relatedId : data.firstReleaseId
  );

  const thumbs = $derived(data.images.slice(0, 3));

  function handleClick() {
    if (typeof targetId === 'number') {
      navigate(`/release/${targetId}/related`);
    }
  }
</script>

{#if data.images.length || data.name}
  <button
    type="button"
    class="search-franchise"
    onclick={handleClick}
  >
    <div class="search-franchise__thumbs">
      {#each thumbs as url}
        <div
          class="search-franchise__thumb"
          style="background-image: url('{url}')"
        ></div>
      {/each}
    </div>

    <div class="search-franchise__content">
      <span class="search-franchise__title">{data.name || 'Франшиза'}</span>
      <span class="search-franchise__meta">
        {#if typeof data.releaseCount === 'number' && data.releaseCount > 0}
          {data.releaseCount} релизов во франшизе
        {:else}
          Релизы во франшизе
        {/if}
      </span>
    </div>

    <span class="search-franchise__action">Перейти</span>
  </button>
{/if}
