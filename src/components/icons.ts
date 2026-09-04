/**
 * Иконки через lucide (https://lucide.dev).
 * Каждая функция возвращает готовую SVG-строку для innerHTML.
 */

import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpDown,
  AudioLines,
  Bell,
  Newspaper,
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
  GripVertical,
  Heart,
  Home,
  Image,
  Info,
  LayoutGrid,
  Lock,
  LogOut,
  MessageCircle,
  Mic,
  MoreHorizontal,
  MoreVertical,
  Palette,
  Pencil,
  Pause,
  Pin,
  Play,
  Plus,
  BookOpen,
  Radio,
  RefreshCw,
  Reply,
  Tags,
  Tv,
  RotateCcw,
  RotateCw,
  ScanSearch,
  Search,
  Settings,
  Share2,
  Shuffle,
  SlidersHorizontal,
  Sparkles,
  Star,
  Trash2,
  Clock,
  CircleCheck,
  TriangleAlert,
  User,
  UserPlus,
  Users,
  Vote,
  Volume2,
  Volume1,
  Volume,
  VolumeX,
  Maximize2,
  Minimize2,
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

/** Ответить (меню комментария) */
export function iconReply(size = 16): string {
  return toSvg(Reply, size);
}

/** Флажок / закладка (для избранного); filled — активна */
export function iconFlag(size = 18, filled = false): string {
  return toSvg(Bookmark, size, filled ? { fill: 'currentColor', stroke: 'none' } : {});
}

/** Три точки по горизонтали (меню) */
export function iconMoreHorizontal(size = 20): string {
  return toSvg(MoreHorizontal, size);
}

