import type { WrappedScreenId } from '../components/WrappedScreenHost.svelte';

export type WrappedTheme =
  | 'grape'
  | 'tangerine'
  | 'mint'
  | 'cobalt'
  | 'magenta'
  | 'cherry'
  | 'noir';

const SCREEN_THEME: Record<WrappedScreenId, WrappedTheme> = {
  welcome: 'grape',
  time: 'tangerine',
  binge: 'mint',
  activity: 'cobalt',
  'top-three': 'magenta',
  genres: 'cherry',
  preferences: 'grape',
  collections: 'mint',
  'top-rated': 'tangerine',
  'year-stats': 'cobalt',
  comments: 'cherry',
  community: 'magenta',
  final: 'noir',
  privacy: 'cobalt',
  empty: 'grape',
};

export function themeForScreen(id: WrappedScreenId): WrappedTheme {
  return SCREEN_THEME[id] ?? 'grape';
}

/** Цвета фоновых градиентов тем [верх, низ] — зеркалят SCSS, нужны для непрерывного фона. */
export const THEME_COLORS: Record<WrappedTheme, [string, string]> = {
  grape: ['#7c3aed', '#4c1d95'],
  tangerine: ['#ff8a3d', '#f43f5e'],
  mint: ['#14d0ad', '#0e9aa0'],
  cobalt: ['#4338ca', '#1e1b6e'],
  magenta: ['#ff3d8b', '#c41069'],
  cherry: ['#f43f5e', '#9f1239'],
  noir: ['#1c1c24', '#0a0a0f'],
};

export function colorsForScreen(id: WrappedScreenId): [string, string] {
  return THEME_COLORS[themeForScreen(id)];
}

/** Деко-композиция фигур (0..5) — разная раскладка monogram для каждого экрана. */
const SCREEN_SHAPE_VARIANT: Record<WrappedScreenId, number> = {
  welcome: 0,
  time: 1,
  binge: 2,
  activity: 3,
  'top-three': 4,
  genres: 5,
  preferences: 1,
  collections: 2,
  'top-rated': 0,
  'year-stats': 3,
  comments: 5,
  community: 1,
  final: 4,
  privacy: 5,
  empty: 0,
};

export function shapeVariantForScreen(id: WrappedScreenId): number {
  return SCREEN_SHAPE_VARIANT[id] ?? 0;
}
