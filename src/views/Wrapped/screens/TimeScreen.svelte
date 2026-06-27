<script lang="ts">
  import WrappedScreenShell from '../components/WrappedScreenShell.svelte';
  import type { WrappedData } from '../shared/wrapped-load';
  import {
    calculateAverageHoursPerDay,
    calculateDaysFromMinutes,
    calculateHoursFromMinutes,
    getDaysSinceRegistration,
    pluralRu,
  } from '../shared/wrapped-utils';

  interface Props { data: WrappedData; }
  let { data }: Props = $props();

  const yearHours = $derived(calculateHoursFromMinutes(data.yearWatchMinutes));
  const lifetimeHours = $derived(calculateHoursFromMinutes(data.watchedTimeMinutes));
  const hours = $derived(yearHours > 0 ? yearHours : lifetimeHours);
  const lifetimeDays = $derived(calculateDaysFromMinutes(data.watchedTimeMinutes));
  const registerDate = $derived(Number(data.profile.register_date ?? 0));
  const avgPerDay = $derived(
    registerDate
      ? calculateAverageHoursPerDay(data.watchedTimeMinutes, getDaysSinceRegistration(registerDate))
      : 0,
  );
</script>

<WrappedScreenShell id="time">
  <div class="rewind-stat">
    <p class="rewind-stat__eyebrow" data-wrapped-animate>Твоё время</p>
    <span class="rewind-stat__huge" data-stat-value={hours} data-wrapped-animate>{hours}</span>
    <span class="rewind-stat__label" data-wrapped-animate>
      {pluralRu(hours, 'час', 'часа', 'часов')} с аниме за {data.year}
    </span>
    <p class="rewind-stat__sub" data-wrapped-animate>
      ~{data.yearStats.episodesThisYear} {pluralRu(data.yearStats.episodesThisYear, 'серия', 'серии', 'серий')}
      · {data.yearStats.watchedThisYear} {pluralRu(data.yearStats.watchedThisYear, 'тайтл', 'тайтла', 'тайтлов')} в истории
    </p>
    {#if lifetimeDays > 0}
      <p class="rewind-stat__note" data-wrapped-animate>
        Это {lifetimeDays} {pluralRu(lifetimeDays, 'день', 'дня', 'дней')} непрерывного просмотра{#if avgPerDay > 0} · в среднем {avgPerDay} {pluralRu(Math.round(avgPerDay), 'час', 'часа', 'часов')} в день{/if}
      </p>
    {/if}
  </div>
</WrappedScreenShell>
