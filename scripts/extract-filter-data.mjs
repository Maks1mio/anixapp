import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const xmlPath = path.resolve(__dirname, '../../analysis/apk/decompiled/resources/res/values/arrays.xml');
const outPath = path.resolve(__dirname, '../src/data/filterOptions.ts');

const xml = fs.readFileSync(xmlPath, 'utf8');

function extract(name) {
  const re = new RegExp(`<array name="${name}">([\\s\\S]*?)</array>`);
  const m = xml.match(re);
  if (!m) return [];
  return [...m[1].matchAll(/<item>([^<]*)<\/item>/g)].map((x) => x[1].replace(/&amp;/g, '&'));
}

const genres = extract('genres');
const studios = extract('studios').slice(1); // skip "Неважно"
const countries = extract('countries').slice(1);
const categories = extract('categories').slice(1);
const statuses = extract('statuses').slice(1);
const seasons = extract('seasons').slice(1);
const episodes = extract('episodes').slice(1);
const episodeDurations = extract('episodeDurations').slice(1);
const sources = extract('sources').slice(1);
const sortLabels = extract('sort');
const ageRatings = extract('ageRatings');
const profileLists = extract('profile_lists');
const profileListValues = extract('profile_lists_values').map(Number);

// Android sort spinner index -> API sort value
const SORT_INDEX_TO_VALUE = [0, 4, 1, 5, 2, 6, 3, 7];
const SORT_OPTIONS = sortLabels.map((label, index) => ({
  index,
  value: SORT_INDEX_TO_VALUE[index] ?? index,
  label,
}));

const SORT_HINTS = [
  'Сначала недавно добавленное и обновлённое',
  'Сначала давно добавленное и обновлённое',
  'Сначала с высоким рейтингом',
  'Сначала с низким рейтингом',
  'Сначала новые по году выхода',
  'Сначала старые по году выхода',
  'Сначала самые популярные',
  'Сначала наименее популярные',
];

const genreSections = [];
let currentSection = null;
const flatGenres = [];
for (const g of genres) {
  if (g.startsWith('@')) {
    currentSection = g.slice(1);
    genreSections.push({ title: currentSection, genres: [] });
  } else if (currentSection) {
    genreSections[genreSections.length - 1].genres.push(g);
    flatGenres.push(g);
  } else {
    flatGenres.push(g);
  }
}

const content = `/** Auto-generated from Android arrays.xml — do not edit by hand. Run: node scripts/extract-filter-data.mjs */

export const FILTER_HINT = 'Выберите с помощью фильтров то, что хотите видеть на своей вкладке. Изменения будут доступны только на этом устройстве.';

export const GENRES_HINT = 'Будет искать релизы, содержащие каждый указанный жанр. Рекомендуется указывать не более 2–3 позиции.';
export const GENRES_EXCLUDE_HINT = 'Фильтр будет искать релизы, не содержащие ни один из указанных выше жанров';
export const BOOKMARKS_EXCLUDE_HINT = 'Исключит из выдачи все релизы, содержащиеся в вышеуказанных списках закладок.';

export const GENRE_SECTIONS = ${JSON.stringify(genreSections, null, 2)} as const;

export const ALL_GENRES: readonly string[] = ${JSON.stringify(flatGenres, null, 2)};

export const STUDIOS: readonly string[] = ${JSON.stringify(studios, null, 2)};

export const COUNTRIES: readonly string[] = ${JSON.stringify(countries, null, 2)};

export const CATEGORIES = ${JSON.stringify(categories.map((label, i) => ({ id: i + 1, label })), null, 2)} as const;

export const STATUSES = ${JSON.stringify(statuses.map((label, i) => ({ id: i + 1, label })), null, 2)} as const;

export const SEASONS = ${JSON.stringify(seasons.map((label, i) => ({ id: i + 1, label })), null, 2)} as const;

export const EPISODES_PRESETS = ${JSON.stringify(episodes.map((label, i) => ({ id: i + 1, label })), null, 2)} as const;

export const EPISODE_DURATIONS = ${JSON.stringify(episodeDurations.map((label, i) => ({ id: i + 1, label })), null, 2)} as const;

export const SOURCES: readonly string[] = ${JSON.stringify(sources, null, 2)};

export const AGE_RATINGS = ${JSON.stringify(ageRatings.map((label, i) => ({ id: i + 1, label })), null, 2)} as const;

export const PROFILE_LIST_EXCLUSIONS = ${JSON.stringify(profileLists.map((label, i) => ({ id: profileListValues[i] ?? i, label })), null, 2)} as const;

export const SORT_OPTIONS = ${JSON.stringify(SORT_OPTIONS.map((o, i) => ({ ...o, hint: SORT_HINTS[i] ?? '' })), null, 2)} as const;

export function sortValueToIndex(value: number): number {
  const idx = SORT_OPTIONS.findIndex((o) => o.value === value);
  return idx >= 0 ? idx : 0;
}
`;

const outDir = path.dirname(outPath);
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outPath, content, 'utf8');
console.log('Wrote', outPath);
