<script lang="ts">
  import Select from './Select.svelte';
  import Checkbox from './Checkbox.svelte';
  import ScrollArea from './ScrollArea.svelte';
  import type { SelectOption, SelectSection } from './select';
  import { onMount, untrack } from 'svelte';
  import {
    AGE_RATINGS,
    ALL_GENRES,
    BOOKMARKS_EXCLUDE_HINT,
    CATEGORIES,
    COUNTRIES,
    EPISODE_DURATIONS,
    EPISODES_PRESETS,
    FILTER_HINT,
    GENRE_SECTIONS,
    GENRES_EXCLUDE_HINT,
    GENRES_HINT,
    SEASONS,
    SORT_OPTIONS,
    SOURCES,
    STATUSES,
    STUDIOS,
  } from '../data/filterOptions';
  import {
    DEFAULT_CUSTOM_FILTER,
    serializeHomeCustomTabData,
    type CustomFilterStorage,
    type HomeCustomTabData,
  } from '../utils/homeCustomTab';

  interface VoiceoverType {
    id: number;
    name: string;
  }

  interface Props {
    initial: HomeCustomTabData;
    onSave: (data: HomeCustomTabData) => void;
    onClose: () => void;
  }

  let { initial, onSave, onClose }: Props = $props();

  let filter = $state<CustomFilterStorage>(untrack(() => ({ ...(initial.filter ?? DEFAULT_CUSTOM_FILTER) })));
  let voiceoverTypes = $state<VoiceoverType[]>([]);

  const none = '0';

  const countryOptions: SelectOption[] = [
    { value: none, label: 'Неважно' },
    ...COUNTRIES.map((c) => ({ value: c, label: c })),
  ];
  const categoryOptions: SelectOption[] = [
    { value: none, label: 'Неважно' },
    ...CATEGORIES.map((c) => ({ value: String(c.id), label: c.label })),
  ];
  const seasonOptions: SelectOption[] = [
    { value: none, label: 'Неважно' },
    ...SEASONS.map((s) => ({ value: String(s.id), label: s.label })),
  ];
  const episodesOptions: SelectOption[] = [
    { value: none, label: 'Неважно' },
    ...EPISODES_PRESETS.map((e) => ({ value: String(e.id), label: e.label })),
  ];
  const statusOptions: SelectOption[] = [
    { value: none, label: 'Неважно' },
    ...STATUSES.map((s) => ({ value: String(s.id), label: s.label })),
  ];
  const durationOptions: SelectOption[] = [
    { value: none, label: 'Неважно' },
    ...EPISODE_DURATIONS.map((d) => ({ value: String(d.id), label: d.label })),
  ];
  const studioOptions: SelectOption[] = [
    { value: none, label: 'Неважно' },
    ...STUDIOS.map((s) => ({ value: s, label: s })),
  ];
  const sourceOptions: SelectOption[] = [
    { value: none, label: 'Неважно' },
    ...SOURCES.map((s) => ({ value: s, label: s })),
  ];
  const sortOptions: SelectOption[] = SORT_OPTIONS.map((s) => ({
    value: String(s.value),
    label: s.label,
    desc: s.hint,
  }));

  const baseGenres = ALL_GENRES.filter(
    (g) => !GENRE_SECTIONS.some((s) => (s.genres as readonly string[]).includes(g)),
  );
  const genreSections: SelectSection[] = [
    { title: '', options: baseGenres.map((g) => ({ value: g, label: g })) },
    ...GENRE_SECTIONS.map((s) => ({
      title: s.title,
      options: s.genres.map((g) => ({ value: g, label: g })),
    })),
  ];

  const bookmarkOptions: SelectOption[] = [
    { value: '0', label: 'Избранное' },
    { value: '1', label: 'Смотрю' },
    { value: '2', label: 'В планах' },
    { value: '3', label: 'Просмотрено' },
    { value: '4', label: 'Отложено' },
    { value: '5', label: 'Брошено' },
  ];
  const ageOptions: SelectOption[] = AGE_RATINGS.map((a) => ({
    value: String(a.id),
    label: a.label,
  }));

  const voiceoverOptions = $derived<SelectOption[]>(
    voiceoverTypes.map((t) => ({ value: String(t.id), label: t.name })),
  );

  const sortHint = $derived(
    SORT_OPTIONS.find((s) => s.value === filter.selected_sort)?.hint ?? '',
  );

  function numOrNull(v: string): number | null {
    if (!v || v === none) return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  function strOrEmpty(v: string): string {
    return !v || v === none ? '' : v;
  }

  function apply() {
    onSave(serializeHomeCustomTabData({
      tabName: initial.tabName,
      filter,
      activeTab: initial.activeTab,
    }));
  }

  function resetAll() {
    filter = { ...DEFAULT_CUSTOM_FILTER };
  }

  onMount(() => {
    void window.anixApi?.type?.all?.().then((data) => {
      voiceoverTypes = (data?.types ?? [])
        .filter((t): t is VoiceoverType => typeof t?.id === 'number' && typeof t?.name === 'string')
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
    });
  });
</script>

<div class="home-filter-modal" role="dialog" aria-modal="true" aria-labelledby="home-filter-title">
  <button type="button" class="home-filter-modal__backdrop" aria-label="Закрыть" onclick={onClose}></button>

  <div class="home-filter-modal__panel">
    <header class="home-filter-modal__head">
      <h2 id="home-filter-title" class="home-filter-modal__title">Настройки вкладки</h2>
      <button type="button" class="home-filter-modal__close" aria-label="Закрыть" onclick={onClose}>×</button>
    </header>

    <ScrollArea extraClass="home-filter-modal__body">
      <p class="home-filter-modal__notice">{FILTER_HINT}</p>

      <Select
        label="Страна"
        enhanced
        searchable
        options={countryOptions}
        value={filter.selected_country || none}
        onChange={(v: string) => { filter = { ...filter, selected_country: strOrEmpty(v) }; }}
      />

      <Select
        label="Категория"
        enhanced
        searchable
        options={categoryOptions}
        value={filter.selected_category_id != null ? String(filter.selected_category_id) : none}
        onChange={(v: string) => { filter = { ...filter, selected_category_id: numOrNull(v) }; }}
      />

      <div class="home-filter-modal__field">
        <Select
          label="Жанры"
          enhanced
          sections={genreSections}
          multi
          searchable
          values={filter.selected_genres}
          onValuesChange={(v: string[]) => { filter = { ...filter, selected_genres: v }; }}
        />
        <p class="home-filter-modal__hint">
          {filter.is_genres_exclude_mode_enabled ? GENRES_EXCLUDE_HINT : GENRES_HINT}
        </p>
        <Checkbox
          bind:checked={filter.is_genres_exclude_mode_enabled}
          label="Режим исключения жанров"
          className="home-filter-modal__check"
        />
      </div>

      <div class="home-filter-modal__field">
        <Select
          label="Исключить закладки"
          enhanced
          searchable
          options={bookmarkOptions}
          multi
          values={filter.selected_profile_list_exclusions}
          onValuesChange={(v: string[]) => { filter = { ...filter, selected_profile_list_exclusions: v }; }}
        />
        <p class="home-filter-modal__hint">{BOOKMARKS_EXCLUDE_HINT}</p>
      </div>

      <Select
        label="Варианты озвучек"
        enhanced
        options={voiceoverOptions}
        multi
        searchable
        values={filter.selected_types}
        onValuesChange={(v: string[]) => { filter = { ...filter, selected_types: v }; }}
      />

      <Select
        label="Студия"
        enhanced
        searchable
        options={studioOptions}
        value={filter.selected_studio || none}
        onChange={(v: string) => { filter = { ...filter, selected_studio: strOrEmpty(v) }; }}
      />

      <Select
        label="Первоисточник"
        enhanced
        searchable
        options={sourceOptions}
        value={filter.selected_source || none}
        onChange={(v: string) => { filter = { ...filter, selected_source: strOrEmpty(v) }; }}
      />

      <div class="home-filter-modal__row">
        <Select
          label="Года"
          enhanced
          variant="yearRange"
          startYear={filter.selected_start_year}
          endYear={filter.selected_end_year}
          onYearRangeChange={(start: number | null, end: number | null) => {
            filter = { ...filter, selected_start_year: start, selected_end_year: end };
          }}
        />
        <Select
          label="Сезон"
          enhanced
          searchable
          options={seasonOptions}
          value={filter.selected_season != null ? String(filter.selected_season) : none}
          onChange={(v: string) => { filter = { ...filter, selected_season: numOrNull(v) }; }}
        />
      </div>

      <div class="home-filter-modal__row">
        <Select
          label="Эпизодов"
          enhanced
          searchable
          options={episodesOptions}
          value={filter.selected_episodes != null ? String(filter.selected_episodes) : none}
          onChange={(v: string) => { filter = { ...filter, selected_episodes: numOrNull(v) }; }}
        />
        <Select
          label="Статус"
          enhanced
          searchable
          options={statusOptions}
          value={filter.selected_status_id != null ? String(filter.selected_status_id) : none}
          onChange={(v: string) => { filter = { ...filter, selected_status_id: numOrNull(v) }; }}
        />
      </div>

      <Select
        label="Длительность эпизода"
        enhanced
        searchable
        options={durationOptions}
        value={filter.selected_episode_duration != null ? String(filter.selected_episode_duration) : none}
        onChange={(v: string) => { filter = { ...filter, selected_episode_duration: numOrNull(v) }; }}
      />

      <Select
        label="Возрастное ограничение"
        enhanced
        searchable
        options={ageOptions}
        multi
        values={filter.selected_age_ratings}
        onValuesChange={(v: string[]) => { filter = { ...filter, selected_age_ratings: v }; }}
      />

      <Select
        label="Сортировка"
        enhanced
        searchable
        emptyValue=""
        resetValue="0"
        options={sortOptions}
        value={String(filter.selected_sort ?? 0)}
        onChange={(v: string) => { filter = { ...filter, selected_sort: Number(v) }; }}
      />
      {#if sortHint}
        <p class="home-filter-modal__hint home-filter-modal__hint--tight">{sortHint}</p>
      {/if}
    </ScrollArea>

    <footer class="home-filter-modal__foot">
      <button type="button" class="btn btn-secondary" onclick={resetAll}>Сбросить</button>
      <button type="button" class="btn btn-primary" onclick={apply}>Применить</button>
    </footer>
  </div>
</div>
