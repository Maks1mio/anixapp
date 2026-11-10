<script lang="ts">
  /** Единый блок активности, как в Android 11: столбцы по дням и недавно просмотренное. */
  import UiV2ChoiceSheet from '../uikit-v2/UiV2ChoiceSheet.svelte';
  import ProfileHistorySection from '../../views/Profile/v2/components/ProfileHistorySection.svelte';
  import { iconCalendar } from '../icons';

  interface Props {
    watchDynamics: unknown[];
    history: Record<string, unknown>[];
  }

  let { watchDynamics, history }: Props = $props();

  const HINT = 'Динамика просмотра серий за текущий день станет доступна только на следующий день.';

  const days = $derived(
    watchDynamics
      .map((raw) => {
        const row = raw as { count?: number; timestamp?: number };
        return { count: Number(row.count ?? 0), timestamp: Number(row.timestamp ?? 0) };
      })
      .filter((d) => Number.isFinite(d.count) && d.timestamp > 0),
  );
  const peak = $derived(days.reduce((best, d) => Math.max(best, d.count), 0));
  const total = $derived(days.reduce((sum, d) => sum + d.count, 0));

  let hintOpen = $state(false);

  function dayLabel(ts: number): string {
    const date = new Date(ts < 1e12 ? ts * 1000 : ts);
    return `${String(date.getDate()).padStart(2, '0')}.${String(date.getMonth() + 1).padStart(2, '0')}`;
  }

  // ── Вид: столбцы как в Android или сетка по дням ──
  const VIEW_KEY = 'profile-watch-activity-view';
  const VIEW_TABS = [
    {
      id: 'bars',
      label: 'Столбцы',
      icon: '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 20v-6"/><path d="M12 20V6"/><path d="M18 20v-10"/></svg>',
    },
    { id: 'grid', label: 'Активность', icon: iconCalendar(18) },
  ];

  function storedView(): string {
    try {
      return localStorage.getItem(VIEW_KEY) === 'grid' ? 'grid' : 'bars';
    } catch {
      return 'bars';
    }
  }

  let view = $state(storedView());

  function setView(id: string) {
    view = id;
    try {
      localStorage.setItem(VIEW_KEY, id);
    } catch {
      /* выбор просто не запомнится */
    }
  }

  // ── Полосы графиков: листаются пальцем, колёсиком или перетаскиванием мышью ──
  /** Как в приложении, сначала видны последние дни */
  function trackChart(node: HTMLElement) {
    node.scrollLeft = node.scrollWidth;

    // Мышью полосу тащат «рукой», как карту; пальцы и так листают нативно
    let dragFrom: { x: number; left: number; id: number } | null = null;
    let dragged = false;
    const onDown = (e: PointerEvent) => {
      if (e.pointerType !== 'mouse' || e.button !== 0) return;
      dragFrom = { x: e.clientX, left: node.scrollLeft, id: e.pointerId };
      dragged = false;
    };
    const onMove = (e: PointerEvent) => {
      if (!dragFrom || e.pointerId !== dragFrom.id) return;
      const dx = e.clientX - dragFrom.x;
      if (!dragged) {
        if (Math.abs(dx) < 4) return;
        dragged = true;
        node.setPointerCapture(e.pointerId);
        node.classList.add('watch-activity--dragging');
      }
      node.scrollLeft = dragFrom.left - dx;
    };
    const onUp = (e: PointerEvent) => {
      if (!dragFrom || e.pointerId !== dragFrom.id) return;
      dragFrom = null;
      node.classList.remove('watch-activity--dragging');
      if (node.hasPointerCapture(e.pointerId)) node.releasePointerCapture(e.pointerId);
    };
    // Отпускание после перетаскивания — не клик по дню
    const onClick = (e: MouseEvent) => {
      if (!dragged) return;
      dragged = false;
      e.preventDefault();
      e.stopPropagation();
    };
    node.addEventListener('pointerdown', onDown);
    node.addEventListener('pointermove', onMove);
    node.addEventListener('pointerup', onUp);
    node.addEventListener('pointercancel', onUp);
    node.addEventListener('click', onClick, true);

    return {
      destroy() {
        node.removeEventListener('pointerdown', onDown);
        node.removeEventListener('pointermove', onMove);
        node.removeEventListener('pointerup', onUp);
        node.removeEventListener('pointercancel', onUp);
        node.removeEventListener('click', onClick, true);
      },
    };
  }

  // ── Сетка: колонка — неделя, строка — день недели ──
  const WEEKDAYS = ['Пн', '', 'Ср', '', 'Пт', '', ''];

  function dayStart(ts: number): number {
    const date = new Date(ts < 1e12 ? ts * 1000 : ts);
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  const byDay = $derived.by(() => {
    const map = new Map<number, number>();
    for (const d of days) {
      const key = dayStart(d.timestamp);
      map.set(key, (map.get(key) ?? 0) + d.count);
    }
    return map;
  });
  const dayKeys = $derived([...byDay.keys()].sort((a, b) => a - b));
  const gridPeak = $derived(Math.max(0, ...byDay.values()));

  const YEAR_WEEKS = 53;
  const MONTHS = ['Янв', 'Фев', 'Мар', 'Апр', 'Май', 'Июн', 'Июл', 'Авг', 'Сен', 'Окт', 'Ноя', 'Дек'];

  /** Как на GitHub: год неделями, последняя колонка — текущая неделя до сегодняшнего дня */
  const weeks = $derived.by(() => {
    const now = new Date();
    const today = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
    const monday = now.getDate() - ((now.getDay() + 6) % 7) - (YEAR_WEEKS - 1) * 7;
    return Array.from({ length: YEAR_WEEKS }, (_, w) =>
      Array.from({ length: 7 }, (_, i) => new Date(now.getFullYear(), now.getMonth(), monday + w * 7 + i).getTime()).filter(
        (key) => key <= today,
      ),
    );
  });

  /** Подпись над неделей, с которой начался месяц; первая колонка без подписи, иначе столкнётся со следующей */
  function monthLabel(week: number[], index: number): string {
    if (index === 0) return '';
    const month = new Date(week[0]).getMonth();
    return new Date(weeks[index - 1][0]).getMonth() === month ? '' : MONTHS[month];
  }

  function level(count: number): number {
    return count > 0 && gridPeak ? Math.ceil((count / gridPeak) * 4) : 0;
  }

  let pickedDay = $state<number | null>(null);
  const shownDay = $derived(pickedDay != null && byDay.has(pickedDay) ? pickedDay : (dayKeys[dayKeys.length - 1] ?? null));

  function fullDate(key: number): string {
    return new Date(key).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' });
  }

  function episodes(count: number): string {
    if (!count) return 'нет просмотров';
    const tens = count % 100;
    const ones = count % 10;
    const word = tens >= 11 && tens <= 14 ? 'серий' : ones === 1 ? 'серия' : ones >= 2 && ones <= 4 ? 'серии' : 'серий';
    return `${count} ${word}`;
  }
</script>

{#if days.length || history.length}
  <section class="watch-activity uiv2-card" aria-label="Активность">
    {#if days.length}
      <header class="watch-activity__head">
        <h3 class="watch-activity__title">Динамика просмотра серий</h3>
        <span class="watch-activity__summary">{total.toLocaleString('ru-RU')} за период · максимум {peak} в день</span>
      </header>

      <div class="watch-activity__chips" role="tablist">
        {#each VIEW_TABS as tab (tab.id)}
          <button
            type="button"
            class="watch-activity__chip"
            class:watch-activity__chip--on={tab.id === view}
            role="tab"
            aria-selected={tab.id === view}
            onclick={() => setView(tab.id)}
          >
            <span class="watch-activity__chip-icon" aria-hidden="true">{@html tab.icon}</span>
            {tab.label}
          </button>
        {/each}
      </div>

      {#if view === 'bars'}
        <div class="watch-activity__bars">
          <div class="watch-activity__chart" use:trackChart>
            {#each days as day (day.timestamp)}
              <div class="watch-activity__day">
                <span class="watch-activity__count">{day.count}</span>
                <span
                  class="watch-activity__bar"
                  style={`height:${peak ? Math.max(14, (day.count / peak) * 150) : 14}px`}
                ></span>
                <span class="watch-activity__date">{dayLabel(day.timestamp)}</span>
              </div>
            {/each}
          </div>
        </div>
      {:else}
        <div class="watch-activity__bars">
          <div class="watch-activity__year" use:trackChart>
            <div class="watch-activity__grid" style={`grid-template-columns:1.75rem repeat(${weeks.length}, minmax(0.6875rem, 1fr))`}>
              {#each WEEKDAYS as label, row (row)}
                <span class="watch-activity__axis" style={`grid-column:1;grid-row:${row + 2}`}>{label}</span>
              {/each}
              {#each weeks as week, col (week[0])}
                <span class="watch-activity__axis watch-activity__axis--month" style={`grid-column:${col + 2};grid-row:1`}>{monthLabel(week, col)}</span>
                {#each week as key, row (key)}
                  {@const count = byDay.get(key)}
                  {@const place = `grid-column:${col + 2};grid-row:${row + 2}`}
                  {#if count != null}
                    <button
                      type="button"
                      class="watch-activity__cell"
                      class:watch-activity__cell--picked={key === shownDay}
                      data-level={level(count)}
                      style={place}
                      aria-label={`${fullDate(key)}: ${episodes(count)}`}
                      onmouseenter={() => (pickedDay = key)}
                      onclick={() => (pickedDay = key)}
                    ></button>
                  {:else}
                    <i class="watch-activity__cell watch-activity__cell--none" style={place}></i>
                  {/if}
                {/each}
              {/each}
            </div>
          </div>
        </div>
        <div class="watch-activity__heat-foot">
          <span class="watch-activity__picked">
            {#if shownDay != null}{fullDate(shownDay)} · {episodes(byDay.get(shownDay) ?? 0)}{/if}
          </span>
          <span class="watch-activity__legend" aria-hidden="true">
            Меньше
            {#each [0, 1, 2, 3, 4] as l (l)}<i class="watch-activity__cell" data-level={l}></i>{/each}
            Больше
          </span>
        </div>
      {/if}

      <button type="button" class="watch-activity__more" onclick={() => (hintOpen = true)}>Узнать подробнее</button>
    {/if}

    {#if history.length}
      {#if days.length}<hr class="watch-activity__divider" />{/if}
      <h3 class="watch-activity__title">Просмотрено недавно</h3>
      <div class="profile-panel__recent">
        <ProfileHistorySection items={history} />
      </div>
    {/if}
  </section>
{/if}

{#if hintOpen}
  <UiV2ChoiceSheet
    title="Динамика просмотра серий"
    summary={HINT}
    options={[]}
    value=""
    cancelLabel="Понятно"
    onClose={() => (hintOpen = false)}
  />
{/if}

<style lang="scss">
  .watch-activity {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
    margin-top: 0.75rem;
    padding: 1.25rem;
  }

  .watch-activity__head {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    justify-content: space-between;
    gap: 0.25rem 1rem;
  }

  .watch-activity__title {
    margin: 0;
    color: var(--uikit-v2-text);
    font-size: 1.125rem;
    font-weight: 600;
  }

  .watch-activity__summary {
    color: var(--uiv2-fg-muted);
    font-size: 0.8125rem;
    font-variant-numeric: tabular-nums;
  }

  /* Как чипы разделов витрины */
  .watch-activity__chips {
    display: flex;
    gap: 0.75rem;
  }

  .watch-activity__chip {
    display: inline-flex;
    flex: none;
    align-items: center;
    gap: 0.4rem;
    height: 2.25rem;
    padding: 0 0.75rem;
    border: 1px solid color-mix(in srgb, var(--uikit-v2-text) 28%, transparent);
    border-radius: 0.625rem;
    background: transparent;
    color: var(--uiv2-fg-muted);
    font: inherit;
    font-size: 0.875rem;
    cursor: pointer;
    transition: color 0.15s ease, border-color 0.15s ease, background 0.15s ease;
  }

  .watch-activity__chip--on {
    border-color: color-mix(in srgb, var(--uikit-v2-text) 55%, transparent);
    background: color-mix(in srgb, var(--uikit-v2-text) 8%, transparent);
    color: var(--uikit-v2-text);
    font-weight: 600;
  }

  .watch-activity__chip-icon {
    display: inline-flex;
  }

  .watch-activity__chart {
    display: flex;
    align-items: flex-end;
    overflow-x: auto;
    padding-top: 0.5rem;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .watch-activity__bars {
    position: relative;
  }

  /* Курсор-рука: полосу можно тащить мышью */
  @media (pointer: fine) {
    .watch-activity__chart,
    .watch-activity__year {
      cursor: grab;
      user-select: none;

      /* И над клетками дней: наведение и так показывает день внизу, а рука говорит, что полосу можно тащить */
      :global(*) {
        cursor: inherit !important;
      }
    }

    :global(.watch-activity--dragging) {
      cursor: grabbing;
    }
  }

  .watch-activity__year {
    overflow-x: auto;
    scrollbar-width: none;

    &::-webkit-scrollbar {
      display: none;
    }
  }

  .watch-activity__grid {
    display: grid;
    gap: 3px;
  }

  /* Дни недели остаются на месте, пока год листается */
  .watch-activity__axis {
    position: sticky;
    left: 0;
    z-index: 1;
    align-self: center;
    background: var(--uiv2-card-bg);
    color: var(--uiv2-fg-muted);
    font-size: 0.75rem;
    line-height: 1;
    white-space: nowrap;
  }

  .watch-activity__axis--month {
    position: static;
    height: 1.25rem;
    background: none;
  }

  .watch-activity__cell {
    display: block;
    aspect-ratio: 1;
    padding: 0;
    border: 0;
    border-radius: 2px;
    background: color-mix(in srgb, var(--uikit-v2-text) 7%, transparent);
    cursor: pointer;

    &[data-level='1'] {
      background: color-mix(in srgb, var(--uikit-v2-accent) 35%, transparent);
    }

    &[data-level='2'] {
      background: color-mix(in srgb, var(--uikit-v2-accent) 55%, transparent);
    }

    &[data-level='3'] {
      background: color-mix(in srgb, var(--uikit-v2-accent) 80%, transparent);
    }

    &[data-level='4'] {
      background: var(--uikit-v2-accent);
    }
  }

  .watch-activity__cell--none {
    cursor: default;
  }

  .watch-activity__cell--picked {
    outline: 1px solid var(--uikit-v2-text);
  }

  .watch-activity__heat-foot {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem 1.5rem;
    font-size: 0.8125rem;
  }

  .watch-activity__picked {
    color: var(--uikit-v2-text);
    font-variant-numeric: tabular-nums;
  }

  .watch-activity__legend {
    display: inline-flex;
    align-items: center;
    gap: 0.25rem;
    color: var(--uiv2-fg-muted);
    font-size: 0.75rem;

    .watch-activity__cell {
      width: 0.75rem;
      cursor: default;
    }
  }

  .watch-activity__day {
    display: flex;
    flex: 1 0 2.25rem;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    min-width: 2.25rem;
  }

  .watch-activity__count {
    color: var(--uiv2-fg-muted);
    font-size: 0.875rem;
    font-weight: 600;
    font-variant-numeric: tabular-nums;
  }

  .watch-activity__bar {
    width: 1.25rem;
    border-radius: 0.625rem 0.625rem 0 0;
    background: linear-gradient(
      to bottom,
      var(--uikit-v2-text) 35%,
      color-mix(in srgb, var(--uikit-v2-text) 35%, transparent)
    );
  }

  .watch-activity__date {
    height: 2.25rem;
    margin-top: 0.5rem;
    color: var(--uiv2-fg-muted);
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    white-space: nowrap;
    transform: rotate(-60deg);
    transform-origin: center 0.5rem;
  }

  .watch-activity__more {
    align-self: center;
    padding: 0.5rem 1rem;
    border: 0;
    background: none;
    color: var(--uikit-v2-text);
    font: inherit;
    font-size: 0.875rem;
    font-weight: 600;
    cursor: pointer;
  }

  .watch-activity__divider {
    width: 100%;
    margin: 0;
    border: 0;
    border-top: 1px solid color-mix(in srgb, var(--uikit-v2-text) 10%, transparent);
  }
</style>
