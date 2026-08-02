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
  Calendar,
  Check,
  ChevronDown,
  Compass,
  Flame,
  ChevronLeft,
  ChevronRight,
  ChevronUp,
  ClipboardList,
  Copy,
  Download,
  Ban,
  Eye,
  EyeOff,
  FileVideo,
  Folder,
  Film,
  Flag,
  Globe,
  Heart,
  Home,
  Info,
  LayoutGrid,
  Lock,
  LogOut,
  MessageCircle,
  Mic,
  MoreHorizontal,
  Palette,
  Pencil,
  Pause,
  Play,
  Plus,
  BookOpen,
  RefreshCw,
  Tags,
  Tv,
  RotateCcw,
  ScanSearch,
  Search,
  Settings,
  Share2,
  Shuffle,
  SlidersHorizontal,
  Star,
  Trash2,
  Clock,
  CircleCheck,
  TriangleAlert,
  User,
  Users,
  X,
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

export function iconEyeOff(size = 18): string {
  return toSvg(EyeOff, size);
}

export function iconBan(size = 18): string {
  return toSvg(Ban, size);
}

export function iconLoginHistory(size = 18): string {
  return toSvg(ScanSearch, size);
}

/** Буфер обмена / правила */
export function iconClipboardList(size = 18): string {
  return toSvg(ClipboardList, size);
}

/** Копировать */
export function iconCopy(size = 16): string {
  return toSvg(Copy, size);
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

/** Пауза */
export function iconPause(size = 20): string {
  return toSvg(Pause, size, { fill: 'currentColor', stroke: 'none' });
}

/** Плёнка */
export function iconFilm(size = 20): string {
  return toSvg(Film, size);
}

/** Глобус */
export function iconGlobe(size = 16): string {
  return toSvg(Globe, size);
}

/** Телевизор */
export function iconTv(size = 16): string {
  return toSvg(Tv, size);
}

/** Палитра */
export function iconPalette(size = 16): string {
  return toSvg(Palette, size);
}

/** Книга */
export function iconBookOpen(size = 16): string {
  return toSvg(BookOpen, size);
}

/** Теги */
export function iconTags(size = 16): string {
  return toSvg(Tags, size);
}

/** Дом (главная) */
export function iconHome(size = 20): string {
  return toSvg(Home, size);
}

/** Сетка/обзор */
export function iconLayoutGrid(size = 20): string {
  return toSvg(LayoutGrid, size);
}

/** Компас (вкладка «Обзор») */
export function iconCompass(size = 20): string {
  return toSvg(Compass, size);
}

/** Популярное */
export function iconFlame(size = 18): string {
  return toSvg(Flame, size);
}

/** Расписание */
export function iconCalendar(size = 18): string {
  return toSvg(Calendar, size);
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

export function iconShare(size = 18): string {
  return toSvg(Share2, size);
}

/** Замок (приватная коллекция) */
export function iconLock(size = 18): string {
  return toSvg(Lock, size);
}

/** Корзина (удалить) */
export function iconTrash2(size = 18): string {
  return toSvg(Trash2, size);
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

/** Папка */
export function iconFolder(size = 18): string {
  return toSvg(Folder, size);
}

/** Видеофайл */
export function iconFileVideo(size = 18): string {
  return toSvg(FileVideo, size);
}

/** Предупреждение (треугольник с восклицательным знаком) */
export function iconTriangleAlert(size = 16): string {
  return toSvg(TriangleAlert, size);
}

/** Закрыть */
export function iconX(size = 18): string {
  return toSvg(X, size);
}

/** Плюс */
export function iconPlus(size = 18): string {
  return toSvg(Plus, size);
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

/** Микрофон (озвучка без иконки) */
export function iconMic(size = 18): string {
  return toSvg(Mic, size);
}

/** Обновить (по часовой стрелке) */
export function iconRefreshCw(size = 18): string {
  return toSvg(RefreshCw, size);
}
