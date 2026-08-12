<script lang="ts">
  import { navigate } from '../../stores/navigation';
  import { iconChevronRight } from '../icons';
  import { resolveCdnAssetUrl } from '../../utils/posterUrl';

  export type UiV2SearchFranchiseData = {
    images: string[];
    name: string;
    releaseCount?: number;
    firstReleaseId?: number;
    relatedId?: number;
  };

  type Props = {
    data: UiV2SearchFranchiseData;
    actionLabel?: string;
    onclick?: () => void;
    class?: string;
  };

  let { data, actionLabel = 'Перейти', onclick, class: className = '' }: Props = $props();

  const targetId = $derived(
    typeof data.relatedId === 'number' ? data.relatedId : data.firstReleaseId,
  );

  const thumbs = $derived(data.images.slice(0, 3));

  const metaLabel = $derived.by(() => {
    const count = data.releaseCount;
    if (typeof count === 'number' && count > 0) {
      return `${count} релизов во франшизе`;
    }
    return 'Релизы во франшизе';
  });

  const canNavigate = $derived(typeof targetId === 'number');

  function handleClick() {
    if (onclick) {
      onclick();
      return;
    }
    if (typeof targetId === 'number') {
      navigate(`/release/${targetId}/related`);
    }
  }
</script>

{#if data.images.length || data.name}
  <button
    type="button"
    class="uiv2-franchise {className}"
    onclick={handleClick}
    disabled={!canNavigate && !onclick}
    aria-label={`Франшиза ${data.name || 'без названия'}. ${metaLabel}`}
  >
    <div class="uiv2-franchise__deck" aria-hidden="true">
      {#each thumbs as url, index (url + index)}
        <div
          class="uiv2-franchise__poster"
          style={`background-image:url('${resolveCdnAssetUrl(url)}')`}
        ></div>
      {:else}
        <div class="uiv2-franchise__poster uiv2-franchise__poster--fallback"></div>
        <div class="uiv2-franchise__poster uiv2-franchise__poster--fallback"></div>
        <div class="uiv2-franchise__poster uiv2-franchise__poster--fallback"></div>
      {/each}
    </div>

    <div class="uiv2-franchise__body">
      <span class="uiv2-franchise__title">{data.name || 'Франшиза'}</span>
      <span class="uiv2-franchise__meta">{metaLabel}</span>
    </div>

    <span class="uiv2-franchise__action">
      <span class="uiv2-franchise__action-label">{actionLabel}</span>
      <span class="uiv2-franchise__action-icon" aria-hidden="true">{@html iconChevronRight(18)}</span>
    </span>
  </button>
{/if}
