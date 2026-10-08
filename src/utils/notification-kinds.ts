/**
 * Каталог типов уведомлений Anixart + примеры для превью/теста.
 * Типы совпадают с notificationFilterId / parseNotification.
 */

export type NotificationKindId =
  | 'episode'
  | 'article'
  | 'friend'
  | 'comment'
  | 'release'
  | 'default';

/** Как вызывать уведомление устройства для типа. */
export type NotificationCallMode = 'both' | 'banner' | 'native' | 'off';

/** Внешний вид баннера (Figma Refold). */
export type NotificationBannerStyle = 'full' | 'compact' | 'minimal';

/** Миграция старого значения `rich` → `compact`. */
export function normalizeBannerStyle(style?: string | null): NotificationBannerStyle {
  if (style === 'full' || style === 'compact' || style === 'minimal') return style;
  if (style === 'rich') return 'compact';
  return 'compact';
}

export type NotificationKindMeta = {
  id: NotificationKindId;
  label: string;
  desc: string;
  /** Заголовок тоста/баннера. */
  sampleTitle: string;
  /** Текст превью. */
  sampleBody: string;
};

export const NOTIFICATION_KINDS: NotificationKindMeta[] = [
  {
    id: 'episode',
    label: 'Серии',
    desc: 'Выход новой серии на источнике',
    sampleTitle: 'Новая серия',
    sampleBody:
      'Вышла «11 серия» релиза «Необъятный океан 3» в варианте «JAM CLUB» на источнике «Kodik»',
  },
  {
    id: 'article',
    label: 'Записи',
    desc: 'Новая запись в канале или блоге',
    sampleTitle: 'Новая запись',
    sampleBody: '«Мастерская Мизори»: Аниме Б-800 против аниме утконоса',
  },
  {
    id: 'friend',
    label: 'Друзья',
    desc: 'Заявки в друзья и принятие',
    sampleTitle: 'Друзья',
    sampleBody: 'Пользователь «Pieyon» внёс вас в список своих друзей',
  },
  {
    id: 'comment',
    label: 'Комментарии',
    desc: 'Ответы и комментарии к вашему контенту',
    sampleTitle: 'Новый комментарий',
    sampleBody: 'Новый комментарий от «Зовите меня Густав»: Maks1mio, аххаахахха',
  },
  {
    id: 'release',
    label: 'Релизы',
    desc: 'Связанный релиз добавлен в приложение',
    sampleTitle: 'Новый релиз',
    sampleBody: 'В приложение была добавлена страница релиза «Необъятный океан 3»',
  },
];

export const CALL_MODE_OPTIONS: { value: NotificationCallMode; label: string; desc: string }[] = [
  { value: 'both', label: 'Баннер и Windows', desc: 'Свой баннер + системный тост' },
  { value: 'banner', label: 'Только баннер', desc: 'Карточка в углу экрана' },
  { value: 'native', label: 'Только Windows', desc: 'Центр уведомлений ОС' },
  { value: 'off', label: 'Выкл. на устройстве', desc: 'Только в колокольчике' },
];

export const BANNER_STYLE_OPTIONS: {
  value: NotificationBannerStyle;
  label: string;
  desc: string;
}[] = [
  { value: 'full', label: 'Полный', desc: 'Постер для серий/релизов, аватар для остальных' },
  { value: 'compact', label: 'Компактный', desc: 'Квадратное превью, тип и текст' },
  { value: 'minimal', label: 'Минимальный', desc: 'Без превью, тонированный фон' },
];

export function normalizeKind(kind?: string | null): NotificationKindId {
  switch (kind) {
    case 'episode':
      return 'episode';
    case 'article':
      return 'article';
    case 'friend':
    case 'friend-accept':
      return 'friend';
    case 'comment':
      return 'comment';
    case 'related':
    case 'release':
      return 'release';
    default:
      return 'default';
  }
}

export function defaultTypeChannels(): Record<NotificationKindId, NotificationCallMode> {
  return {
    episode: 'both',
    article: 'both',
    friend: 'both',
    comment: 'both',
    release: 'both',
    default: 'both',
  };
}
