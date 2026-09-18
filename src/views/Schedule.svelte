<script lang="ts">
  import { onMount } from 'svelte';
  import OverviewReleaseCarousel from '../components/overview/OverviewReleaseCarousel.svelte';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import {
    SCHEDULE_DAYS,
    fetchSchedule,
    scheduleHasReleases,
  } from '../utils/schedule';
  import type { ReleaseCardData } from '../types/release';
  import { headlineFromLoadError } from '../utils/content-load-error';

  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let scheduleByDay = $state<Record<string, ReleaseCardData[]>>({});

  async function loadSchedule() {
    if (!window.anixApi?.release?.schedule) {
      loadState = 'error';
      errorMsg = 'API недоступен';
      return;
    }

    if (loadState !== 'error') loadState = 'loading';
    try {
      const mapped = await fetchSchedule();
      scheduleByDay = mapped;
      loadState = scheduleHasReleases(mapped) ? 'ready' : 'empty';
    } catch (err) {
      errorMsg = headlineFromLoadError(err);
      loadState = 'error';
    }
  }

  onMount(() => {
    void loadSchedule();
  });
</script>

<div class="view view-schedule discover-page">
  <div class="view-header">
    <h1 class="view-header__title">Расписание</h1>
    <p class="view-header__subtitle">Выход серий по дням недели</p>
  </div>

  {#if loadState === 'loading'}
    <div class="discover-page__loading">Загрузка…</div>
  {:else if loadState === 'error'}
    <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void loadSchedule()} />
  {:else if loadState === 'empty'}
    <div class="discover-page__empty">Расписание пока пусто</div>
  {:else}
    <div class="schedule-page">
      {#each SCHEDULE_DAYS as day (day.key)}
        {#if (scheduleByDay[day.key]?.length ?? 0) > 0}
          <section class="schedule-day">
            <h2 class="schedule-day__title">{day.label}</h2>
            <OverviewReleaseCarousel items={scheduleByDay[day.key] ?? []} />
          </section>
        {/if}
      {/each}
    </div>
  {/if}
</div>
