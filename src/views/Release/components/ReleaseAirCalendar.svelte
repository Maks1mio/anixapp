<script lang="ts">
  import { tick } from 'svelte';
  import { scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../../actions/portal';
  import { iconChevronLeft, iconChevronRight } from '../../../components/icons';
  import UiV2Tooltip from '../../../components/uikit-v2/UiV2Tooltip.svelte';
  import { fetchSchedule, findReleaseScheduleDay } from '../../../utils/schedule';
  import {
    AIR_WEEKDAY_SHORT,
    MONTHS_NOMINATIVE,
    airDateKey,
    buildAirMonthGrid,
    buildReleaseAirCalendar,
    calendarDateFromUnix,
    formatAirSlotTip,
    formatAirTriggerLabel,
    weekdayKeyFromBroadcast,
    weekdayKeyFromDate,
    weekdayKeyFromScheduleDay,
    type AirMonthCell,
    type ReleaseAirCalendarModel,
  } from '../../../utils/release-air-calendar';

  type Props = {
    releaseId: number;
    broadcast?: number | null;
    airedOnDate?: number | null;
    episodesReleased?: number | null;
    episodesTotal?: number | null;
    statusId?: number | null;
    fallback?: string;
  };

  let {
    releaseId,
    broadcast = null,
    airedOnDate = null,
    episodesReleased = null,
    episodesTotal = null,
    statusId = null,
    fallback = 'Выходит',
  }: Props = $props();

  let scheduleDayKey = $state<string | null>(null);
  let scheduleReleased = $state<number | null>(null);
  let scheduleTotal = $state<number | null>(null);
  let open = $state(false);
  let viewYear = $state(0);
  let viewMonth = $state(0);
  let triggerEl: HTMLButtonElement | null = $state(null);
  let panelEl: HTMLDivElement | null = $state(null);
  let panelLeft = $state(0);
  let panelTop = $state(0);

  $effect(() => {
    const id = releaseId;
    let cancelled = false;
    scheduleDayKey = null;
    scheduleReleased = null;
    scheduleTotal = null;
    void fetchSchedule()
      .then((byDay) => {
        if (cancelled) return;
        const hit = findReleaseScheduleDay(id, byDay);
        scheduleDayKey = hit?.day.key ?? null;
        scheduleReleased = hit?.item.episodesReleased ?? null;
        scheduleTotal = hit?.item.episodesTotal ?? null;
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  });

  const weekdayKey = $derived.by(() => {
    const fromSchedule = weekdayKeyFromScheduleDay(
      scheduleDayKey ? { key: scheduleDayKey, label: '' } : null,
    );
    if (fromSchedule) return fromSchedule;
    const fromBroadcast = weekdayKeyFromBroadcast(broadcast);
    if (fromBroadcast) return fromBroadcast;
    const aired = calendarDateFromUnix(airedOnDate ?? 0);
    return aired ? weekdayKeyFromDate(aired) : null;
  });

  const releasedCount = $derived(
    Math.max(episodesReleased ?? 0, scheduleReleased ?? 0) || (episodesReleased ?? scheduleReleased ?? null),
  );
  const totalCount = $derived(episodesTotal ?? scheduleTotal ?? null);

  const model = $derived.by((): ReleaseAirCalendarModel | null => {
    if (statusId === 1 && !scheduleDayKey && (episodesReleased ?? 0) > 0 && (episodesTotal ?? 0) > 0
      && (episodesReleased ?? 0) >= (episodesTotal ?? 0)) {
      return null;
    }
    return buildReleaseAirCalendar({
      weekdayKey,
      fromSchedule: !!scheduleDayKey,
      airedOnDate,
      episodesReleased: releasedCount,
      episodesTotal: totalCount,
    });
  });

  const triggerLabel = $derived(model ? formatAirTriggerLabel(model, fallback) : fallback);
  const monthTitle = $derived(`${MONTHS_NOMINATIVE[viewMonth] ?? ''} ${viewYear}`.trim());
  const showAiredKey = $derived(model?.mode === 'episodes' && !!model.episodes.some((slot) => slot.kind === 'aired'));
  const cells = $derived.by((): AirMonthCell[] => {
    if (!model || !viewYear) return [];
    return buildAirMonthGrid(viewYear, viewMonth, model.episodes);
  });
  const weeks = $derived.by(() => {
    const rows: AirMonthCell[][] = [];
    for (let i = 0; i < cells.length; i += 7) rows.push(cells.slice(i, i + 7));
    while (rows.length > 4) {
      const last = rows[rows.length - 1];
      if (last.every((cell) => !cell.inMonth && !cell.slot)) rows.pop();
      else break;
    }
    return rows;
  });

  const minMonth = $derived.by(() => {
    const first = model?.episodes[0]?.date;
    return first ? first.getFullYear() * 12 + first.getMonth() : null;
  });
  const maxMonth = $derived.by(() => {
    const last = model?.episodes.at(-1)?.date;
    return last ? last.getFullYear() * 12 + last.getMonth() : null;
  });
  const viewIndex = $derived(viewYear * 12 + viewMonth);
  const canPrev = $derived(minMonth == null || viewIndex > minMonth);
  const canNext = $derived(maxMonth == null || viewIndex < maxMonth);

  function syncViewToNext() {
    const next = model?.nextEpisode?.date ?? model?.episodes[0]?.date;
    if (!next) return;
    viewYear = next.getFullYear();
    viewMonth = next.getMonth();
  }

  async function layoutPanel() {
    if (!triggerEl || !panelEl) return;
    await tick();
    const anchor = triggerEl.getBoundingClientRect();
    const tw = panelEl.offsetWidth || 280;
    const th = panelEl.offsetHeight || 280;
    const gap = 8;
    const edge = 12;
    const spaceBelow = window.innerHeight - anchor.bottom;
    const below = spaceBelow >= th + gap || spaceBelow >= anchor.top;
    let top = below ? anchor.bottom + gap : anchor.top - th - gap;
    let left = anchor.left;
    left = Math.max(edge, Math.min(left, window.innerWidth - edge - tw));
    top = Math.max(edge, Math.min(top, window.innerHeight - edge - th));
    panelLeft = left;
    panelTop = top;
  }

  async function toggleOpen() {
    if (!model) return;
    open = !open;
    if (!open) return;
    syncViewToNext();
    await tick();
    await layoutPanel();
    requestAnimationFrame(() => {
      void layoutPanel();
      panelEl?.querySelector<HTMLElement>('[data-air-focus]')?.focus();
    });
  }

  function close() {
    open = false;
  }

  function shiftMonth(dir: -1 | 1) {
    const next = viewIndex + dir;
    if (minMonth != null && next < minMonth) return;
    if (maxMonth != null && next > maxMonth) return;
    viewYear = Math.floor(next / 12);
    viewMonth = ((next % 12) + 12) % 12;
    void layoutPanel();
  }

  function onDocPointer(event: PointerEvent) {
    if (!open) return;
    const node = event.target as Node | null;
    if (!node) return;
    if (triggerEl?.contains(node) || panelEl?.contains(node)) return;
    if (node instanceof Element && node.closest('.uiv2-tooltip')) return;
    close();
  }

  $effect(() => {
    if (!open) return;
    const onScroll = () => {
      void layoutPanel();
    };
    document.addEventListener('scroll', onScroll, true);
    return () => document.removeEventListener('scroll', onScroll, true);
  });

  function onWindowKey(event: KeyboardEvent) {
    if (event.key === 'Escape' && open) {
      event.preventDefault();
      close();
      triggerEl?.focus();
    }
  }

  function cellLabel(cell: AirMonthCell): string {
    const date = `${cell.date.getDate()} ${MONTHS_NOMINATIVE[cell.date.getMonth()] ?? ''}`.toLowerCase();
    if (cell.slot) return formatAirSlotTip(cell.slot, model?.mode ?? 'episodes');
    if (cell.today) return `Сегодня, ${date}`;
    return date;
  }
</script>

<svelte:window onkeydown={onWindowKey} onpointerdown={onDocPointer} onresize={() => { if (open) void layoutPanel(); }} />

{#if model}
  <span class="uiv2-air-cal">
    <button
      bind:this={triggerEl}
      type="button"
      class="release-page__meta-info-link uiv2-air-cal__trigger"
      aria-haspopup="dialog"
      aria-expanded={open}
      aria-label={triggerLabel}
      onclick={() => void toggleOpen()}
    >
      {triggerLabel}
    </button>

    {#if open}
      <div
        bind:this={panelEl}
        class="uiv2-air-cal__panel"
        role="dialog"
        aria-label={model.everyLabel}
        style:left="{panelLeft}px"
        style:top="{panelTop}px"
        use:portal
        transition:scale={{ duration: 140, start: 0.98, easing: cubicOut }}
      >
        <header class="uiv2-air-cal__panel-head">
          <button
            type="button"
            class="uiv2-air-cal__nav"
            aria-label="Предыдущий месяц"
            disabled={!canPrev}
            onclick={() => shiftMonth(-1)}
          >
            {@html iconChevronLeft(16)}
          </button>
          <p class="uiv2-air-cal__month">{monthTitle}</p>
          <button
            type="button"
            class="uiv2-air-cal__nav"
            aria-label="Следующий месяц"
            disabled={!canNext}
            onclick={() => shiftMonth(1)}
          >
            {@html iconChevronRight(16)}
          </button>
        </header>

        <p class="uiv2-air-cal__legend">
          {model.everyLabel}{#if model.progressLabel} · {model.progressLabel}{/if}
        </p>
        {#if model.hint}
          <p class="uiv2-air-cal__hint">{model.hint}</p>
        {/if}
        <ul class="uiv2-air-cal__keys">
          <li>
            <i class="uiv2-air-cal__key uiv2-air-cal__key--next" aria-hidden="true"></i>
            следующая
          </li>
          <li>
            <i class="uiv2-air-cal__key uiv2-air-cal__key--soon" aria-hidden="true"></i>
            скоро
          </li>
          {#if showAiredKey}
            <li>
              <i class="uiv2-air-cal__key uiv2-air-cal__key--aired" aria-hidden="true"></i>
              вышла
            </li>
          {/if}
        </ul>

        <table class="uiv2-air-cal__grid">
          <thead>
            <tr>
              {#each AIR_WEEKDAY_SHORT as day (day)}
                <th scope="col">{day}</th>
              {/each}
            </tr>
          </thead>
          <tbody>
            {#each weeks as week, wi (wi)}
              <tr>
                {#each week as cell (airDateKey(cell.date))}
                  <td>
                    {#if cell.slot}
                      <UiV2Tooltip
                        class="uiv2-air-cal__day-tip"
                        text={formatAirSlotTip(cell.slot, model.mode)}
                        placement="top"
                        showDelay={80}
                        hideDelay={40}
                        block
                      >
                        <button
                          type="button"
                          class="uiv2-air-cal__day uiv2-air-cal__day--{cell.slot.kind}"
                          class:uiv2-air-cal__day--today={cell.today}
                          class:uiv2-air-cal__day--out={!cell.inMonth}
                          data-air-focus={model.nextEpisode && airDateKey(cell.slot.date) === airDateKey(model.nextEpisode.date) ? 'true' : undefined}
                          aria-current={cell.today ? 'date' : undefined}
                          aria-label={cellLabel(cell)}
                        >
                          {cell.date.getDate()}
                        </button>
                      </UiV2Tooltip>
                    {:else}
                      <span
                        class="uiv2-air-cal__day uiv2-air-cal__day--empty"
                        class:uiv2-air-cal__day--today={cell.today}
                        class:uiv2-air-cal__day--out={!cell.inMonth}
                      >
                        {cell.date.getDate()}
                      </span>
                    {/if}
                  </td>
                {/each}
              </tr>
            {/each}
          </tbody>
        </table>
      </div>
    {/if}
  </span>
{:else if fallback}
  {fallback}
{/if}