/** Три точки по вертикали (меню) */
export function iconMoreVertical(size = 20): string {
  return toSvg(MoreVertical, size);
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

/** Ручка перетаскивания */
export function iconGripVertical(size = 18): string {
  return toSvg(GripVertical, size);
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

/** Лента / статьи */
export function iconNewspaper(size = 18): string {
  return toSvg(Newspaper, size);
}

export function iconSignal(size = 18): string {
  return toSvg(Radio, size);
}

export function iconVote(size = 16): string {
  return toSvg(Vote, size);
}

/** Пользователь (профиль) */
export function iconUser(size = 20, filled = false): string {
  return toSvg(User, size, filled ? { fill: 'currentColor', stroke: 'none' } : {});
}

/** Люди / совместный просмотр (лобби) */
export function iconUsers(size = 20): string {
  return toSvg(Users, size);
}

/** Шестерёнка (настройки) */
export function iconSettings(size = 20): string {
  return toSvg(Settings, size);
}

/** Искры (Anime4K / апскейл) */
export function iconSparkles(size = 18): string {
  return toSvg(Sparkles, size);
}

/** Ползунки (фильтр / настройки вкладки) */
export function iconSlidersHorizontal(size = 18): string {
  return toSvg(SlidersHorizontal, size);
}

/** Карандаш (переименовать) */
export function iconPencil(size = 18): string {
  return toSvg(Pencil, size);
}

/** Канцелярская кнопка (закреплённая озвучка) */
export function iconPin(size = 16): string {
  return toSvg(Pin, size);
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

/** Изображение / обложка */
export function iconImage(size = 18): string {
  return toSvg(Image, size);
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

/** Перемотка вперёд */
export function iconRotateCw(size = 16): string {
  return toSvg(RotateCw, size);
}

/** Добавить человека (лобби) */
export function iconUserPlus(size = 20): string {
  return toSvg(UserPlus, size);
}

export function iconAudioLines(size = 18): string {
  return toSvg(AudioLines, size);
}

export function iconVolume2(size = 20): string {
  return toSvg(Volume2, size);
}

export function iconVolume1(size = 20): string {
  return toSvg(Volume1, size);
}

export function iconVolume(size = 20): string {
  return toSvg(Volume, size);
}

export function iconVolumeX(size = 20): string {
  return toSvg(VolumeX, size);
}

export function iconMaximize2(size = 20): string {
  return toSvg(Maximize2, size);
}

export function iconMinimize2(size = 20): string {
  return toSvg(Minimize2, size);
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

function filledPath(d: string, size: number, viewBox = '0 0 20 20'): string {
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="${viewBox}" fill="currentColor" aria-hidden="true"><path d="${d}"/></svg>`;
}

/** Совместный просмотр — создать комнату */
export function iconLobbyCreate(size = 20): string {
  return filledPath(
    'M9.38086 5.00586C11.5823 5.11751 13.333 6.93776 13.333 9.16699L13.3281 9.38086C13.27 10.5294 12.7452 11.5539 11.9414 12.2725C12.656 12.5996 13.3145 13.0528 13.8809 13.6191C15.1309 14.8694 15.833 16.566 15.833 18.334H7.73632L7.46582 18.3262C4.69607 18.1674 2.47145 15.5999 4.45214 13.6191C5.01837 13.0529 5.67614 12.5995 6.39062 12.2725C5.58737 11.5538 5.06401 10.5291 5.00586 9.38086L5 9.16699C5 6.86581 6.8658 5 9.16699 5L9.38086 5.00586ZM9.16699 13.3369C7.84179 13.3369 6.57084 13.8637 5.63378 14.8008C5.38227 15.0523 5.36762 15.2092 5.36621 15.2617C5.36431 15.3379 5.39032 15.4972 5.56347 15.7207C5.93515 16.2001 6.76128 16.6641 7.73632 16.6641H13.876C13.6298 15.9699 13.2308 15.3316 12.7002 14.8008C11.7633 13.8639 10.492 13.3371 9.16699 13.3369ZM9.16699 6.66992C7.78812 6.66992 6.66992 7.78812 6.66992 9.16699C6.67009 10.5457 7.78823 11.6631 9.16699 11.6631C10.5455 11.6627 11.6629 10.5455 11.6631 9.16699C11.6631 7.78834 10.5456 6.67027 9.16699 6.66992ZM15.416 0.832031C15.8772 0.832031 16.251 1.20583 16.251 1.66699V2.91504H17.5C17.9609 2.91521 18.3348 3.2891 18.335 3.75C18.3348 4.2109 17.9609 4.58478 17.5 4.58496H16.251V5.83398C16.2506 6.29484 15.877 6.66895 15.416 6.66895C14.9552 6.66874 14.5814 6.29471 14.5811 5.83398V4.58496H13.333C12.872 4.58493 12.4982 4.21099 12.498 3.75C12.4982 3.28901 12.872 2.91507 13.333 2.91504H14.5811V1.66699C14.5811 1.20596 14.955 0.83224 15.416 0.832031Z',
    size,
  );
}

/** Совместный просмотр — свернуть панель */
export function iconLobbyCollapse(size = 20): string {
  return filledPath(
    'M13.377 1.66699H16.335L16.5391 1.67773C17.5474 1.78031 18.335 2.63157 18.335 3.66699V16.334L18.3242 16.5381C18.2285 17.4792 17.4801 18.2276 16.5391 18.3232L16.335 18.334H13.3555C13.3484 18.3342 13.3411 18.335 13.334 18.335C13.3268 18.335 13.3196 18.3342 13.3125 18.334H3.66797L3.46387 18.3232C2.52253 18.2278 1.77446 17.4793 1.67871 16.5381L1.66797 16.334V3.66699C1.66797 2.56242 2.5634 1.66699 3.66797 1.66699H13.292C13.3059 1.6663 13.3199 1.66504 13.334 1.66504C13.3483 1.66504 13.3628 1.66628 13.377 1.66699ZM3.66797 3.33691C3.48571 3.33691 3.33789 3.48474 3.33789 3.66699V16.334C3.33824 16.5159 3.48593 16.6641 3.66797 16.6641H12.499V3.33691H3.66797ZM14.1689 16.6641H16.335C16.5167 16.6637 16.6647 16.5157 16.665 16.334V3.66699C16.665 3.48495 16.5169 3.33727 16.335 3.33691H14.1689V16.6641ZM8.53516 7.6416C8.86116 7.31581 9.38977 7.31587 9.71582 7.6416L11.4834 9.40918C11.8095 9.73527 11.8095 10.2647 11.4834 10.5908L9.71582 12.3584C9.38977 12.6841 8.86116 12.6842 8.53516 12.3584C8.20935 12.0324 8.20942 11.5038 8.53516 11.1777L8.87793 10.835L5.83398 10.8359C5.37298 10.8358 4.99902 10.461 4.99902 10C4.99902 9.53895 5.37298 9.16424 5.83398 9.16406H8.87695L8.53516 8.82227C8.20942 8.49622 8.20935 7.96761 8.53516 7.6416Z',
    size,
  );
}

/** Совместный просмотр — развернуть панель */
export function iconLobbyExpand(size = 20): string {
  return filledPath(
    'M13.377 1.66699H16.335L16.5391 1.67773C17.5474 1.78031 18.335 2.63157 18.335 3.66699V16.334L18.3242 16.5381C18.2285 17.4792 17.4801 18.2276 16.5391 18.3232L16.335 18.334H13.3555C13.3484 18.3342 13.3411 18.335 13.334 18.335C13.3268 18.335 13.3196 18.3342 13.3125 18.334H3.66797L3.46387 18.3232C2.52253 18.2278 1.77446 17.4793 1.67871 16.5381L1.66797 16.334V3.66699C1.66797 2.56242 2.5634 1.66699 3.66797 1.66699H13.292C13.3059 1.6663 13.3199 1.66504 13.334 1.66504C13.3483 1.66504 13.3628 1.66628 13.377 1.66699ZM3.66797 3.33691C3.48571 3.33691 3.33789 3.48474 3.33789 3.66699V16.334C3.33824 16.5159 3.48593 16.6641 3.66797 16.6641H12.499V3.33691H3.66797ZM14.1689 16.6641H16.335C16.5167 16.6637 16.6647 16.5157 16.665 16.334V3.66699C16.665 3.48495 16.5169 3.33727 16.335 3.33691H14.1689V16.6641ZM6.17871 7.6416C6.50479 7.31592 7.0334 7.31576 7.35938 7.6416C7.68516 7.96758 7.68504 8.49621 7.35938 8.82227L7.01758 9.16406H10.0605C10.5215 9.16432 10.8955 9.539 10.8955 10C10.8955 10.461 10.5215 10.8357 10.0605 10.8359L7.0166 10.835L7.35938 11.1777C7.68504 11.5038 7.68516 12.0324 7.35938 12.3584C7.0334 12.6842 6.50479 12.6841 6.17871 12.3584L4.41113 10.5908C4.08505 10.2647 4.08505 9.73527 4.41113 9.40918L6.17871 7.6416Z',
    size,
  );
}
