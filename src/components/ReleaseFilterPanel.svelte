<script lang="ts">
  /**
   * Фильтр релизов: «Моя вкладка» и поиск по фильтру (как FilterFragment в Anixart 11).
   * Список полей с текущими значениями, выбор открывается следующим уровнем внутри панели.
   * На телефоне и планшете — шторка снизу, на ПК — окно по центру; оформление общее с меню (.uiv2-menu-sheet).
   */
  import { onMount, untrack } from 'svelte';
  import { cubicOut } from 'svelte/easing';
  import { fade, fly } from 'svelte/transition';
  import { portal } from '../actions/portal';
  import { sheetDrag, sheetPage } from '../actions/sheet';
  import { uiv2CustomScroll } from '../actions/uiv2CustomScroll';
  import {
    AGE_RATINGS,
    ALL_GENRES,
    BOOKMARKS_EXCLUDE_HINT,
    CATEGORIES,
    COUNTRIES,
    EPISODE_DURATIONS,
    EPISODES_PRESETS,
    GENRE_SECTIONS,
    SEASONS,
    SORT_OPTIONS,
    SOURCES,
    STATUSES,
    STUDIOS,
  } from '../data/filterOptions';
  import { pushBackHandler } from '../platform/mobile-back';
  import { isMobileMode } from '../platform/mobile';
  import {
    DEFAULT_CUSTOM_FILTER,
    GENRES_MODE_ALL,
    GENRES_MODE_ANY,
    GENRES_MODE_EXCLUDE,
    type CustomFilterStorage,
    type GenresMode,
  } from '../utils/homeCustomTab';
  import { iconArrowLeft, iconCheck, iconChevronRight, iconX } from './icons';
  import UiV2Button from './uikit-v2/UiV2Button.svelte';
  import UiV2Select from './uikit-v2/UiV2Select.svelte';

  interface Props {
    title: string;
    /** Пояснение над полями. */
    notice?: string;
    initial: CustomFilterStorage;
    applyLabel?: string;
    onApply: (filter: CustomFilterStorage) => void;
    onClose: () => void;
  }
  let { title, notice = '', initial, applyLabel = 'Применить', onApply, onClose }: Props = $props();

  type Option = { value: string; label: string; desc?: string };
  type OptionGroup = { title: string; options: Option[] };
  type Field =
    | { id: string; group: string; label: string; kind: 'single'; options: Option[]; value: string; set: (v: string) => void }
    | { id: string; group: string; label: string; kind: 'multi'; groups: OptionGroup[]; values: string[]; set: (v: string[]) => void; hint?: string }
    | { id: string; group: string; label: string; kind: 'years' };

  const NOT_SET = 'Неважно';
  /** Длиннее этого списка нужен поиск. */
  const SEARCH_FROM = 12;
  /** Anixart предупреждает: со всеми жанрами сразу выдача быстро становится пустой. */
  const GENRES_WARN_FROM = 4;
  const MODE_TABS: { id: GenresMode; label: string; hint: string }[] = [
    { id: GENRES_MODE_ALL, label: 'Все', hint: 'Покажем релизы со всеми выбранными жанрами. Для точного результата выбирайте не больше 2–3 жанров.' },
    { id: GENRES_MODE_ANY, label: 'Хотя бы один', hint: 'Покажем релизы хотя бы с одним выбранным жанром.' },
    { id: GENRES_MODE_EXCLUDE, label: 'Исключить', hint: 'Покажем только релизы без выбранных жанров.' },
  ];

  const mobile = isMobileMode();
  let filter = $state<CustomFilterStorage>(untrack(() => ({ ...initial })));
  let voiceovers = $state<Option[]>([]);
  let panelEl = $state<HTMLDivElement | null>(null);
  let bodyHeight = $state<number | null>(null);
  let levelId = $state<string | null>(null);
  let levelDir = $state<1 | -1>(1);
  let query = $state('');

  function withNotSet(options: Option[]): Option[] {
    return [{ value: '', label: NOT_SET }, ...options];
  }

  const byValue = (values: readonly string[]): Option[] => values.map((v) => ({ value: v, label: v }));
  const byId = (rows: readonly { id: number; label: string }[]): Option[] =>
    rows.map((row) => ({ value: String(row.id), label: row.label }));

  const baseGenres = ALL_GENRES.filter((g) => !GENRE_SECTIONS.some((s) => (s.genres as readonly string[]).includes(g)));
  const GENRE_GROUPS: OptionGroup[] = [
    { title: '', options: byValue(baseGenres) },
    ...GENRE_SECTIONS.map((s) => ({ title: s.title, options: byValue(s.genres) })),
  ];
  const BOOKMARK_OPTIONS: Option[] = [
    { value: '0', label: 'Избранное' },
    { value: '1', label: 'Смотрю' },
    { value: '2', label: 'В планах' },
    { value: '3', label: 'Просмотрено' },
    { value: '4', label: 'Отложено' },
    { value: '5', label: 'Брошено' },
  ];
  const THIS_YEAR = new Date().getFullYear();
  const YEAR_OPTIONS = withNotSet(
    Array.from({ length: THIS_YEAR - 1960 + 2 }, (_, i) => String(THIS_YEAR + 1 - i)).map((y) => ({ value: y, label: y })),
  );

  function patch(next: Partial<CustomFilterStorage>) {
    filter = { ...filter, ...next };
  }

  const numberOrNull = (v: string) => (v ? Number(v) : null);
  const numberText = (v: number | null) => (v == null ? '' : String(v));

  const fields = $derived.by((): Field[] => [
    { id: 'sort', group: 'Главное', label: 'Сортировка', kind: 'single',
      options: SORT_OPTIONS.map((s) => ({ value: String(s.value), label: s.label, desc: s.hint })),
      value: String(filter.selected_sort ?? 0), set: (v) => patch({ selected_sort: Number(v) }) },
    { id: 'category', group: 'Главное', label: 'Категория', kind: 'single', options: withNotSet(byId(CATEGORIES)),
      value: numberText(filter.selected_category_id), set: (v) => patch({ selected_category_id: numberOrNull(v) }) },
    { id: 'status', group: 'Главное', label: 'Статус', kind: 'single', options: withNotSet(byId(STATUSES)),
      value: numberText(filter.selected_status_id), set: (v) => patch({ selected_status_id: numberOrNull(v) }) },
    { id: 'genres', group: 'Главное', label: 'Жанры', kind: 'multi', groups: GENRE_GROUPS,
      values: filter.selected_genres, set: (v) => patch({ selected_genres: v }) },

    { id: 'years', group: 'Когда вышло', label: 'Годы', kind: 'years' },
    { id: 'season', group: 'Когда вышло', label: 'Сезон', kind: 'single', options: withNotSet(byId(SEASONS)),
      value: numberText(filter.selected_season), set: (v) => patch({ selected_season: numberOrNull(v) }) },

    { id: 'country', group: 'Подробнее', label: 'Страна', kind: 'single', options: withNotSet(byValue(COUNTRIES)),
      value: filter.selected_country, set: (v) => patch({ selected_country: v }) },
    { id: 'studio', group: 'Подробнее', label: 'Студия', kind: 'single', options: withNotSet(byValue(STUDIOS)),
      value: filter.selected_studio, set: (v) => patch({ selected_studio: v }) },
    { id: 'source', group: 'Подробнее', label: 'Первоисточник', kind: 'single', options: withNotSet(byValue(SOURCES)),
      value: filter.selected_source, set: (v) => patch({ selected_source: v }) },
    { id: 'types', group: 'Подробнее', label: 'Озвучки', kind: 'multi', groups: [{ title: '', options: voiceovers }],
      values: filter.selected_types, set: (v) => patch({ selected_types: v }) },
    { id: 'episodes', group: 'Подробнее', label: 'Эпизодов', kind: 'single', options: withNotSet(byId(EPISODES_PRESETS)),
      value: numberText(filter.selected_episodes), set: (v) => patch({ selected_episodes: numberOrNull(v) }) },
    { id: 'duration', group: 'Подробнее', label: 'Длительность эпизода', kind: 'single', options: withNotSet(byId(EPISODE_DURATIONS)),
      value: numberText(filter.selected_episode_duration), set: (v) => patch({ selected_episode_duration: numberOrNull(v) }) },
    { id: 'age', group: 'Подробнее', label: 'Возрастное ограничение', kind: 'multi', groups: [{ title: '', options: byId(AGE_RATINGS) }],
      values: filter.selected_age_ratings, set: (v) => patch({ selected_age_ratings: v }) },

    { id: 'exclusions', group: 'Исключить', label: 'Закладки', kind: 'multi', groups: [{ title: '', options: BOOKMARK_OPTIONS }],
      values: filter.selected_profile_list_exclusions, set: (v) => patch({ selected_profile_list_exclusions: v }), hint: BOOKMARKS_EXCLUDE_HINT },
  ]);

  const fieldGroups = $derived.by(() => {
    const groups: { title: string; fields: Field[] }[] = [];
    for (const field of fields) {
      const last = groups[groups.length - 1];
      if (last?.title === field.group) last.fields.push(field);
      else groups.push({ title: field.group, fields: [field] });
    }
    return groups;
  });

  const level = $derived(fields.find((field) => field.id === levelId) ?? null);
  const isDefault = $derived(JSON.stringify(filter) === JSON.stringify({ ...filter, ...DEFAULT_CUSTOM_FILTER }));
  const activeMode = $derived(MODE_TABS.find((tab) => tab.id === filter.selected_genres_mode) ?? MODE_TABS[0]);

  function yearsText(): string {
    const { selected_start_year: from, selected_end_year: to } = filter;
    if (from != null && to != null) return from === to ? String(from) : `${from} – ${to}`;
    if (from != null) return `с ${from}`;
    if (to != null) return `до ${to}`;
    return NOT_SET;
  }

  function fieldValueText(field: Field): string {
    if (field.kind === 'years') return yearsText();
    if (field.kind === 'single') return field.options.find((o) => o.value === field.value)?.label ?? NOT_SET;
    if (!field.values.length) return NOT_SET;
    const labels = field.values.map((v) => {
      for (const group of field.groups) {
        const hit = group.options.find((o) => o.value === v);
        if (hit) return hit.label;
      }
      return v;
    });
    return labels.length > 2 ? `${labels.slice(0, 2).join(', ')} +${labels.length - 2}` : labels.join(', ');
  }

  function isFieldSet(field: Field): boolean {
    if (field.kind === 'years') return filter.selected_start_year != null || filter.selected_end_year != null;
    if (field.kind === 'multi') return field.values.length > 0;
    return field.id === 'sort' ? field.value !== '0' : !!field.value;
  }

  function matches(option: Option): boolean {
    return option.label.toLocaleLowerCase('ru-RU').includes(query.trim().toLocaleLowerCase('ru-RU'));
  }

  function optionCount(field: Field): number {
    if (field.kind === 'single') return field.options.length;
    if (field.kind === 'multi') return field.groups.reduce((sum, group) => sum + group.options.length, 0);
    return 0;
  }

  function openLevel(id: string) {
    levelDir = 1;
    query = '';
    levelId = id;
  }

  function back() {
    levelDir = -1;
    levelId = null;
  }

  function toggle(field: Extract<Field, { kind: 'multi' }>, value: string) {
    field.set(field.values.includes(value) ? field.values.filter((v) => v !== value) : [...field.values, value]);
  }

  function setYears(start: number | null, end: number | null) {
    // Перепутанные границы меняем местами, а не показываем пустую выдачу
    if (start != null && end != null && start > end) patch({ selected_start_year: end, selected_end_year: start });
    else patch({ selected_start_year: start, selected_end_year: end });
  }

  function setGenresMode(mode: GenresMode) {
    patch({ selected_genres_mode: mode, is_genres_exclude_mode_enabled: mode === GENRES_MODE_EXCLUDE });
  }

  function reset() {
    filter = { ...DEFAULT_CUSTOM_FILTER };
  }

  function apply() {
    onApply($state.snapshot(filter) as CustomFilterStorage);
  }

  function onKeydown(e: KeyboardEvent) {
    // Открытый список выбора закрывается первым и помечает событие
    if (e.key !== 'Escape' || e.defaultPrevented) return;
    if (levelId) back();
    else onClose();
  }

  onMount(() => {
    const offBack = pushBackHandler(() => {
      if (levelId) back();
      else onClose();
      return true;
    });
    void window.anixApi?.type?.all?.().then((data) => {
      voiceovers = (data?.types ?? [])
        .filter((t): t is { id: number; name: string } => typeof t?.id === 'number' && typeof t?.name === 'string')
        .sort((a, b) => a.name.localeCompare(b.name, 'ru'))
        .map((t) => ({ value: String(t.id), label: t.name }));
    });
    return offBack;
  });
