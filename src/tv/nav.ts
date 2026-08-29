import {
  iconBookmark,
  iconCompass,
  iconFlame,
  iconHome,
  iconNewspaper,
  iconUser,
} from '../components/icons';

/** 10-foot UI: крупнее и с более толстым штрихом, чем в десктопе. */
const TV_ICON_SIZE = 30;
const TV_ICON_STROKE = 2.35;

function tvNavIcon(svg: string): string {
  return svg
    .replace(/width="\d+"/, `width="${TV_ICON_SIZE}"`)
    .replace(/height="\d+"/, `height="${TV_ICON_SIZE}"`)
    .replace(/stroke-width="2"/g, `stroke-width="${TV_ICON_STROKE}"`);
}

export type TvNavItem =
  | { id: string; href: string; label: string; icon: string }
  | { id: string; action: 'settings' | 'profile'; label: string; icon: string };

export const TV_NAV_ITEMS: TvNavItem[] = [
  { id: 'home', href: '/', label: 'Главная', icon: tvNavIcon(iconHome(TV_ICON_SIZE)) },
  { id: 'overview', href: '/overview', label: 'Обзор', icon: tvNavIcon(iconCompass(TV_ICON_SIZE)) },
  { id: 'feed', href: '/feed', label: 'Лента', icon: tvNavIcon(iconNewspaper(TV_ICON_SIZE)) },
  { id: 'popular', href: '/overview/popular', label: 'Популярное', icon: tvNavIcon(iconFlame(TV_ICON_SIZE)) },
  { id: 'bookmarks', href: '/bookmarks', label: 'Закладки', icon: tvNavIcon(iconBookmark(TV_ICON_SIZE)) },
  {
    id: 'search',
    href: '/search',
    label: 'Поиск',
    icon: tvNavIcon(
      `<svg width="${TV_ICON_SIZE}" height="${TV_ICON_SIZE}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${TV_ICON_STROKE}" stroke-linecap="round"><circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/></svg>`,
    ),
  },
  {
    id: 'settings',
    action: 'settings',
    label: 'Настройки',
    icon: tvNavIcon(
      `<svg width="${TV_ICON_SIZE}" height="${TV_ICON_SIZE}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="${TV_ICON_STROKE}" stroke-linecap="round"><circle cx="12" cy="12" r="3"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>`,
    ),
  },
];

export const TV_PROFILE_NAV_ITEM: TvNavItem = {
  id: 'profile',
  action: 'profile',
  label: 'Профиль',
  icon: tvNavIcon(iconUser(TV_ICON_SIZE)),
};

/** Main TV shell routes — each has a matching `*.tv.svelte` view. */
export const TV_SHELL_PATHS = new Set([
  '/',
  '/overview',
  '/feed',
  '/overview/popular',
  '/bookmarks',
  '/search',
]);

export function isTvShellPath(path: string): boolean {
  return TV_SHELL_PATHS.has(path.split('?')[0] || '/');
}

export function tvNavHref(item: TvNavItem): string | null {
  return 'href' in item ? item.href : null;
}
