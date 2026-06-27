<script lang="ts">
  import { onMount } from 'svelte';
  import WrappedScreenShell from '../components/WrappedScreenShell.svelte';
  import type { WrappedData } from '../shared/wrapped-load';
  import { calculateHoursFromMinutes, releasePosterUrl, releaseTitle } from '../shared/wrapped-utils';
  import { downloadWrappedSharePng, sharePosterSrc } from '../shared/wrapped-share';

  interface Props {
    data: WrappedData;
    onHome: () => void;
  }
  let { data, onHome }: Props = $props();

  let shareEl = $state<HTMLElement | null>(null);
  let exporting = $state(false);

  const stats = $derived(
    [
      { value: data.yearStats.episodesThisYear, label: 'серий' },
      { value: calculateHoursFromMinutes(data.yearWatchMinutes) || calculateHoursFromMinutes(data.watchedTimeMinutes), label: 'часов' },
      { value: data.yearStats.watchedThisYear, label: 'тайтла' },
      { value: data.yearStats.activeWatchDays, label: 'дней' },
      { value: data.accountAgeYears, label: 'лет' },
      { value: data.yearStats.watchingThisYear, label: 'смотрю' },
      { value: data.yearStats.completedThisYear, label: 'завершено' },
      { value: data.yearStats.planThisYear, label: 'в планах' },
      { value: data.friendCount, label: 'друзей' },
      { value: data.watchedEpisodes, label: 'серий всего' },
    ].filter((s) => s.value > 0),
  );

  const posters = $derived(
    (data.yearHighlightReleases.length ? data.yearHighlightReleases : data.topThree.map((t) => t.release)).slice(0, 6),
  );
  const featured = $derived(posters[0] ?? data.topRelease);

  async function exportPng() {
    if (!shareEl || exporting) return;
    exporting = true;
    try {
      await downloadWrappedSharePng(shareEl, `anixapp-rewind-${data.year}.png`);
    } catch {
      /* ignore */
    } finally {
      exporting = false;
    }
  }

  onMount(() => {
    for (const r of posters) {
      const url = sharePosterSrc(releasePosterUrl(r));
      if (url) {
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.src = url;
      }
    }
  });
</script>

<WrappedScreenShell id="final" align="start">
  <div class="rewind-final">
    <div class="rewind-final__card" bind:this={shareEl}>
      {#if featured}
        <div
          class="rewind-final__art"
          style="background-image:url('{sharePosterSrc(releasePosterUrl(featured))}')"
          aria-hidden="true"
        ></div>
      {/if}

      <div class="rewind-final__head" data-wrapped-animate>
        {#if data.avatarUrl}
          <span class="rewind-final__avatar" style="background-image:url('{sharePosterSrc(data.avatarUrl)}')"></span>
        {/if}
        <span class="rewind-final__user">
          <b>{data.login}</b>
          <small>REWIND {data.year}</small>
        </span>
      </div>

      <h2 class="rewind-final__h" data-wrapped-animate>Активность {data.year}</h2>
      <div class="rewind-final__grid" data-wrapped-animate>
        {#each stats as s (s.label)}
          <div class="rewind-final__cell">
            <span class="rewind-final__value">{s.value.toLocaleString('ru-RU')}</span>
            <span class="rewind-final__label">{s.label}</span>
          </div>
        {/each}
      </div>

      {#if posters.length}
        <h3 class="rewind-final__h rewind-final__h--sm" data-wrapped-animate>Тайтлы, которые смотрел</h3>
        <div class="rewind-final__posters" data-wrapped-animate>
          {#each posters as r (r.id)}
            <span
              class="rewind-final__poster"
              title={releaseTitle(r)}
              style="background-image:url('{sharePosterSrc(releasePosterUrl(r))}')"
            ></span>
          {/each}
        </div>
      {/if}

      <span class="rewind-final__brand" aria-hidden="true">Anixapp</span>
    </div>

    <div class="rewind-final__actions" data-wrapped-animate data-share-skip>
      <button type="button" class="wrapped-btn wrapped-btn--primary" disabled={exporting} onclick={exportPng}>
        {exporting ? 'Сохраняем…' : 'Скачать PNG'}
      </button>
      <button type="button" class="wrapped-btn" onclick={onHome}>На главную</button>
    </div>
  </div>
</WrappedScreenShell>
