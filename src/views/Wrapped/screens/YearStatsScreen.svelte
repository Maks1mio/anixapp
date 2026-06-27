<script lang="ts">
  import WrappedScreenShell from '../components/WrappedScreenShell.svelte';
  import WrappedReleaseCard from '../components/WrappedReleaseCard.svelte';
  import type { WrappedData } from '../shared/wrapped-load';
  import { calculateHoursFromMinutes, pluralRu } from '../shared/wrapped-utils';

  interface Props { data: WrappedData; }
  let { data }: Props = $props();

  const yearHours = $derived(calculateHoursFromMinutes(data.yearWatchMinutes));

  const statCards = $derived([
    { label: 'Тайтлов', value: data.yearStats.watchedThisYear },
    { label: 'Серий', value: data.yearStats.episodesThisYear },
    { label: 'Активных дней', value: data.yearStats.activeWatchDays },
    { label: 'Завершено', value: data.yearStats.completedThisYear },
    { label: 'Смотрю', value: data.yearStats.watchingThisYear },
    { label: '5★ оценок', value: data.topRated.length },
  ].filter((s) => s.value > 0));
</script>

<WrappedScreenShell id="year-stats" align="start">
  <div class="wrapped-block">
    <p class="wrapped-eyebrow" data-wrapped-animate>Итоги {data.year}</p>
    <h2 class="wrapped-heading" data-wrapped-animate>Твой год в цифрах</h2>
    <p class="wrapped-meta" data-wrapped-animate>
      {yearHours} {pluralRu(yearHours, 'час', 'часа', 'часов')} ·
      {data.watchedEpisodes.toLocaleString('ru-RU')} серий за всё время
    </p>

    {#if data.yearHighlightReleases.length}
      <div class="wrapped-highlight-row" data-wrapped-animate>
        {#each data.yearHighlightReleases.slice(0, 5) as release, i}
          <WrappedReleaseCard release={release} size="md" rank={i + 1} />
        {/each}
      </div>
    {/if}

    <div class="wrapped-stat-chips">
      {#each statCards as stat, i}
        <div class="wrapped-stat-chip" data-wrapped-animate style="--delay:{i}">
          <span class="wrapped-stat-chip__value">{stat.value}</span>
          <span class="wrapped-stat-chip__label">{stat.label}</span>
        </div>
      {/each}
    </div>
  </div>
</WrappedScreenShell>
