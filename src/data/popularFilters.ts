/**
 * Фильтры вкладки «Популярное» (десктоп): поверх вкладки — год, сезон, жанр, сортировка.
 * Всё уходит в тот же POST /filter/{page}, что и вкладки (FilterRequest Anixart).
 */
import { ALL_GENRES, SEASONS } from './filterOptions';
import { getPopularTabFilterArgs, type PopularTabId } from './popularTabs';

/** «Всё» есть только на десктопе — TV держит свои четыре ряда. */
export type PopularViewTab = 'all' | PopularTabId | 'series' | 'specials';

export const POPULAR_VIEW_TABS: readonly { id: PopularViewTab; label: string }[] = [
  { id: 'all', label: 'Всё' },
  { id: 'ongoing', label: 'Онгоинги' },
  { id: 'finished', label: 'Завершённые' },
  { id: 'series', label: 'Сериалы' },
  { id: 'movies', label: 'Фильмы' },
  { id: 'ova', label: 'OVA' },
  { id: 'specials', label: 'Спешлы' },
];

/** Чья статистика: /filter Anixart или каталог AnixApp (anixback). */
export type PopularSource = 'anixart' | 'anixapp';

export const POPULAR_SOURCE_TABS: readonly { id: PopularSource; label: string }[] = [
  { id: 'anixart', label: 'Anixart' },
  { id: 'anixapp', label: 'AnixApp' },
];

/** Этих типов нет в условиях вкладок Anixart: только каталог AnixApp. */
export function isAnixappOnlyTab(tab: PopularViewTab): tab is 'series' | 'specials' {
  return tab === 'series' || tab === 'specials';
}

export function popularViewTabs(source: PopularSource) {
  return POPULAR_VIEW_TABS.filter((t) => source === 'anixapp' || !isAnixappOnlyTab(t.id));
}

export type PopularSort = 'popular' | 'grade' | 'votes' | 'episodes' | 'year' | 'updated' | 'new' | 'title';

export interface PopularFilters {
  source: PopularSource;
  sort: PopularSort;
  /** 'any' | '2025' | '2010s' | 'old' */
  year: string;
  /** 'any' | '1'…'4' (SEASONS.id) */
  season: string;
  /** 'any' | название жанра */
  genre: string;
  /** 'any' | id статуса (POPULAR_STATUS_OPTIONS) */
  status: string;
  /** Не показывать то, что уже в «Просмотрено» (нужен вход). */
  hideWatched: boolean;
}

export const DEFAULT_POPULAR_FILTERS: PopularFilters = {
  source: 'anixart',
  sort: 'popular',
  year: 'any',
  season: 'any',
  genre: 'any',
  status: 'any',
  hideWatched: false,
};

/** FilterSortType Anixart: 0 обновление, 1 оценка, 2 год, 3 популярность. */
const SORT_VALUE: Partial<Record<PopularSort, number>> = { popular: 3, grade: 1, year: 2, updated: 0 };

type SortOption = { value: PopularSort; label: string; desc: string };

const SORT_OPTIONS: Record<PopularSource, SortOption[]> = {
  anixart: [
    { value: 'popular', label: 'Популярные', desc: 'Рейтинг популярности Anixart' },
    { value: 'grade', label: 'С высокой оценкой', desc: 'Лучшие по оценке зрителей' },
    { value: 'year', label: 'Самые новые', desc: 'Сначала свежие по году выхода' },
    { value: 'updated', label: 'Недавно обновлённые', desc: 'Новые серии и изменения' },
  ],
  anixapp: [
    { value: 'popular', label: 'Популярные', desc: 'Больше всего в избранном' },
    { value: 'votes', label: 'Больше всего оценок', desc: 'Число поставленных оценок' },
    { value: 'grade', label: 'С высокой оценкой', desc: 'При равной — где больше оценок' },
    { value: 'episodes', label: 'Больше всего серий', desc: 'По числу вышедших серий' },
    { value: 'year', label: 'Самые новые', desc: 'Сначала свежие по году выхода' },
    { value: 'updated', label: 'Недавно обновлённые', desc: 'Новые серии и изменения' },
    { value: 'new', label: 'Новые в каталоге', desc: 'Недавно появились в каталоге' },
    { value: 'title', label: 'По названию', desc: 'От А до Я' },
  ],
};

