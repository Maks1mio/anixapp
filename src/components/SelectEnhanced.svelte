<script lang="ts">
  import { iconChevronDown, iconRotateCcw } from './icons';
  import Checkbox from './Checkbox.svelte';
  import ScrollArea from './ScrollArea.svelte';
  import type { SelectOption, SelectSection } from './select';

  interface Props {
    label?: string;
    placeholder?: string;
    options?: SelectOption[];
    sections?: SelectSection[];
    value?: string;
    values?: string[];
    multi?: boolean;
    searchable?: boolean;
    disabled?: boolean;
    variant?: 'default' | 'yearRange';
    startYear?: number | null;
    endYear?: number | null;
    onChange?: (value: string) => void;
    onValuesChange?: (values: string[]) => void;
    onYearRangeChange?: (start: number | null, end: number | null) => void;
    /** Значение «не выбрано». По умолчанию '0' (Неважно). Передайте '' если 0 — валидный выбор. */
    emptyValue?: string;
    /** Значение сброса для одиночного select. По умолчанию = emptyValue. */
    resetValue?: string;
  }

  let {
    label,
    placeholder = 'Неважно',
    options = [],
    sections = [],
    value = '0',
    values = [],
    multi = false,
    searchable = false,
    disabled = false,
    variant = 'default',
    startYear = null,
    endYear = null,
    onChange,
    onValuesChange,
    onYearRangeChange,
    emptyValue = '0',
    resetValue,
  }: Props = $props();

  const resetTo = $derived(resetValue ?? emptyValue);

  const GAP = 6;
  const EDGE = 8;
  const SEARCH_MIN = 10;
  const YEAR_MIN = 1960;

  let isOpen = $state(false);
  let query = $state('');
  let yearListFilter = $state('');
  let triggerEl = $state<HTMLElement | null>(null);
  let searchInput = $state<HTMLInputElement | null>(null);
  let dropdownStyle = $state('');
  let draftStart = $state<number | null>(null);
  let draftEnd = $state<number | null>(null);
  let activeYearPick = $state<'from' | 'to'>('from');

  const currentYear = new Date().getFullYear();
  const yearList = Array.from({ length: currentYear - 1959 }, (_, i) => currentYear - i);

  const flatOptions = $derived(
    variant === 'yearRange'
      ? []
      : sections.length
        ? sections.flatMap((s) => s.options)
        : options,
  );

  const searchInField = $derived(searchable || flatOptions.length >= SEARCH_MIN);

  const showOpenInput = $derived(
    isOpen && (variant === 'yearRange' || searchInField),
  );

  function clampYear(y: number): number | null {
    if (!Number.isFinite(y) || y < YEAR_MIN || y > currentYear) return null;
    return y;
  }

  function parseYearToken(token: string): number | null {
    if (!/^\d{4}$/.test(token)) return null;
    return clampYear(Number(token));
  }

  function formatYearRangeText(start: number | null, end: number | null): string {
    if (start == null && end == null) return '';
    if (start != null && end != null) return start === end ? String(start) : `${start} ${end}`;
    if (start != null) return String(start);
    return String(end);
  }

  function applyYearQueryParse() {
    const raw = query;
    const trimmed = raw.trim();
    if (!trimmed) {
      draftStart = null;
      draftEnd = null;
      yearListFilter = '';
      activeYearPick = 'from';
      return;
    }

    const parts = raw.split(/\s+/);
    const first = parts[0] ?? '';
    const second = parts[1] ?? '';
    const hasSpace = /\s/.test(raw);

    draftStart = parseYearToken(first);
    if (hasSpace) {
      activeYearPick = 'to';
      draftEnd = second ? parseYearToken(second) : null;
      yearListFilter = second && !parseYearToken(second) ? second : '';
    } else {
      activeYearPick = 'from';
      draftEnd = null;
      yearListFilter = first && !parseYearToken(first) ? first : '';
    }

    if (draftStart != null && draftEnd != null && draftStart > draftEnd) {
      [draftStart, draftEnd] = [draftEnd, draftStart];
      query = formatYearRangeText(draftStart, draftEnd);
    }
    commitYearRange();
  }

  function handleFieldInput(e: Event) {
    query = (e.currentTarget as HTMLInputElement).value;
    if (variant === 'yearRange') applyYearQueryParse();
  }

  const filteredSections = $derived.by(() => {
    if (variant === 'yearRange') return [];
    const q = query.trim().toLowerCase();
    if (!sections.length) {
      const list = !q
        ? options
        : options.filter((o) => o.label.toLowerCase().includes(q));
      return list.length ? [{ title: '', options: list }] : [];
    }
    return sections
      .map((s) => ({
        title: s.title,
        options: !q
          ? s.options
          : s.options.filter((o) => o.label.toLowerCase().includes(q)),
      }))
      .filter((s) => s.options.length > 0);
  });

  const filteredYears = $derived.by(() => {
    const q = yearListFilter.trim();
    if (!q) return yearList;
    return yearList.filter((y) => String(y).includes(q));
  });

  const closedLabel = $derived.by(() => {
    if (variant === 'yearRange') {
      if (startYear == null && endYear == null) return placeholder;
      if (startYear != null && endYear != null) return `${startYear} ${endYear}`;
      if (startYear != null) return String(startYear);
      return String(endYear);
    }
    if (multi) {
      if (!values.length) return placeholder;
      const labels = values
        .map((v) => flatOptions.find((o) => o.value === v)?.label)
        .filter(Boolean);
      return labels.length ? labels.join(', ') : `${values.length} выбрано`;
    }
    const opt = flatOptions.find((o) => o.value === value);
    if (value === '' || value == null) return placeholder;
    if (opt) return opt.label;
    return placeholder;
  });

  const hasSelection = $derived.by(() => {
    if (variant === 'yearRange') return startYear != null || endYear != null;
    if (multi) return values.length > 0;
    if (value === '') return false;
    return value !== resetTo;
  });

  function commitYearRange() {
    onYearRangeChange?.(draftStart, draftEnd);
  }

  function resetSelection(e: MouseEvent) {
    e.stopPropagation();
    if (variant === 'yearRange') {
      draftStart = null;
      draftEnd = null;
      query = '';
      yearListFilter = '';
      activeYearPick = 'from';
      onYearRangeChange?.(null, null);
      return;
    }
    if (multi) {
      onValuesChange?.([]);
      return;
    }
    onChange?.(resetTo);
  }

  let activeClose: (() => void) | null = null;

  function updatePosition() {
    if (!triggerEl) return;
    const rect = triggerEl.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const width = rect.width;
    const left = Math.max(EDGE, Math.min(rect.left, vw - width - EDGE));
    const top = rect.bottom + GAP;
    const maxH = variant === 'yearRange' ? 320 : 280;
    dropdownStyle = `top:${top}px;left:${left}px;width:${width}px;max-height:min(${maxH}px,calc(100vh - ${top + EDGE}px));`;
  }

  function open() {
    if (disabled) return;
    activeClose?.();
    if (variant === 'yearRange') {
      draftStart = startYear;
      draftEnd = endYear;
      activeYearPick = 'from';
      yearListFilter = '';
      query = formatYearRangeText(draftStart, draftEnd);
    } else {
      query = '';
    }
    isOpen = true;
    requestAnimationFrame(() => {
      updatePosition();
      if (showOpenInput || variant === 'yearRange') searchInput?.focus();
    });
    activeClose = close;
  }

  function close() {
    if (isOpen && variant === 'yearRange') {
      applyYearQueryParse();
    }
    isOpen = false;
    query = '';
    yearListFilter = '';
    if (activeClose === close) activeClose = null;
  }

  function toggle() {
    if (isOpen) close();
    else open();
  }

  function pickSingle(v: string) {
    onChange?.(v);
    close();
  }

  function toggleMulti(v: string) {
    const set = new Set(values);
    if (set.has(v)) set.delete(v);
    else set.add(v);
    onValuesChange?.([...set]);
  }

  function pickYear(y: number | null) {
    if (activeYearPick === 'from') {
      draftStart = y;
      if (draftEnd != null && y != null && y > draftEnd) draftEnd = y;
      if (y != null && draftEnd == null) activeYearPick = 'to';
    } else {
      draftEnd = y;
      if (draftStart != null && y != null && y < draftStart) draftStart = y;
    }
    query = formatYearRangeText(draftStart, draftEnd);
    yearListFilter = '';
    commitYearRange();
  }

  function onDocClick(e: MouseEvent) {
    const t = e.target as Node;
    if (!isOpen || !triggerEl) return;
    const dd = document.getElementById(dropdownId);
    if (triggerEl.contains(t) || dd?.contains(t)) return;
    close();
  }

  function onKey(e: KeyboardEvent) {
    if (e.key === 'Escape' && isOpen) close();
  }

  const dropdownId = `select-dd-${Math.random().toString(36).slice(2, 9)}`;

  $effect(() => {
    if (!isOpen) return;
    window.addEventListener('scroll', updatePosition, true);
    window.addEventListener('resize', updatePosition);
    document.addEventListener('mousedown', onDocClick);
    document.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('scroll', updatePosition, true);
      window.removeEventListener('resize', updatePosition);
      document.removeEventListener('mousedown', onDocClick);
      document.removeEventListener('keydown', onKey);
    };
  });
