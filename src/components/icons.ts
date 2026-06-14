/**
 * Иконки через lucide (https://lucide.dev).
 * Каждая функция возвращает готовую SVG-строку для innerHTML.
 */

import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  Bell,
  Bookmark,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Download,
  Eye,
  Film,
  Flag,
  Heart,
  Home,
  Info,
  LayoutGrid,
  LogOut,
  MessageCircle,
  MoreHorizontal,
  Pencil,
  Play,
  RotateCcw,
  Search,
  Settings,
  Shuffle,
  SlidersHorizontal,
  Star,
  Clock,
  CircleCheck,
  TriangleAlert,
  User,
  Users,
} from 'lucide';

type IconNode = [string, Record<string, string>];

function toSvg(icon: IconNode[], size: number, extraAttrs: Record<string, string> = {}): string {
  const base: Record<string, string> = {
    xmlns: 'http://www.w3.org/2000/svg',
    width: String(size),
    height: String(size),
    viewBox: '0 0 24 24',
    fill: 'none',
    stroke: 'currentColor',
    'stroke-width': '2',
    'stroke-linecap': 'round',
    'stroke-linejoin': 'round',
    'aria-hidden': 'true',
    ...extraAttrs,
  };

  const attrs = Object.entries(base)
    .map(([k, v]) => `${k}="${v}"`)
    .join(' ');

  const children = icon
    .map(([tag, a]) => {
      const aStr = Object.entries(a)
        .map(([k, v]) => `${k}="${v}"`)
        .join(' ');
      return `<${tag} ${aStr}/>`;
    })
    .join('');

  return `<svg ${attrs}>${children}</svg>`;
}

/** Галочка (выбрано) */
export function iconCheck(size = 18): string {
  return toSvg(Check, size);
}

/** Пятиконечная звезда (рейтинг); filled — заливка */
export function iconStar(size = 18, filled = true): string {
  return toSvg(Star, size, filled ? { fill: 'currentColor', stroke: 'none' } : {});
}

/** Сердечко (избранное); filled — в избранном */
export function iconHeart(size = 18, filled = false): string {
  return toSvg(Heart, size, filled ? { fill: 'currentColor', stroke: 'none' } : {});
}

/** Комментарий (счётчик на карточке коллекции) */
export function iconMessageCircle(size = 16): string {
  return toSvg(MessageCircle, size);
}

/** Флажок / закладка (для избранного); filled — активна */
export function iconFlag(size = 18, filled = false): string {
  return toSvg(Bookmark, size, filled ? { fill: 'currentColor', stroke: 'none' } : {});
}

/** Три точки по горизонтали (меню) */
export function iconMoreHorizontal(size = 20): string {
  return toSvg(MoreHorizontal, size);
}

/** Стрелка вниз (селект) */
export function iconChevronDown(size = 20): string {
  return toSvg(ChevronDown, size);
}

/** Стрелка вправо */
export function iconChevronLeft(size = 20): string {
  return toSvg(ChevronLeft, size);
}

export function iconChevronRight(size = 20): string {
  return toSvg(ChevronRight, size);
}

/** Шеврон вверх */
export function iconChevronUp(size = 20): string {
  return toSvg(ChevronUp, size);
}

/** Глаз (спойлер) */
export function iconEye(size = 18): string {
  return toSvg(Eye, size);
}

/** Буфер обмена / правила */
export function iconClipboardList(size = 18): string {
  return toSvg(ClipboardList, size);
}

/** Стрелка вверх (отправить) */
export function iconArrowUp(size = 20): string {
  return toSvg(ArrowUp, size);
}

/** Инфо (подсказка) */
export function iconInfo(size = 16): string {
  return toSvg(Info, size);
}

/** Воспроизведение */
export function iconPlay(size = 20): string {
  return toSvg(Play, size, { fill: 'currentColor', stroke: 'none' });
}

/** Плёнка */
export function iconFilm(size = 20): string {
  return toSvg(Film, size);
}

/** Дом (главная) */
export function iconHome(size = 20): string {
  return toSvg(Home, size);
}

/** Сетка/обзор */
export function iconLayoutGrid(size = 20): string {
  return toSvg(LayoutGrid, size);
}

/** Закладка */
export function iconBookmark(size = 20): string {
  return toSvg(Bookmark, size);
}

/** Колокол (уведомления) */
export function iconBell(size = 20): string {
  return toSvg(Bell, size);
}

/** Пользователь (профиль) */
export function iconUser(size = 20): string {
  return toSvg(User, size);
}

/** Люди / совместный просмотр (лобби) */
export function iconUsers(size = 20): string {
  return toSvg(Users, size);
}

/** Шестерёнка (настройки) */
export function iconSettings(size = 20): string {
  return toSvg(Settings, size);
}

/** Ползунки (фильтр / настройки вкладки) */
export function iconSlidersHorizontal(size = 18): string {
  return toSvg(SlidersHorizontal, size);
}

/** Карандаш (переименовать) */
export function iconPencil(size = 18): string {
  return toSvg(Pencil, size);
}

/** Выход */
export function iconLogOut(size = 20): string {
  return toSvg(LogOut, size);
}

/** Стрелка назад */
export function iconArrowLeft(size = 20): string {
  return toSvg(ArrowLeft, size);
}

/** Стрелка вперёд */
export function iconArrowRight(size = 20): string {
  return toSvg(ArrowRight, size);
}

/** Поиск (лупа) */
export function iconSearch(size = 20): string {
  return toSvg(Search, size);
}

/** Загрузка / обновление */
export function iconDownload(size = 20): string {
  return toSvg(Download, size);
}

/** Предупреждение (треугольник с восклицательным знаком) */
export function iconTriangleAlert(size = 16): string {
  return toSvg(TriangleAlert, size);
}

/** Перемешать / случайный выбор */
export function iconShuffle(size = 18): string {
  return toSvg(Shuffle, size);
}

/** Сортировка (стрелки вверх-вниз) */
export function iconArrowUpDown(size = 18): string {
  return toSvg(ArrowUpDown, size);
}

/** Сброс / очистить выбор */
export function iconRotateCcw(size = 16): string {
  return toSvg(RotateCcw, size);
}

/** Часы (время просмотра) */
export function iconClock(size = 14): string {
  return toSvg(Clock, size);
}

/** Галочка в круге (просмотренная серия) */
export function iconCircleCheck(size = 14): string {
  return toSvg(CircleCheck, size);
}
