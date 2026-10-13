import * as Icons from '../components/icons';

export type SidebarNavId =
  | 'home'
  | 'overview'
  | 'fluo'
  | 'feed'
  | 'popular'
  | 'collections'
  | 'bookmarks'
  | 'downloads';

export type SidebarNavPlacement = 'left' | 'right' | 'hidden';

export interface SidebarNavItemDef {
  id: SidebarNavId;
  href: string;
  label: string;
  icon: string;
  /** Показать бейдж beta у пункта (например Лента). */
  beta?: boolean;
}

export interface SidebarNavFolderDef {
  id: string;
  name: string;
  icon: SidebarNavFolderIconId;
  children: SidebarNavId[];
}

/** Элемент панели: вкладка или папка с вложенными вкладками. */
export type SidebarNavEntry =
  | { kind: 'item'; id: SidebarNavId }
  | { kind: 'folder'; folder: SidebarNavFolderDef };

type IconFn = (size?: number) => string;

/** Подписи только для title/aria — в сетке не показываются. */
const FOLDER_ICON_LABELS: Record<string, string> = {
  folder: 'Папка',
  bookmark: 'Закладка',
  star: 'Звезда',
  heart: 'Сердце',
  'layout-grid': 'Сетка',
  'layout-list': 'Плитка-список',
  list: 'Список',
  'list-ordered': 'Нумерованный список',
  flame: 'Огонь',
  popular: 'Популярное',
  compass: 'Компас',
  home: 'Дом',
  newspaper: 'Лента',
  signal: 'Эфир',
  download: 'Загрузки',
  calendar: 'Календарь',
  bell: 'Уведомления',
  search: 'Поиск',
  user: 'Профиль',
  users: 'Люди',
  'user-plus': 'Добавить друга',
  settings: 'Настройки',
  sparkles: 'Искры',
  'sliders-horizontal': 'Слайдеры',
  pencil: 'Карандаш',
  pin: 'Пин',
  share: 'Поделиться',
  repost: 'Репост',
  'thumbs-up': 'Лайк',
  'thumbs-down': 'Дизлайк',
  vote: 'Голос',
  lock: 'Замок',
  film: 'Фильм',
  globe: 'Глобус',
  tv: 'ТВ',
  palette: 'Палитра',
  'book-open': 'Книга',
  tags: 'Теги',
  image: 'Картинка',
  'file-video': 'Видеофайл',
  play: 'Play',
  pause: 'Пауза',
  clock: 'Часы',
  check: 'Галочка',
  'circle-check': 'Готово',
  flag: 'Флаг',
  eye: 'Глаз',
  'eye-off': 'Скрыто',
  'message-circle': 'Сообщение',
  reply: 'Ответ',
  copy: 'Копировать',
  'clipboard-list': 'Буфер',
  info: 'Инфо',
  'triangle-alert': 'Внимание',
  link: 'Ссылка',
  paperclip: 'Скрепка',
  quote: 'Цитата',
  mic: 'Микрофон',
  'audio-lines': 'Аудио',
  shuffle: 'Перемешать',
  'refresh-cw': 'Обновить',
  'rotate-ccw': 'Назад',
  'rotate-cw': 'Вперёд',
  plus: 'Плюс',
  minus: 'Минус',
  ban: 'Запрет',
  'login-history': 'История',
  'arrow-up-down': 'Сортировка',
  'more-horizontal': 'Ещё',
  'more-vertical': 'Меню',
  'chevron-down': 'Вниз',
  'chevron-left': 'Влево',
  'chevron-right': 'Вправо',
  'chevron-up': 'Вверх',
  'message-square-x': 'Без сообщений',
  'arrow-up': 'Вверх',
  'arrow-down': 'Вниз',
  'arrow-left': 'Назад',
  'arrow-right': 'Вперёд',
  'grip-vertical': 'Перетащить',
  trash2: 'Удалить',
  'log-out': 'Выход',
  volume2: 'Громкость',
  volume1: 'Тише',
  volume: 'Звук',
  'volume-x': 'Без звука',
  maximize2: 'Развернуть',
  minimize2: 'Свернуть',
  'picture-in-picture': 'Картинка в картинке',
  type: 'Текст',
  bold: 'Жирный',
  italic: 'Курсив',
  heading: 'Заголовок',
  'lobby-create': 'Комната',
  'lobby-collapse': 'Свернуть панель',
  'lobby-expand': 'Развернуть панель',
};

function kebabFromIconExport(name: string): string {
  // iconLayoutGrid → layout-grid; iconTrash2 → trash2
  return name
    .replace(/^icon/, '')
    .replace(/([a-z0-9])([A-Z])/g, '$1-$2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1-$2')
    .toLowerCase();
}