</script>

<svelte:window onkeydown={onKeydown} />

<div class="uiv2-menu-sheet release-filter" use:portal>
  <button
    type="button"
    class="uiv2-menu-sheet__scrim"
    aria-label="Закрыть"
    onclick={onClose}
    transition:fade|global={{ duration: 200 }}
  ></button>

  <div
    bind:this={panelEl}
    class="uiv2-menu-sheet__panel"
    role="dialog"
    aria-modal="true"
    aria-label={level?.label ?? title}
    transition:fly|global={mobile
      ? { y: '100%', duration: 280, easing: cubicOut, opacity: 1 }
      : { y: 16, duration: 200, easing: cubicOut }}
  >
    <div class="uiv2-menu-sheet__head" use:sheetDrag={{ panel: () => panelEl, onClose }}>
      <span class="uiv2-menu-sheet__handle" aria-hidden="true"></span>
      <div class="uiv2-menu-sheet__bar">
        {#if level}
          <button type="button" class="uiv2-menu-sheet__back" aria-label="Назад" onclick={back}>
            {@html iconArrowLeft(22)}
          </button>
        {/if}
        <span class="uiv2-menu-sheet__title release-filter__title">{level?.label ?? title}</span>
        {#if !mobile}
          <button type="button" class="uiv2-menu-sheet__back" aria-label="Закрыть" onclick={onClose}>
            {@html iconX(20)}
          </button>
        {/if}
      </div>
    </div>

    <div class="uiv2-menu-sheet__body" style:height={bodyHeight == null ? undefined : `${bodyHeight}px`}>
      {#key levelId}
        <div
          class="uiv2-menu-sheet__page uiv2-scroll-area uiv2-scroll-area--y"
          use:uiv2CustomScroll={{ axis: 'y', viewportSelector: '.uiv2-menu-sheet__viewport', showOnScroll: true }}
          in:fly={{ x: levelDir * 40, duration: 240, easing: cubicOut }}
          out:fly={{ x: levelDir * -40, duration: 160, easing: cubicOut }}
        >
          <div class="uiv2-menu-sheet__viewport uiv2-scroll-area__viewport" use:sheetPage={(height) => { bodyHeight = height; }}>
            <div class="uiv2-menu-sheet__inner">
              {#if !level}
                {#if notice}<p class="release-filter__note">{notice}</p>{/if}
                {#each fieldGroups as group (group.title)}
                  <h3 class="release-filter__group">{group.title}</h3>
                  <ul class="uiv2-menu-sheet__list">
                    {#each group.fields as field (field.id)}
                      <li>
                        <button
                          type="button"
                          class="uiv2-popup-menu__item release-filter__row"
                          class:release-filter__row--set={isFieldSet(field)}
                          onclick={() => openLevel(field.id)}
                        >
                          <span class="uiv2-popup-menu__label">{field.label}</span>
                          <span class="uiv2-popup-menu__value">{fieldValueText(field)}</span>
                          <span class="uiv2-popup-menu__chevron" aria-hidden="true">{@html iconChevronRight(14)}</span>
                        </button>
                      </li>
                    {/each}
                  </ul>
                {/each}
              {:else if level.kind === 'years'}
                <div class="release-filter__years">
                  <UiV2Select
                    label="С"
                    options={YEAR_OPTIONS}
                    value={numberText(filter.selected_start_year)}
                    onChange={(v) => setYears(numberOrNull(v), filter.selected_end_year)}
                  />
                  <UiV2Select
                    label="По"
                    options={YEAR_OPTIONS}
                    value={numberText(filter.selected_end_year)}
                    onChange={(v) => setYears(filter.selected_start_year, numberOrNull(v))}
                  />
                </div>
              {:else}
                {#if level.id === 'genres'}
                  <div class="release-filter__modes" role="group" aria-label="Как учитывать жанры">
                    {#each MODE_TABS as tab (tab.id)}
                      <button
                        type="button"
                        class="release-filter__mode"
                        class:release-filter__mode--on={tab.id === activeMode.id}
                        aria-pressed={tab.id === activeMode.id}
                        onclick={() => setGenresMode(tab.id)}
                      >{tab.label}</button>
                    {/each}
                  </div>
                  <p class="release-filter__note">{activeMode.hint}</p>
                  {#if activeMode.id === GENRES_MODE_ALL && filter.selected_genres.length >= GENRES_WARN_FROM}
                    <p class="release-filter__note release-filter__note--warn">Выбрано слишком много жанров: выдача может оказаться пустой</p>
                  {/if}
                {:else if level.kind === 'multi' && level.hint}
                  <p class="release-filter__note">{level.hint}</p>
                {/if}

                {#if optionCount(level) > SEARCH_FROM}
                  <input
                    class="release-filter__search"
                    type="search"
                    placeholder="Поиск"
                    aria-label="Поиск по списку"
                    autocomplete="off"
                    bind:value={query}
                  />
                {/if}

                {#if level.kind === 'single'}
                  {@const field = level}
                  <ul class="uiv2-menu-sheet__list">
                    {#each field.options.filter(matches) as option (option.value)}
                      <li>
                        <button
                          type="button"
                          class="uiv2-popup-menu__item"
                          class:uiv2-popup-menu__item--checked={option.value === field.value}
                          aria-pressed={option.value === field.value}
                          onclick={() => { field.set(option.value); back(); }}
                        >
                          <span class="uiv2-popup-menu__label">
                            {option.label}
                            {#if option.desc}<small class="release-filter__desc">{option.desc}</small>{/if}
                          </span>
                          {#if option.value === field.value}
                            <span class="uiv2-popup-menu__icon uiv2-popup-menu__icon--check" aria-hidden="true">{@html iconCheck(16)}</span>
                          {/if}
                        </button>
                      </li>
                    {/each}
                  </ul>
                {:else}
                  {@const field = level}
                  {#each field.groups as group (group.title)}
                    {@const visible = group.options.filter(matches)}
                    {#if visible.length}
                      {#if group.title}<h3 class="release-filter__group">{group.title}</h3>{/if}
                      <ul class="uiv2-menu-sheet__list">
                        {#each visible as option (option.value)}
                          <li>
                            <button
                              type="button"
                              class="uiv2-popup-menu__item"
                              class:uiv2-popup-menu__item--checked={field.values.includes(option.value)}
                              aria-pressed={field.values.includes(option.value)}
                              onclick={() => toggle(field, option.value)}
                            >
                              <span class="uiv2-popup-menu__label">{option.label}</span>
                              {#if field.values.includes(option.value)}
                                <span class="uiv2-popup-menu__icon uiv2-popup-menu__icon--check" aria-hidden="true">{@html iconCheck(16)}</span>
                              {/if}
                            </button>
                          </li>
                        {/each}
                      </ul>
                    {/if}
                  {/each}
                {/if}
              {/if}
            </div>
          </div>
          <div class="uiv2-scroll-area__v-track" aria-hidden="true">
            <div class="uiv2-scroll-area__v-thumb"></div>
          </div>
        </div>
      {/key}
    </div>

    <div class="release-filter__foot">
      {#if level}
        <UiV2Button label="Готово" variant="primary" block onclick={back} />
      {:else}
        {#if !isDefault}<UiV2Button label="Сбросить" variant="ghost" onclick={reset} />{/if}
        <UiV2Button label={applyLabel} variant="primary" block onclick={apply} />
      {/if}
    </div>
  </div>
</div>
