<script lang="ts">
  import WrappedScreenShell from '../components/WrappedScreenShell.svelte';
  import type { WrappedData } from '../shared/wrapped-load';
  import { calculateHoursFromMinutes } from '../shared/wrapped-utils';

  interface Props { data: WrappedData; }
  let { data }: Props = $props();

  type Stat = { value: number; label: string };

  const primaryRow = $derived(
    [
      { value: data.yearStats.episodesThisYear, label: 'серий' },
      { value: data.yearStats.watchedThisYear, label: 'тайтла' },
      { value: data.yearStats.activeWatchDays, label: 'дней' },
      { value: data.accountAgeYears, label: 'лет на Anixart' },
    ].filter((s): s is Stat => s.value > 0),
  );

  const secondaryRow = $derived(
    [
      { value: data.yearStats.watchingThisYear, label: 'смотрю' },
      { value: data.yearStats.completedThisYear, label: 'завершено' },
      { value: data.yearStats.planThisYear, label: 'в планах' },
      { value: data.friendCount, label: 'друзей' },
      { value: data.watchedEpisodes, label: 'серий всего' },
      { value: calculateHoursFromMinutes(data.watchedTimeMinutes), label: 'часа всего' },
    ].filter((s): s is Stat => s.value > 0),
  );
</script>

<WrappedScreenShell id="activity">
  <div class="rewind-activity">
    <h2 class="rewind-activity__title" data-wrapped-animate>Активность {data.year}</h2>

    <div class="rewind-activity__rows">
      {#if primaryRow.length}
        <div
          class="rewind-activity__row rewind-activity__row--{Math.min(primaryRow.length, 4)}"
          data-wrapped-animate
        >
          {#each primaryRow as s (s.label)}
            <div class="rewind-activity__cell">
              <span class="rewind-activity__value" data-stat-value={s.value}>
                {s.value.toLocaleString('ru-RU')}
              </span>
              <span class="rewind-activity__label">{s.label}</span>
            </div>
          {/each}
        </div>
      {/if}

      {#if secondaryRow.length}
        <div
          class="rewind-activity__row rewind-activity__row--{Math.min(secondaryRow.length, 6)}"
          data-wrapped-animate
        >
          {#each secondaryRow as s (s.label)}
            <div class="rewind-activity__cell">
              <span class="rewind-activity__value" data-stat-value={s.value}>
                {s.value.toLocaleString('ru-RU')}
              </span>
              <span class="rewind-activity__label">{s.label}</span>
            </div>
          {/each}
        </div>
      {/if}
    </div>
  </div>
</WrappedScreenShell>
