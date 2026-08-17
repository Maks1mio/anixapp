<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from '../stores/navigation';
  import PosterImage from './PosterImage.svelte';
  import Page from './Page.svelte';
  import { iconX } from './icons';
  import {
    SCHEDULE_DAYS,
    fetchSchedule,
    getTodayScheduleKey,
    scheduleHasReleases,
    formatScheduleEpisodes,
  } from '../utils/schedule';
  import type { ReleaseCardData } from '../types/release';

  interface Props {
    onClose: () => void;
  }

  let { onClose }: Props = $props();

  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let scheduleByDay = $state<Record<string, ReleaseCardData[]>>({});
  let infoDismissed = $state(false);

  const todayKey = getTodayScheduleKey();

  async function loadSchedule() {
    loadState = 'loading';
    try {
      const mapped = await fetchSchedule();
      scheduleByDay = mapped;
      loadState = scheduleHasReleases(mapped) ? 'ready' : 'empty';
    } catch (err) {
      errorMsg = String(err);
      loadState = 'error';
    }
  }

  function openRelease(id: number | undefined) {
    if (!id) return;
    onClose();
    navigate(`/release/${id}`);
  }

  onMount(() => {
    void loadSchedule();
  });
</script>

<div class="sidebar-schedule" role="dialog" aria-label="Расписание выхода серий">
  <header class="sidebar-schedule__head">
    <h2 class="sidebar-schedule__title">Расписание</h2>
    <button type="button" class="sidebar-schedule__close" onclick={onClose} aria-label="Закрыть">
      {@html iconX(18)}
    </button>
  </header>

  <Page scrollId="schedule-panel" extraClass="sidebar-schedule__page">
    {#if !infoDismissed}
      <div class="sidebar-schedule__info">
        <p>
          Дни недели, когда выходят новые серии в Японии и Китае. Озвученные релизы появляются позже.
        </p>
        <button type="button" class="sidebar-schedule__info-dismiss" onclick={() => { infoDismissed = true; }} aria-label="Скрыть">
          {@html iconX(14)}
        </button>
      </div>
    {/if}

    {#if loadState === 'loading'}
      <div class="sidebar-schedule__status">Загрузка…</div>
    {:else if loadState === 'error'}
      <div class="sidebar-schedule__status">
        <p>{errorMsg || 'Не удалось загрузить'}</p>
        <button type="button" class="sidebar-schedule__retry" onclick={() => void loadSchedule()}>Повторить</button>
      </div>
    {:else if loadState === 'empty'}
      <div class="sidebar-schedule__status">Расписание пока пусто</div>
    {:else}
      {#each SCHEDULE_DAYS as day (day.key)}
        {#if (scheduleByDay[day.key]?.length ?? 0) > 0}
          <section class="sidebar-schedule__day">
            <h3 class="sidebar-schedule__day-title">
              {#if day.key === todayKey}
                <span class="sidebar-schedule__today-dot" aria-hidden="true"></span>
              {/if}
              {day.label}
            </h3>
            <div class="sidebar-schedule__grid">
              {#each scheduleByDay[day.key] ?? [] as item (item.id)}
                {@const ep = formatScheduleEpisodes(item)}
                <button type="button" class="sidebar-schedule__card" onclick={() => openRelease(item.id)}>
                  <div class="sidebar-schedule__poster">
                    <PosterImage src={item.poster} alt="" loading="lazy" thumb="cardVertical" />
                  </div>
                  <span class="sidebar-schedule__card-title">{item.titleRu || item.titleEn || 'Без названия'}</span>
                  {#if ep}
                    <span class="sidebar-schedule__card-ep">{ep}</span>
                  {/if}
                </button>
              {/each}
            </div>
          </section>
        {/if}
      {/each}
    {/if}
  </Page>
</div>