function wrapIcon(fn: IconFn): IconFn {
  return (size = 18) => {
    try {
      return fn(size);
    } catch {
      return Icons.iconFolder(size);
    }
  };
}

/** Все экспорты icon* из библиотеки icons.ts. */
function buildFolderIconOptions(): readonly {
  id: string;
  label: string;
  icon: IconFn;
}[] {
  const out: { id: string; label: string; icon: IconFn }[] = [];
  const seen = new Set<string>();

  // Предпочтительный порядок для частых иконок
  const preferred = [
    'folder',
    'bookmark',
    'star',
    'heart',
    'layout-grid',
    'layout-list',
    'list',
    'list-ordered',
    'flame',
    'popular',
    'compass',
    'home',
    'newspaper',
    'signal',
    'download',
  ];

  const entries: { id: string; icon: IconFn }[] = [];

  for (const [key, value] of Object.entries(Icons)) {
    if (!key.startsWith('icon') || typeof value !== 'function') continue;
    const id = kebabFromIconExport(key);
    if (seen.has(id)) continue;
    seen.add(id);
    let icon: IconFn;
    if (key === 'iconStar') {
      icon = (size = 18) => Icons.iconStar(size, false);
    } else if (key === 'iconHeart') {
      icon = (size = 18) => Icons.iconHeart(size, false);
    } else if (key === 'iconFlag') {
      icon = (size = 18) => Icons.iconFlag(size, false);
    } else if (key === 'iconUser') {
      icon = (size = 18) => Icons.iconUser(size, false);
    } else {
      icon = wrapIcon(value as IconFn);
    }
    entries.push({ id, icon });
  }

  const byId = new Map(entries.map((e) => [e.id, e]));
  for (const id of preferred) {
    const e = byId.get(id);
    if (!e) continue;
    out.push({
      id: e.id,
      label: FOLDER_ICON_LABELS[e.id] ?? e.id,
      icon: e.icon,
    });
    byId.delete(id);
  }
  for (const e of [...byId.values()].sort((a, b) => a.id.localeCompare(b.id))) {
    out.push({
      id: e.id,
      label: FOLDER_ICON_LABELS[e.id] ?? e.id,
      icon: e.icon,
    });
  }

  // Совместимость со старыми id в prefs
  const aliases: { id: string; from: string; label: string }[] = [
    { id: 'grid', from: 'layout-grid', label: 'Сетка' },
    { id: 'book', from: 'book-open', label: 'Книга' },
    { id: 'message', from: 'message-circle', label: 'Сообщение' },
    { id: 'clipboard', from: 'clipboard-list', label: 'Буфер' },
    { id: 'alert', from: 'triangle-alert', label: 'Внимание' },
    { id: 'audio', from: 'audio-lines', label: 'Аудио' },
    { id: 'refresh', from: 'refresh-cw', label: 'Обновить' },
    { id: 'history', from: 'login-history', label: 'История' },
    { id: 'sort', from: 'arrow-up-down', label: 'Сортировка' },
    { id: 'sliders', from: 'sliders-horizontal', label: 'Слайдеры' },
  ];
  for (const a of aliases) {
    if (out.some((o) => o.id === a.id)) continue;
    const src = out.find((o) => o.id === a.from);
    if (!src) continue;
    out.push({ id: a.id, label: a.label, icon: src.icon });
  }

  return out;
}

export const SIDEBAR_NAV_ITEMS: readonly SidebarNavItemDef[] = [
  { id: 'home', href: '/', label: 'Главная', icon: Icons.iconHome(18) },
  { id: 'overview', href: '/overview', label: 'Обзор', icon: Icons.iconCompass(18) },
  { id: 'fluo', href: '/fluo', label: 'Fluo', icon: Icons.iconSignal(18) },
  { id: 'feed', href: '/feed', label: 'Лента', icon: Icons.iconNewspaper(18), beta: true },
  { id: 'popular', href: '/overview/popular', label: 'Популярное', icon: Icons.iconFlame(18) },
  { id: 'collections', href: '/collections', label: 'Коллекции', icon: Icons.iconLayoutGrid(18) },
  { id: 'bookmarks', href: '/bookmarks', label: 'Закладки', icon: Icons.iconBookmark(18) },
  { id: 'downloads', href: '/downloads', label: 'Загрузки', icon: Icons.iconDownload(18) },
];

export const SIDEBAR_NAV_IDS: readonly SidebarNavId[] = SIDEBAR_NAV_ITEMS.map((item) => item.id);

export const SIDEBAR_NAV_FOLDER_ICON_OPTIONS = buildFolderIconOptions();

