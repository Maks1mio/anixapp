<script lang="ts">
  /** Кнопка «Фильтры» в полосе вкладок. Меню с подменю на ПК, шторка снизу на телефоне и планшете (см. UiV2PopupMenu). */
  import {
    iconArrowUpDown,
    iconCalendar,
    iconFlag,
    iconRotateCcw,
    iconSlidersHorizontal,
    iconSun,
    iconTags,
  } from './icons';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from './uikit-v2/UiV2PopupMenu.svelte';

  export interface PopularFilterRow {
    id: 'sort' | 'year' | 'season' | 'genre' | 'status';
    label: string;
    options: { value: string; label: string }[];
    value: string;
    onChange: (value: string) => void;
  }

  interface Props {
    rows: PopularFilterRow[];
    /** Сколько фильтров отличается от значений по умолчанию. */
    count: number;
    onReset: () => void;
  }
  let { rows, count, onReset }: Props = $props();

  const RESET_ID = 'reset';
  const ROW_ICONS: Record<PopularFilterRow['id'], string> = {
    sort: iconArrowUpDown(18),
    year: iconCalendar(18),
    season: iconSun(18),
    genre: iconTags(18),
    status: iconFlag(18),
  };

  let open = $state(false);
  let triggerEl = $state<HTMLButtonElement | null>(null);

  const items = $derived.by((): UiV2PopupMenuItem[] => {
    const menu: UiV2PopupMenuItem[] = rows.map((row) => ({
      id: row.id,
      label: row.label,
      icon: ROW_ICONS[row.id],
      valueText: row.options.find((option) => option.value === row.value)?.label,
      children: row.options.map((option) => ({
        id: `${row.id}:${option.value}`,
        label: option.label,
        type: 'radio' as const,
        checked: option.value === row.value,
      })),
    }));
    if (count > 0) {
      menu.push({ id: RESET_ID, label: 'Сбросить', icon: iconRotateCcw(18), dividerBefore: true });
    }
    return menu;
  });

  function onSelect(id: string) {
    if (id === RESET_ID) {
      onReset();
      return;
    }
    const colon = id.indexOf(':');
    if (colon < 0) return;
    rows.find((row) => row.id === id.slice(0, colon))?.onChange(id.slice(colon + 1));
  }
</script>

<button
  bind:this={triggerEl}
  type="button"
  class="uiv2-tabs__tool-btn popular-filters-btn"
  class:popular-filters-btn--on={open || count > 0}
  aria-haspopup="menu"
  aria-expanded={open}
  aria-label={count > 0 ? `Фильтры, выбрано ${count}` : 'Фильтры'}
  onclick={() => { open = !open; }}
>
  {@html iconSlidersHorizontal(18)}
  {#if count > 0}<span class="popular-filters-btn__count" aria-hidden="true">{count}</span>{/if}
</button>

<UiV2PopupMenu
  {open}
  x={0}
  y={0}
  dropdown
  wide
  anchor={triggerEl}
  title="Фильтры"
  {items}
  onClose={() => { open = false; }}
  {onSelect}
/>
