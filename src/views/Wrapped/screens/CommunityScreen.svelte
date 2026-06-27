<script lang="ts">
  import { navigate } from '../../../stores/navigation';
  import WrappedScreenShell from '../components/WrappedScreenShell.svelte';
  import type { WrappedData } from '../shared/wrapped-load';
  import { pluralRu, releasePosterUrl, releaseTitle } from '../shared/wrapped-utils';

  interface Props { data: WrappedData; }
  let { data }: Props = $props();

  const top = $derived(data.communityTop);
  const watched = $derived(top.watchedCount);
  const pool = $derived(top.poolSize);

  function openRelease(id: number) {
    if (id > 0) navigate(`/release/${id}`);
  }
</script>

<WrappedScreenShell id="community" align="start">
  <div class="wrapped-block">
    <p class="wrapped-eyebrow" data-wrapped-animate>Выбор сообщества</p>
    <h2 class="wrapped-heading" data-wrapped-animate>Лучшее аниме {data.year}</h2>

    <div class="wrapped-board">
      {#each top.items as item, i}
        {@const poster = releasePosterUrl(item.release)}
        {@const id = Number(item.release.id ?? 0)}
        {@const fill = Math.max(6, Math.min(100, (item.grade / 5) * 100))}
        <button
          type="button"
          class="wrapped-board__row"
          class:is-mine={item.watchedByUser}
          data-wrapped-animate
          style="--i:{i}"
          onclick={() => openRelease(id)}
        >
          <span class="wrapped-board__rank">{i + 1}</span>
          <div
            class="wrapped-board__poster"
            style={poster ? `background-image:url('${poster}')` : ''}
          ></div>
          <div class="wrapped-board__main">
            <span class="wrapped-board__title">{releaseTitle(item.release)}</span>
            <span class="wrapped-board__bar">
              <span class="wrapped-board__fill" style="--fill:{fill.toFixed(1)}%"></span>
            </span>
            <span class="wrapped-board__meta">
              {item.voteCount.toLocaleString('ru-RU')} оценок
              {#if item.userVote != null}
                <span class="wrapped-board__mark">· твоя оценка {item.userVote}</span>
              {:else if item.watchedByUser}
                <span class="wrapped-board__mark">· ты смотрел</span>
              {/if}
            </span>
          </div>
          <span class="wrapped-board__grade">{item.grade.toFixed(2)}</span>
        </button>
      {/each}
    </div>

    <div class="wrapped-board__summary" data-wrapped-animate>
      <div class="wrapped-board__stat">
        <span class="wrapped-board__statval">{watched}<small>/{pool}</small></span>
        <span class="wrapped-board__statlabel">посмотрел из топа</span>
      </div>
      <div class="wrapped-board__stat">
        <span class="wrapped-board__statval">{top.ratedCount}</span>
        <span class="wrapped-board__statlabel">
          {pluralRu(top.ratedCount, 'оценка', 'оценки', 'оценок')} лично
        </span>
      </div>
    </div>
  </div>
</WrappedScreenShell>