</script>

<div class="custom-select custom-select--enhanced{disabled ? ' custom-select--disabled' : ''}">
  {#if label}
    <span class="custom-select__label">{label}</span>
  {/if}

  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <div
    bind:this={triggerEl}
    class="custom-select__trigger custom-select__trigger--field"
    class:custom-select__trigger--open={isOpen}
    aria-expanded={isOpen ? 'true' : 'false'}
    onclick={(e) => {
      const t = e.target as HTMLElement;
      if (t.closest('.custom-select__trigger-input')) return;
      if (t.closest('.custom-select__trigger-clear')) return;
      toggle();
    }}
  >
    {#if showOpenInput}
      <input
        bind:this={searchInput}
        type="text"
        class="custom-select__trigger-input"
        placeholder={variant === 'yearRange' ? '2012 2024' : 'Поиск…'}
        value={query}
        oninput={handleFieldInput}
        onclick={(e) => e.stopPropagation()}
      />
    {:else}
      <span class="custom-select__trigger-text">
        <span class="custom-select__trigger-label">{closedLabel}</span>
      </span>
    {/if}
    <div class="custom-select__trigger-actions">
      <button
        type="button"
        class="custom-select__trigger-clear"
        class:custom-select__trigger-clear--hidden={!hasSelection}
        aria-label="Сбросить"
        aria-hidden={hasSelection ? undefined : true}
        tabindex={hasSelection ? 0 : -1}
        disabled={!hasSelection}
        onclick={resetSelection}
      >
        {@html iconRotateCcw(15)}
      </button>
      <button
        type="button"
        class="custom-select__trigger-chevron"
        aria-label={isOpen ? 'Свернуть' : 'Развернуть'}
        onclick={(e) => { e.stopPropagation(); toggle(); }}
      >
        {@html iconChevronDown(18)}
      </button>
    </div>
  </div>
</div>

{#if isOpen}
  <div
    id={dropdownId}
    class="custom-select__dropdown custom-select__dropdown--open custom-select__dropdown--enhanced"
    style={dropdownStyle}
    role="listbox"
  >
    {#if variant === 'yearRange'}
      <div class="custom-select__year-tabs">
        <button
          type="button"
          class="custom-select__year-tab"
          class:custom-select__year-tab--active={activeYearPick === 'from'}
          onclick={() => { activeYearPick = 'from'; yearListFilter = ''; searchInput?.focus(); }}
        >
          Год от {draftStart != null ? `(${draftStart})` : ''}
        </button>
        <button
          type="button"
          class="custom-select__year-tab"
          class:custom-select__year-tab--active={activeYearPick === 'to'}
          onclick={() => {
            activeYearPick = 'to';
            yearListFilter = '';
            if (draftStart != null && !/\s/.test(query)) query = `${draftStart} `;
            searchInput?.focus();
          }}
        >
          Год до {draftEnd != null ? `(${draftEnd})` : ''}
        </button>
      </div>
      <ScrollArea extraClass="custom-select__scroll-page">
        <button
          type="button"
          class="custom-select__option"
          class:custom-select__option--selected={(activeYearPick === 'from' ? draftStart : draftEnd) == null}
          onclick={() => pickYear(null)}
        >
          —
        </button>
        {#each filteredYears as y (y)}
          <button
            type="button"
            class="custom-select__option"
            class:custom-select__option--selected={(activeYearPick === 'from' ? draftStart : draftEnd) === y}
            onclick={() => pickYear(y)}
          >
            {y}
          </button>
        {/each}
      </ScrollArea>
    {:else}
      <ScrollArea extraClass="custom-select__scroll-page">
        {#if filteredSections.length === 0}
          <div class="custom-select__empty">Ничего не найдено</div>
        {:else}
          {#each filteredSections as section, si (si)}
            {#if section.title}
              <div class="custom-select__section-title">{section.title}</div>
            {/if}
            {#each section.options as opt (opt.value)}
              {#if multi}
                <Checkbox
                  checked={values.includes(opt.value)}
                  onchange={() => toggleMulti(opt.value)}
                  label={opt.label}
                  className="custom-select__check-row"
                />
              {:else}
                <button
                  type="button"
                  class="custom-select__option"
                  class:custom-select__option--with-desc={!!opt.desc}
                  class:custom-select__option--selected={value === opt.value}
                  onclick={() => pickSingle(opt.value)}
                >
                  {#if opt.desc}
                    <span class="custom-select__option-label">{opt.label}</span>
                    <span class="custom-select__option-desc">{opt.desc}</span>
                  {:else}
                    {opt.label}
                  {/if}
                </button>
              {/if}
            {/each}
          {/each}
        {/if}
      </ScrollArea>
    {/if}
  </div>
{/if}
