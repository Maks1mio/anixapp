/** Home feed tabs — order and filters match Android HomeFragment.java */

export type HomeTabId =
  | 'my'
  | 'anime'
  | 'donghua'
  | 'latest'
  | 'ongoing'
  | 'announced'
  | 'completed'
  | 'movies'
  | 'ova';

export const DEFAULT_HOME_TAB: HomeTabId = 'anime';

export const HOME_TAB_IDS: readonly HomeTabId[] = [
  'my',
  'anime',
  'donghua',
  'latest',
  'ongoing',
  'announced',
  'completed',
  'movies',
  'ova',
];

export interface HomeTabDef {
  id: HomeTabId;
  label: string;
  desc: string;
}

export const HOME_TAB_DEFS: readonly HomeTabDef[] = [
  { id: 'my', label: 'Моя вкладка', desc: 'Персонально настроенный раздел' },
  { id: 'anime', label: 'Аниме', desc: 'Японская анимация' },
  { id: 'donghua', label: 'Дунхуа', desc: 'Китайская анимация' },
  { id: 'latest', label: 'Последнее', desc: 'Недавно добавленные и обновлённые релизы' },
  { id: 'ongoing', label: 'Онгоинги', desc: 'Сериалы, которые выходят сейчас' },
  { id: 'announced', label: 'Анонсы', desc: 'Будущие релизы и новинки' },
  { id: 'completed', label: 'Завершенные', desc: 'Полностью вышедшие релизы' },
  { id: 'movies', label: 'Фильмы', desc: 'Полнометражные анимационные фильмы' },
  { id: 'ova', label: 'OVA', desc: 'Специальные и дополнительные эпизоды' },
];

export function isHomeTabId(value: string | null | undefined): value is HomeTabId {
  return !!value && (HOME_TAB_IDS as readonly string[]).includes(value);
}

export function resolveHomeTab(value: string | null | undefined): HomeTabId {
  return isHomeTabId(value) ? value : DEFAULT_HOME_TAB;
}

/** POST /filter/{page} body for preset home tabs (not «Моя вкладка»). */
export function getHomeTabFilterArgs(tab: HomeTabId): Record<string, unknown> {
  const base = { sort: 0 };
  switch (tab) {
    case 'anime':
      return { ...base, country: 'Япония' };
    case 'donghua':
      return { ...base, country: 'Китай' };
    case 'latest':
      return base;
    case 'ongoing':
      return { ...base, status_id: 2 };
    case 'announced':
      return { ...base, status_id: 3 };
    case 'completed':
      return { ...base, status_id: 1 };
    case 'movies':
      return { ...base, category_id: 2 };
    case 'ova':
      return { ...base, category_id: 3 };
    default:
      return base;
  }
}