export type SidebarNavFolderIconId = string;

export function sidebarNavFolderIconSvg(
  iconId: SidebarNavFolderIconId,
  size = 18,
): string {
  const opt = SIDEBAR_NAV_FOLDER_ICON_OPTIONS.find((o) => o.id === iconId);
  return (opt?.icon ?? Icons.iconFolder)(size);
}

export function createSidebarNavFolder(
  partial?: Partial<Pick<SidebarNavFolderDef, 'name' | 'icon' | 'children'>>,
): SidebarNavFolderDef {
  const id = `folder_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 9)}`;
  return {
    id,
    name: partial?.name?.trim() || 'Папка',
    icon: partial?.icon ?? 'folder',
    children: [...(partial?.children ?? [])],
  };
}

export function sidebarNavIdFromHref(href: string): SidebarNavId | null {
  const normalized = href.split('?')[0] || href;
  const match = SIDEBAR_NAV_ITEMS.find((item) => item.href === normalized);
  return match?.id ?? null;
}

export function collectPlacedNavIds(entries: readonly SidebarNavEntry[]): SidebarNavId[] {
  const out: SidebarNavId[] = [];
  const seen = new Set<SidebarNavId>();
  for (const entry of entries) {
    if (entry.kind === 'item') {
      if (seen.has(entry.id)) continue;
      seen.add(entry.id);
      out.push(entry.id);
      continue;
    }
    for (const id of entry.folder.children) {
      if (seen.has(id)) continue;
      seen.add(id);
      out.push(id);
    }
  }
  return out;
}

/** Источник миниатюр в сайдбаре (или скрыть через placement). */
export type SidebarPinsSource =
  | 'none'
  | 'watching'
  | 'planned'
  | 'completed'
  | 'on_hold'
  | 'dropped'
  | 'collections'
  | 'history'
  | 'votes'
  | 'favorites';

/** Где показывать миниатюры. */
export type SidebarPinsPlacement = 'left' | 'right' | 'none';

export interface SidebarPinsSourceOption {
  id: SidebarPinsSource;
  label: string;
  /** Короткий hint для превью/aria */
  hint: string;
}

export interface SidebarPinsPlacementOption {
  id: SidebarPinsPlacement;
  label: string;
  hint: string;
}

export const SIDEBAR_PINS_PLACEMENT_OPTIONS: readonly SidebarPinsPlacementOption[] = [
  { id: 'left', label: 'Слева', hint: 'Миниатюры в левой панели' },
  { id: 'none', label: 'Не показывать', hint: 'Миниатюры скрыты' },
  { id: 'right', label: 'Справа', hint: 'Миниатюры в правой панели' },
];

export const SIDEBAR_PINS_SOURCE_OPTIONS: readonly SidebarPinsSourceOption[] = [
  { id: 'none', label: 'Не показывать', hint: 'Миниатюры скрыты' },
  { id: 'watching', label: 'Смотрю', hint: 'Список «Смотрю»' },
  { id: 'planned', label: 'В планах', hint: 'Список «В планах»' },
  { id: 'completed', label: 'Просмотрено', hint: 'Список «Просмотрено»' },
  { id: 'on_hold', label: 'Отложено', hint: 'Список «Отложено»' },
  { id: 'dropped', label: 'Брошено', hint: 'Список «Брошено»' },
  { id: 'collections', label: 'Коллекции', hint: 'Избранные коллекции' },
  { id: 'history', label: 'История', hint: 'Недавние просмотры' },
  { id: 'votes', label: 'Оценки', hint: 'Оценённые релизы' },
  { id: 'favorites', label: 'Избранное', hint: 'Избранные релизы' },
];

/** Источники контента миниатюр (без «Не показывать» — это placement). */
export const SIDEBAR_PINS_CONTENT_OPTIONS: readonly SidebarPinsSourceOption[] =
  SIDEBAR_PINS_SOURCE_OPTIONS.filter((o) => o.id !== 'none');

export function sidebarPinsSourceLabel(source: SidebarPinsSource): string {
  return SIDEBAR_PINS_SOURCE_OPTIONS.find((o) => o.id === source)?.label ?? 'Избранное';
}

export function sidebarPinsPlacementLabel(placement: SidebarPinsPlacement): string {
  return SIDEBAR_PINS_PLACEMENT_OPTIONS.find((o) => o.id === placement)?.label ?? 'Слева';
}

/** Тип списка Anixart profile.getBookmarks */
export const SIDEBAR_PINS_LIST_TYPE: Partial<Record<SidebarPinsSource, number>> = {
  watching: 1,
  planned: 2,
  completed: 3,
  on_hold: 4,
  dropped: 5,
};
