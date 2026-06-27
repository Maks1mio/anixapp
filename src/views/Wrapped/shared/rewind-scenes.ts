import type { WrappedScreenId } from '../components/WrappedScreenHost.svelte';

/** Палитра Rewind — снято с прототипа PrototypePNG. */
export const RW = {
  pink: '#ec5ba6',
  lime: '#a6fa76',
  blue: '#3a1fe0',
  olive: '#cdec83',
  red: '#f5524a',
  navy: '#322b4d',
  orange: '#f9a05f',
  purple: '#6b1fa8',
  black: '#171022',
  white: '#ffffff',
} as const;

export type RewindHeroShape = 'star' | 'flower' | 'arrow' | 'none';
export type DecorPos = 'tl' | 'tr' | 'bl' | 'br';

export interface RewindDecor {
  /** Индекс SVG в assets/Monogram (1..24) */
  shape: number;
  pos: DecorPos;
  /** Размер в vmin */
  size: number;
  color: string;
  rotate?: number;
}

export interface RewindScene {
  /** Сплошной фон сцены */
  bg: string;
  /** Цвет hero-фигуры (если есть) */
  hero: string;
  /** Форма hero-фигуры, удерживающей контент */
  shape: RewindHeroShape;
  /** Основной цвет текста контента (внутри hero либо на фоне) */
  ink: string;
  /** Приглушённый ink */
  inkSoft: string;
  /** Цвет логотипа в углу */
  logo: string;
  /** Угловой декор из Monogram */
  decor: RewindDecor[];
}

const NONE_DECOR: RewindDecor[] = [];

/**
 * Сцены Rewind в порядке прототипа. Каждый «выходной» цвет перетекает
 * в фон следующей сцены (carry color): pink→blue→olive→red→navy→orange→purple→black.
 */
export const REWIND_SCENES: Record<WrappedScreenId, RewindScene> = {
  welcome: {
    bg: RW.pink,
    hero: RW.lime,
    shape: 'star',
    ink: RW.blue,
    inkSoft: 'rgba(58,31,224,0.78)',
    logo: RW.blue,
    decor: [
      { shape: 16, pos: 'tl', size: 26, color: RW.blue, rotate: -8 },
      { shape: 12, pos: 'br', size: 24, color: RW.blue, rotate: 6 },
    ],
  },
  binge: {
    bg: RW.olive,
    hero: RW.blue,
    shape: 'star',
    ink: RW.olive,
    inkSoft: 'rgba(205,236,131,0.82)',
    logo: RW.blue,
    decor: NONE_DECOR,
  },
  time: {
    bg: RW.red,
    hero: RW.lime,
    shape: 'flower',
    ink: RW.red,
    inkSoft: 'rgba(245,82,74,0.82)',
    logo: RW.lime,
    decor: NONE_DECOR,
  },
  activity: {
    bg: RW.navy,
    hero: RW.navy,
    shape: 'none',
    ink: RW.red,
    inkSoft: RW.red,
    logo: RW.red,
    decor: [
      { shape: 19, pos: 'tr', size: 34, color: RW.red, rotate: 0 },
      { shape: 7, pos: 'bl', size: 30, color: RW.red, rotate: -14 },
    ],
  },
  'top-three': {
    bg: RW.orange,
    hero: RW.navy,
    shape: 'arrow',
    ink: RW.orange,
    inkSoft: 'rgba(249,160,95,0.82)',
    logo: RW.navy,
    decor: NONE_DECOR,
  },
  collections: {
    bg: RW.orange,
    hero: RW.navy,
    shape: 'none',
    ink: RW.navy,
    inkSoft: 'rgba(50,43,77,0.78)',
    logo: RW.navy,
    decor: [{ shape: 13, pos: 'br', size: 20, color: RW.navy, rotate: 0 }],
  },
  preferences: {
    bg: RW.purple,
    hero: RW.purple,
    shape: 'none',
    ink: RW.orange,
    inkSoft: 'rgba(249,160,95,0.8)',
    logo: RW.orange,
    decor: [
      { shape: 1, pos: 'tr', size: 18, color: RW.orange, rotate: 0 },
      { shape: 4, pos: 'bl', size: 20, color: RW.orange, rotate: 0 },
    ],
  },
  comments: {
    bg: RW.black,
    hero: RW.purple,
    shape: 'star',
    ink: RW.white,
    inkSoft: 'rgba(255,255,255,0.78)',
    logo: RW.white,
    decor: NONE_DECOR,
  },
  final: {
    bg: RW.black,
    hero: RW.black,
    shape: 'none',
    ink: RW.white,
    inkSoft: 'rgba(255,255,255,0.7)',
    logo: RW.white,
    decor: NONE_DECOR,
  },
  // Fallback-сцены (вне основного потока прототипа)
  genres: {
    bg: RW.purple, hero: RW.purple, shape: 'none', ink: RW.orange,
    inkSoft: 'rgba(249,160,95,0.8)', logo: RW.orange, decor: NONE_DECOR,
  },
  'top-rated': {
    bg: RW.orange, hero: RW.navy, shape: 'none', ink: RW.navy,
    inkSoft: 'rgba(50,43,77,0.78)', logo: RW.navy, decor: NONE_DECOR,
  },
  'year-stats': {
    bg: RW.navy, hero: RW.navy, shape: 'none', ink: RW.red,
    inkSoft: 'rgba(245,82,74,0.78)', logo: RW.red, decor: NONE_DECOR,
  },
  community: {
    bg: RW.purple, hero: RW.purple, shape: 'none', ink: RW.orange,
    inkSoft: 'rgba(249,160,95,0.8)', logo: RW.orange, decor: NONE_DECOR,
  },
  privacy: {
    bg: RW.black, hero: RW.purple, shape: 'star', ink: RW.white,
    inkSoft: 'rgba(255,255,255,0.78)', logo: RW.white, decor: NONE_DECOR,
  },
  empty: {
    bg: RW.pink, hero: RW.lime, shape: 'star', ink: RW.blue,
    inkSoft: 'rgba(58,31,224,0.78)', logo: RW.blue, decor: NONE_DECOR,
  },
};

export function sceneFor(id: WrappedScreenId): RewindScene {
  return REWIND_SCENES[id] ?? REWIND_SCENES.welcome;
}
