<script lang="ts">
  import UiV2PillField from '../uikit-v2/UiV2PillField.svelte';
  import UiV2Button from '../uikit-v2/UiV2Button.svelte';
  import UiV2RoundButton from '../uikit-v2/UiV2RoundButton.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from '../uikit-v2/UiV2PopupMenu.svelte';
  import {
    iconSearch,
    iconX,
    iconArrowUpDown,
    iconSlidersHorizontal,
    iconShuffle,
    iconChevronDown,
  } from '../icons';
  import { BOOKMARK_SORT_OPTIONS } from '../../constants/bookmarkSort';
  import { BOOKMARK_ANNOUNCE_FILTERS, bookmarkAnnounceFilterLabel } from '../../constants/bookmarkFilter';

  type Props = {
    searchPlaceholder: string;
    searchValue: string;
    onSearchInput: (e: Event) => void;
    onSearchClear: () => void;
    /** Сортировка и случайный тайтл — только у списков релизов */
    showListControls: boolean;
    /** Фильтр анонсов — статусные списки и избранное */
    showFilter: boolean;
    sort: number;
    filter: number;
    randomDisabled: boolean;
    onSortChange: (sort: number) => void;
    onFilterChange: (filter: number) => void;
    onRandom: () => void;
  };

  let {
    searchPlaceholder,
    searchValue,
    onSearchInput,
    onSearchClear,
    showListControls,
    showFilter,
    sort,
    filter,
    randomDisabled,
    onSortChange,
    onFilterChange,
    onRandom,
  }: Props = $props();

  type MenuKind = 'sort' | 'filter';
  let menu = $state<MenuKind | null>(null);
  let menuX = $state(0);
  let menuY = $state(0);
  let menuAnchor = $state<HTMLElement | null>(null);

  const sortMeta = $derived(BOOKMARK_SORT_OPTIONS.find((o) => o.value === sort) ?? BOOKMARK_SORT_OPTIONS[0]);
  /** Короткая подпись направления для кнопки — полная видна в меню */
  const SORT_SHORT: Record<number, string> = {
    1: 'новые', 2: 'старые', 3: 'новые', 4: 'старые', 5: 'А–Я', 6: 'Я–А', 7: 'высокий', 8: 'низкий',
  };
  const sortLabel = $derived(`${sortMeta.label} · ${SORT_SHORT[sortMeta.value] ?? ''}`);

  // Группы как в Anixart: «По добавлению» → новые/старые и т.д.
  const sortItems = $derived.by((): UiV2PopupMenuItem[] => {
    const out: UiV2PopupMenuItem[] = [];
    let prev = '';
    for (const o of BOOKMARK_SORT_OPTIONS) {
      if (o.label !== prev) {
        out.push({ id: `label:${o.label}`, label: o.label, type: 'label', dividerBefore: out.length > 0 });
        prev = o.label;
      }
      out.push({ id: `sort:${o.value}`, label: o.desc, type: 'radio', checked: o.value === sort, keepOpen: false });
    }
    return out;
  });

  const filterItems = $derived<UiV2PopupMenuItem[]>(
    BOOKMARK_ANNOUNCE_FILTERS.map((o) => ({
      id: `filter:${o.value}`,
      label: o.label,
      type: 'radio',
      checked: o.value === filter,
      keepOpen: false,
    })),
  );

  function openMenu(kind: MenuKind, e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    if (menu === kind) {
      menu = null;
      return;
    }
    const rect = el.getBoundingClientRect();
    menuX = (rect.left + rect.right) / 2;
    menuY = (rect.top + rect.bottom) / 2;
    menuAnchor = el;
    menu = kind;
  }

  function onSelect(id: string) {
    const [kind, raw] = id.split(':');
    const value = Number(raw);
    if (kind === 'sort') onSortChange(value);
    else if (kind === 'filter') onFilterChange(value);
  }

  function onSearchKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && searchValue) {
      e.preventDefault();
      onSearchClear();
    }
  }
</script>

<div class="bm-tools" role="toolbar" aria-label="Действия списка">
  <div class="bm-tools__search">
    <UiV2PillField
      size="lg"
      type="search"
      label={searchPlaceholder}
      value={searchValue}
      autocomplete="off"
      spellcheck={false}
      oninput={onSearchInput}
      onkeydown={onSearchKeydown}
    >
      {#snippet icon()}{@html iconSearch(18)}{/snippet}
    </UiV2PillField>
    {#if searchValue}
      <button type="button" class="bm-tools__clear" aria-label="Очистить поиск" onclick={onSearchClear}>
        {@html iconX(14)}
      </button>
    {/if}
  </div>

  {#if showListControls}
    <UiV2Button
      size="lg"
      label={sortLabel}
      class="bm-tools__menu-btn"
      ariaHaspopup="menu"
      ariaExpanded={menu === 'sort'}
      onclick={(e) => openMenu('sort', e)}
    >
      {#snippet icon()}{@html iconArrowUpDown(16)}{/snippet}
      {#snippet trailing()}{@html iconChevronDown(14)}{/snippet}
    </UiV2Button>

    {#if showFilter}
      <UiV2Button
        size="lg"
        label={bookmarkAnnounceFilterLabel(filter)}
        class="bm-tools__menu-btn {filter !== 0 ? 'bm-tools__menu-btn--active' : ''}"
        ariaHaspopup="menu"
        ariaExpanded={menu === 'filter'}
        onclick={(e) => openMenu('filter', e)}
      >
        {#snippet icon()}{@html iconSlidersHorizontal(16)}{/snippet}
        {#snippet trailing()}{@html iconChevronDown(14)}{/snippet}
      </UiV2Button>
    {/if}

    <UiV2RoundButton size="lg" label="Случайный тайтл из списка" disabled={randomDisabled} onclick={onRandom}>
      {@html iconShuffle(18)}
    </UiV2RoundButton>
  {/if}
</div>

<UiV2PopupMenu
  open={menu !== null}
  x={menuX}
  y={menuY}
  placement="anchor"
  anchor={menuAnchor}
  items={menu === 'sort' ? sortItems : filterItems}
  onClose={() => (menu = null)}
  {onSelect}
/>
