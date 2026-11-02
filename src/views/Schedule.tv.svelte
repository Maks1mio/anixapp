<script lang="ts">
  import { onMount } from 'svelte';
  import TvPage from '../components/tv/TvPage.svelte';
  import TvHomeRow from '../components/tv/TvHomeRow.svelte';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { attachTvHomeCarouselScroll } from '../tv/carouselScroll';
  import { SCHEDULE_DAYS, fetchSchedule, getTodayScheduleKey } from '../utils/schedule';
  import { headlineFromLoadError } from '../utils/content-load-error';
  import type { ReleaseCardData } from '../types/release';

  let byDay = $state<Record<string, ReleaseCardData[]>>({});
  let loadState = $state<'loading' | 'error' | 'ready'>('loading');
  let errorMsg = $state('');

  /** Сегодняшний день первым — дальше по порядку недели. */
  const days = $derived.by(() => {
    const today = SCHEDULE_DAYS.findIndex((day) => day.key === getTodayScheduleKey());
    const start = today < 0 ? 0 : today;
    return [...SCHEDULE_DAYS.slice(start), ...SCHEDULE_DAYS.slice(0, start)].map((day, i) => ({
      ...day,
      label: i === 0 ? `Сегодня · ${day.label}` : i === 1 ? `Завтра · ${day.label}` : day.label,
    }));
  });
  const visibleDays = $derived(
    loadState === 'loading' ? days.slice(0, 2) : days.filter((day) => (byDay[day.key]?.length ?? 0) > 0),
  );

  async function load(force = false) {
    loadState = 'loading';
    try {
      byDay = await fetchSchedule(force);
      loadState = 'ready';
    } catch (err) {
      errorMsg = headlineFromLoadError(err);
      loadState = 'error';
    }
  }

  onMount(() => {
    const detachCarouselScroll = attachTvHomeCarouselScroll();
    void load();
    return detachCarouselScroll;
  });
</script>

<TvPage title="Расписание" hideHead>
  <div class="tv-home">
    <section class="tv-home__stage" aria-label="Расписание">
      <div class="tv-home__rails" data-tv-home-rails>
        {#if loadState === 'error'}
          <div class="tv-overview__error">
            <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void load(true)} />
          </div>
        {:else if loadState === 'ready' && visibleDays.length === 0}
          <div class="tv-bookmarks__empty">
            <h1 class="tv-bookmarks__empty-title">Расписание пусто</h1>
            <p class="tv-bookmarks__empty-text">На этой неделе новых серий не запланировано.</p>
          </div>
        {:else}
          <div class="tv-home__rows">
            {#each visibleDays as day (day.key)}
              <TvHomeRow
                label={day.label}
                tabId={`schedule-${day.key}`}
                items={byDay[day.key] ?? []}
                status={loadState === 'loading' ? 'loading' : 'ready'}
                showSeeAll={false}
                meta={loadState === 'ready' ? String(byDay[day.key]?.length ?? 0) : ''}
              />
            {/each}
          </div>
        {/if}
      </div>
    </section>
  </div>
</TvPage>
