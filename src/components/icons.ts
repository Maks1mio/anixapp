/**
 * Иконки в стиле Lucide (https://lucide.dev).
 * Inline SVG, viewBox 0 0 24 24, stroke 2, round caps.
 */

const iconClass = 'icon';
const vb = '0 0 24 24';
const stroke = 'currentColor';
const strokeWidth = '2';
const strokeLinecap = 'round';
const strokeLinejoin = 'round';
const attrs = `fill="none" stroke="${stroke}" stroke-width="${strokeWidth}" stroke-linecap="${strokeLinecap}" stroke-linejoin="${strokeLinejoin}"`;

function svg(name: string, size: number, content: string, extra = ''): string {
  return `<svg class="${iconClass} icon--${name}" width="${size}" height="${size}" viewBox="${vb}" ${attrs} ${extra} aria-hidden="true">${content}</svg>`;
}

/** Галочка (выбрано) */
export function iconCheck(size = 18): string {
  return svg('check', size, '<path d="M20 6 9 17l-5-5"/>');
}

/** Пятиконечная звезда (рейтинг); filled — заливка */
export function iconStar(size = 18, filled = true): string {
  // Классическая 5-конечная звезда (чёткая форма при любом размере)
  const path =
    'M12 2l3.09 6.26L22 9.27l-5 4.87 1.18 6.88L12 17.77l-6.18 3.25L7 14.14 2 9.27l6.91-1.01L12 2z';
  if (filled) {
    return `<svg class="${iconClass} icon--star" width="${size}" height="${size}" viewBox="0 0 24 24" fill="currentColor" stroke="none" aria-hidden="true"><path d="${path}"/></svg>`;
  }
  return svg('star', size, `<path d="${path}"/>`);
}

/** Сердечко (избранное); filled — в избранном */
export function iconHeart(size = 18, filled = false): string {
  const path =
    'M19 14c1.49-1.46 3-3.21 3-5.5A5.5 5.5 0 0 0 16.5 3c-1.76 0-3 .5-4.5 2-1.5-1.5-2.74-2-4.5-2A5.5 5.5 0 0 0 2 8.5c0 2.3 1.5 4.05 3 5.5l7 7Z';
  if (filled) {
    return `<svg class="${iconClass} icon--heart" width="${size}" height="${size}" viewBox="${vb}" fill="${stroke}" stroke="none" aria-hidden="true"><path d="${path}"/></svg>`;
  }
  return svg('heart', size, `<path d="${path}"/>`);
}

/** Флажок / закладка (для избранного) */
export function iconFlag(size = 18, filled = false): string {
  const path = 'M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z';
  if (filled) {
    return `<svg class="${iconClass} icon--flag" width="${size}" height="${size}" viewBox="${vb}" fill="${stroke}" stroke="none" aria-hidden="true"><path d="${path}"/></svg>`;
  }
  return svg('flag', size, `<path d="${path}"/>`);
}

/** Три точки по горизонтали (меню) */
export function iconMoreHorizontal(size = 20): string {
  return svg(
    'more-horizontal',
    size,
    '<circle cx="12" cy="12" r="1"/><circle cx="19" cy="12" r="1"/><circle cx="5" cy="12" r="1"/>',
  );
}

/** Стрелка вниз (селект) */
export function iconChevronDown(size = 20): string {
  return svg('chevron-down', size, '<path d="m6 9 6 6 6-6"/>');
}

/** Стрелка вправо */
export function iconChevronRight(size = 20): string {
  return svg('chevron-right', size, '<path d="m9 18 6-6-6-6"/>');
}

/** Инфо (подсказка) */
export function iconInfo(size = 16): string {
  return svg(
    'info',
    size,
    '<circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/>',
  );
}

/** Воспроизведение */
export function iconPlay(size = 20): string {
  return `<svg class="${iconClass} icon--play" width="${size}" height="${size}" viewBox="${vb}" fill="${stroke}" stroke="none" aria-hidden="true"><path d="M5 3l14 9-14 9V3z"/></svg>`;
}

/** Плёнка */
export function iconFilm(size = 20): string {
  return svg(
    'film',
    size,
    '<rect x="2" y="2" width="20" height="20" rx="2.18" ry="2.18"/><line x1="7" y1="2" x2="7" y2="22"/><line x1="17" y1="2" x2="17" y2="22"/><line x1="2" y1="12" x2="22" y2="12"/><line x1="2" y1="7" x2="7" y2="7"/><line x1="2" y1="17" x2="7" y2="17"/><line x1="17" y1="17" x2="22" y2="17"/><line x1="17" y1="7" x2="22" y2="7"/>',
  );
}

/** Дом (главная) */
export function iconHome(size = 20): string {
  return svg('home', size, '<path d="m3 9 9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/>');
}

/** Сетка/обзор */
export function iconLayoutGrid(size = 20): string {
  return svg('layout-grid', size, '<rect width="7" height="7" x="3" y="3" rx="1"/><rect width="7" height="7" x="14" y="3" rx="1"/><rect width="7" height="7" x="14" y="14" rx="1"/><rect width="7" height="7" x="3" y="14" rx="1"/>');
}

/** Закладка */
export function iconBookmark(size = 20): string {
  return svg('bookmark', size, '<path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/>');
}

/** Колокол (уведомления) */
export function iconBell(size = 20): string {
  return svg('bell', size, '<path d="M6 8a6 6 0 0 1 12 0c0 7 3 9 3 9H3s3-2 3-9"/><path d="M10.3 21a1.94 1.94 0 0 0 3.4 0"/>');
}

/** Пользователь (профиль) */
export function iconUser(size = 20): string {
  return svg('user', size, '<path d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/>');
}

/** Люди / совместный просмотр (лобби) */
export function iconUsers(size = 20): string {
  return svg('users', size, '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>');
}

/** Шестерёнка (настройки) */
export function iconSettings(size = 20): string {
  return svg('settings', size, '<path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"/><circle cx="12" cy="12" r="3"/>');
}

/** Выход */
export function iconLogOut(size = 20): string {
  return svg('log-out', size, '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/>');
}

/** Стрелка назад */
export function iconArrowLeft(size = 20): string {
  return svg('arrow-left', size, '<line x1="19" y1="12" x2="5" y2="12"/><polyline points="12 19 5 12 12 5"/>');
}

/** Стрелка вперёд */
export function iconArrowRight(size = 20): string {
  return svg('arrow-right', size, '<line x1="5" y1="12" x2="19" y2="12"/><polyline points="12 5 19 12 12 19"/>');
}

/** Поиск (лупа) */
export function iconSearch(size = 20): string {
  return svg('search', size, '<circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/>');
}

/** Загрузка / обновление (доступна новая версия) */
export function iconDownload(size = 20): string {
  return svg(
    'download',
    size,
    '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/>',
  );
}
