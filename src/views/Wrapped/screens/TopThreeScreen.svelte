<script lang="ts">
  import { navigate } from '../../../stores/navigation';
  import WrappedScreenShell from '../components/WrappedScreenShell.svelte';
  import type { WrappedData } from '../shared/wrapped-load';
  import { releasePosterUrl, releaseTitle } from '../shared/wrapped-utils';

  interface Props { data: WrappedData; }
  let { data }: Props = $props();

  const top = $derived(data.topThree.slice(0, 3));

  function openRelease(id: number) {
    if (id > 0) navigate(`/release/${id}`);
  }
</script>

<WrappedScreenShell id="top-three">
  <div class="rewind-titles">
    <h2 class="rewind-titles__title" data-wrapped-animate>Тайтлы, которые ты смотрел</h2>
    <ul class="rewind-titles__list">
      {#each top as item, i (item.release.id)}
        {@const poster = releasePosterUrl(item.release)}
        <li class="rewind-titles__row" data-wrapped-animate style="--i:{i}">
          <button type="button" class="rewind-titles__btn" onclick={() => openRelease(Number(item.release.id ?? 0))}>
            <span
              class="rewind-titles__poster"
              style={poster ? `background-image:url('${poster}')` : ''}
            ></span>
            <span class="rewind-titles__meta">
              <span class="rewind-titles__name">{releaseTitle(item.release)}</span>
              <span class="rewind-titles__rank">№{i + 1}</span>
            </span>
          </button>
        </li>
      {/each}
    </ul>
  </div>
</WrappedScreenShell>