export function popularSortOptions(source: PopularSource): SortOption[] {
  return SORT_OPTIONS[source];
}

/** Фильтры живут только в режиме AnixApp: при смене источника выбор сохраняется на потом. */
export function withSource(f: PopularFilters, source: PopularSource): PopularFilters {
  return { ...f, source };
}

/** Что реально уходит в запрос: у Anixart строки фильтров нет — его вкладки как есть. */
export function effectivePopularFilters(f: PopularFilters): PopularFilters {
  return f.source === 'anixart' ? { ...DEFAULT_POPULAR_FILTERS, source: 'anixart' } : f;
}

const SEASON_MONTHS: Record<number, string> = {
  1: 'январь – март',
  2: 'апрель – июнь',
  3: 'июль – сентябрь',
  4: 'октябрь – декабрь',
};

export const POPULAR_SEASON_OPTIONS: { value: string; label: string; desc?: string }[] = [
  { value: 'any', label: 'Любой сезон' },
  ...SEASONS.map((s) => ({ value: String(s.id), label: s.label, desc: SEASON_MONTHS[s.id] })),
];

const DECADES: { value: string; label: string; from?: number; to: number }[] = [
  { value: '2010s', label: '2010-е', from: 2010, to: 2019 },
  { value: '2000s', label: '2000-е', from: 2000, to: 2009 },
  { value: '1990s', label: '1990-е', from: 1990, to: 1999 },
  { value: 'old', label: 'До 1990', to: 1989 },
];

/** Последние годы по одному, дальше — десятилетия. */
export function popularYearOptions(now = new Date().getFullYear()): { value: string; label: string; desc?: string }[] {
  const years = Array.from({ length: now - 2019 }, (_, i) => now - i);
  return [
    { value: 'any', label: 'Любой год' },
    ...years.map((y) => ({
      value: String(y),
      label: String(y),
      desc: y === now ? 'Этот год' : y === now - 1 ? 'Прошлый год' : undefined,
    })),
    ...DECADES.map((d) => ({ value: d.value, label: d.label })),
  ];
}

export const POPULAR_GENRE_OPTIONS: { value: string; label: string }[] = [
  { value: 'any', label: 'Любой жанр' },
  ...[...ALL_GENRES]
    .sort((a, b) => a.localeCompare(b, 'ru'))
    .map((g) => ({ value: g, label: g.charAt(0).toUpperCase() + g.slice(1) })),
];

/** id как в каталоге anixback (GET /animedata/filters); 0 — «Не известно». */
export const POPULAR_STATUS_OPTIONS: { value: string; label: string }[] = [
  { value: 'any', label: 'Любой статус' },
  { value: '0', label: 'Не известно' },
  { value: '1', label: 'Вышел' },
  { value: '2', label: 'Выходит' },
  { value: '3', label: 'Анонс' },
];

function yearRange(year: string): { start_year?: number; end_year?: number } {
  if (year === 'any') return {};
  const decade = DECADES.find((d) => d.value === year);
  if (decade) return { start_year: decade.from, end_year: decade.to };
  const y = Number(year);
  return Number.isFinite(y) ? { start_year: y, end_year: y } : {};
}

/** Тело POST /filter/{page}: условия вкладки + фильтры поверх. */
export function popularFilterArgs(tab: PopularViewTab, f: PopularFilters): Record<string, unknown> {
  const body: Record<string, unknown> =
    tab === 'all' || isAnixappOnlyTab(tab) ? {} : { ...getPopularTabFilterArgs(tab) };
  body.sort = SORT_VALUE[f.sort] ?? 3;
  Object.assign(body, yearRange(f.year));
  if (f.season !== 'any') body.season = Number(f.season);
  if (f.genre !== 'any') body.genres = [f.genre];
  if (f.hideWatched) body.profile_list_exclusions = [3];
  return body;
}

