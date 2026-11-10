/** Поиск по фильтру (как FilterFragment в Anixart): последний фильтр хранится на устройстве. */
import { AGE_RATINGS, CATEGORIES, EPISODE_DURATIONS, EPISODES_PRESETS, SEASONS, STATUSES } from '../data/filterOptions';
import {
  DEFAULT_CUSTOM_FILTER,
  GENRES_MODE_ANY,
  GENRES_MODE_EXCLUDE,
  normalizeFilter,
  type CustomFilterStorage,
} from './homeCustomTab';

const STORAGE_KEY = 'anixapp.search.filter';

export function loadSearchFilter(): CustomFilterStorage {
  try {
    return normalizeFilter(JSON.parse(localStorage.getItem(STORAGE_KEY) ?? 'null')) ?? { ...DEFAULT_CUSTOM_FILTER };
  } catch {
    return { ...DEFAULT_CUSTOM_FILTER };
  }
}

export function saveSearchFilter(filter: CustomFilterStorage): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(filter));
  } catch { /* приватный режим: фильтр проживёт до перезагрузки в самом экране */ }
}

function labelOf(rows: readonly { id: number; label: string }[], id: number | null): string {
  return rows.find((row) => row.id === id)?.label ?? '';
}

/** Подпись выбранного: «Сериал · 2020 – 2024 · Кроме: драма». */
export function describeFilter(f: CustomFilterStorage): string {
  const years = f.selected_start_year != null && f.selected_end_year != null
    ? `${f.selected_start_year} – ${f.selected_end_year}`
    : f.selected_start_year != null
      ? `с ${f.selected_start_year}`
      : f.selected_end_year != null
        ? `до ${f.selected_end_year}`
        : '';
  const genres = f.selected_genres.join(', ');
  const genresText = !genres
    ? ''
    : f.selected_genres_mode === GENRES_MODE_EXCLUDE
      ? `Кроме: ${genres}`
      : f.selected_genres_mode === GENRES_MODE_ANY
        ? `Любой из: ${genres}`
        : genres;
  const ages = f.selected_age_ratings
    .map((id) => AGE_RATINGS.find((row) => String(row.id) === id)?.label ?? '')
    .join(', ');
  return [
    labelOf(CATEGORIES, f.selected_category_id),
    labelOf(STATUSES, f.selected_status_id),
    genresText,
    years,
    labelOf(SEASONS, f.selected_season),
    f.selected_country,
    f.selected_studio,
    f.selected_source,
    labelOf(EPISODES_PRESETS, f.selected_episodes),
    labelOf(EPISODE_DURATIONS, f.selected_episode_duration),
    ages,
  ].filter(Boolean).join(' · ');
}
