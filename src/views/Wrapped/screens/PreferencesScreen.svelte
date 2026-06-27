<script lang="ts">
  import { navigate } from '../../../stores/navigation';
  import WrappedScreenShell from '../components/WrappedScreenShell.svelte';
  import type { WrappedData } from '../shared/wrapped-load';
  import { releasePosterUrl, releaseTitle } from '../shared/wrapped-utils';

  interface Props { data: WrappedData; }
  let { data }: Props = $props();

  const similar = $derived(data.recommendSimilar.slice(0, 4));
  const unwatched = $derived(data.recommendUnwatched.slice(0, 4));

  function openRelease(id: number) {
    if (id > 0) navigate(`/release/${id}`);
  }
</script>

<WrappedScreenShell id="preferences" align="start" scrollable>
  <div class="rewind-prefs">
    <h2 class="rewind-prefs__title" data-wrapped-animate>Что смотрел и что любишь</h2>

    {#if similar.length}
      <section class="rewind-prefs__section">
        <h3 class="rewind-prefs__h" data-wrapped-animate>Похожее на твои топы</h3>
        <p class="rewind-prefs__lead" data-wrapped-animate>Из связанных тайтлов</p>
        <div class="rewind-prefs__row">
          {#each similar as rel, i (rel.id)}
            {@const poster = releasePosterUrl(rel)}
            <button
              type="button"
              class="rewind-poster"
              data-wrapped-animate
              style="--i:{i}"
              onclick={() => openRelease(Number(rel.id ?? 0))}
            >
              <span class="rewind-poster__img" style={poster ? `background-image:url('${poster}')` : ''}></span>
              <span class="rewind-poster__name">{releaseTitle(rel)}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}

    {#if unwatched.length}
      <section class="rewind-prefs__section">
        <h3 class="rewind-prefs__h" data-wrapped-animate>Попробуй в новом году</h3>
        <p class="rewind-prefs__lead" data-wrapped-animate>Подборка под твои жанры — их ещё не в истории</p>
        <div class="rewind-prefs__row">
          {#each unwatched as rel, i (rel.id)}
            {@const poster = releasePosterUrl(rel)}
            <button
              type="button"
              class="rewind-poster"
              data-wrapped-animate
              style="--i:{i}"
              onclick={() => openRelease(Number(rel.id ?? 0))}
            >
              <span class="rewind-poster__img" style={poster ? `background-image:url('${poster}')` : ''}></span>
              <span class="rewind-poster__name">{releaseTitle(rel)}</span>
            </button>
          {/each}
        </div>
      </section>
    {/if}
  </div>
</WrappedScreenShell>