/** Условия вкладки для каталога AnixApp (у него нет фильтра по числу серий). */
const BROWSE_TAB: Record<PopularViewTab, { statusId?: number; categoryId?: number }> = {
  all: {},
  ongoing: { statusId: 2 },
  finished: { statusId: 1 },
  movies: { categoryId: 2 },
  ova: { categoryId: 3 },
  series: { categoryId: 1 },
  specials: { categoryId: 6 },
};

/** Статус, который вкладка задаёт сама: 'any' в фильтрах, значение показывает чип. */
export function popularTabStatus(tab: PopularViewTab): string | undefined {
  const { statusId } = BROWSE_TAB[tab];
  return statusId == null ? undefined : String(statusId);
}

/** Параметры /releases/browse (без страницы). */
export function popularBrowseParams(tab: PopularViewTab, f: PopularFilters) {
  const years = yearRange(f.year);
  return {
    ...BROWSE_TAB[tab],
    ...(f.status === 'any' ? {} : { statusId: Number(f.status) }),
    sort: f.sort,
    yearFrom: years.start_year,
    yearTo: years.end_year,
    season: f.season === 'any' ? undefined : Number(f.season),
    genres: f.genre === 'any' ? undefined : [f.genre],
  };
}

/** Сброс фильтров не трогает выбранный источник. */
export function isDefaultPopularFilters(f: PopularFilters): boolean {
  return (Object.keys(DEFAULT_POPULAR_FILTERS) as (keyof PopularFilters)[]).every(
    (k) => k === 'source' || f[k] === DEFAULT_POPULAR_FILTERS[k],
  );
}

/** Сколько фильтров отличается от значений по умолчанию. */
export function countPopularFilters(f: PopularFilters): number {
  return (Object.keys(DEFAULT_POPULAR_FILTERS) as (keyof PopularFilters)[]).filter(
    (k) => k !== 'source' && f[k] !== DEFAULT_POPULAR_FILTERS[k],
  ).length;
}

/** Ключ для кеша списка: источник + вкладка + все фильтры. */
export function popularFiltersKey(f: PopularFilters): string {
  return [f.source, f.sort, f.year, f.season, f.genre, f.status, f.hideWatched ? 1 : 0].join('|');
}

/** «Осень 2025 · фэнтези» — подпись в шапке под заголовком. */
export function describePopularFilters(f: PopularFilters): string {
  const parts: string[] = [];
  const season = SEASONS.find((s) => String(s.id) === f.season)?.label;
  const year = f.year === 'any' ? '' : (DECADES.find((d) => d.value === f.year)?.label ?? f.year);
  if (season && year) parts.push(`${season} ${year}`);
  else if (season) parts.push(season);
  else if (year) parts.push(year);
  if (f.genre !== 'any') parts.push(f.genre);
  const status = POPULAR_STATUS_OPTIONS.find((o) => o.value === f.status && o.value !== 'any');
  if (status) parts.push(status.label);
  return parts.join(' · ');
}

const STORAGE_KEY = 'anixapp.popular.filters';

export function loadPopularFilters(): PopularFilters {
  try {
    const raw = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null') as Partial<PopularFilters> | null;
    if (!raw || typeof raw !== 'object') return { ...DEFAULT_POPULAR_FILTERS };
    const f = { ...DEFAULT_POPULAR_FILTERS, ...raw };
    if (!POPULAR_SOURCE_TABS.some((t) => t.id === f.source)) f.source = 'anixart';
    if (!SORT_OPTIONS.anixapp.some((o) => o.value === f.sort)) f.sort = 'popular';
    if (!popularYearOptions().some((o) => o.value === f.year)) f.year = 'any';
    if (!POPULAR_SEASON_OPTIONS.some((o) => o.value === f.season)) f.season = 'any';
    if (!POPULAR_GENRE_OPTIONS.some((o) => o.value === f.genre)) f.genre = 'any';
    if (!POPULAR_STATUS_OPTIONS.some((o) => o.value === f.status)) f.status = 'any';
    f.hideWatched = false;
    return f;
  } catch {
    return { ...DEFAULT_POPULAR_FILTERS };
  }
}

export function savePopularFilters(f: PopularFilters): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(f));
  } catch {
    /* приватный режим — фильтры живут до перезапуска */
  }
}
