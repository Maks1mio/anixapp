/**
 * Порядок разделов мобильной навигации и сторона панели планшета.
 * Порядок один на телефон и планшет: первые 3–5 разделов (сколько оставил пользователь) — главные, на телефоне они в нижней панели.
 */
import { get, writable } from 'svelte/store';
import { SIDEBAR_NAV_ITEMS, type SidebarNavId } from '../constants/sidebar-nav';
import { isCapacitorNative } from '../native/anix-api-native';

export type MobileNavTab = SidebarNavId | 'profile';
export type MobileRailSide = 'left' | 'right';

export const PHONE_BAR_MAX = 5;
export const PHONE_BAR_MIN = 3;

const ORDER_KEY = 'anix:mobileNavOrder';
const SIDE_KEY = 'anix:mobileRailSide';
const BAR_SIZE_KEY = 'anix:mobilePhoneBarSize';
const MAIN_TABS: MobileNavTab[] = ['home', 'overview', 'bookmarks', 'popular', 'profile'];

/** Разделы, скрытые в приложении для Android (ИИ-помощницы пока не готовы для телефона). */
const HIDDEN_NATIVE_TABS: MobileNavTab[] = ['agent'];

function defaultOrder(): MobileNavTab[] {
  const hidden = isCapacitorNative() ? HIDDEN_NATIVE_TABS : [];
  const rest = SIDEBAR_NAV_ITEMS.map((item) => item.id as MobileNavTab)
    .filter((id) => !MAIN_TABS.includes(id) && !hidden.includes(id));
  return [...MAIN_TABS, ...rest];
}

/** Сохранённый порядок без неизвестных разделов; появившиеся в новой версии идут в конец. */
function loadOrder(): MobileNavTab[] {
  const known = defaultOrder();
  try {
    const saved: unknown = JSON.parse(localStorage.getItem(ORDER_KEY) ?? 'null');
    if (!Array.isArray(saved)) return known;
    const kept = [...new Set(saved)].filter((id): id is MobileNavTab => known.includes(id as MobileNavTab));
    return [...kept, ...known.filter((id) => !kept.includes(id))];
  } catch {
    return known;
  }
}

function loadBarSize(): number {
  try {
    const saved = Number(localStorage.getItem(BAR_SIZE_KEY));
    return Number.isInteger(saved) && saved >= PHONE_BAR_MIN && saved <= PHONE_BAR_MAX ? saved : PHONE_BAR_MAX;
  } catch {
    return PHONE_BAR_MAX;
  }
}

function loadSide(): MobileRailSide {
  try {
    return localStorage.getItem(SIDE_KEY) === 'right' ? 'right' : 'left';
  } catch {
    return 'left';
  }
}

function save(key: string, value: string): void {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* без хранилища настройка живёт до перезапуска */
  }
}

export const mobileNavOrder = writable<MobileNavTab[]>(loadOrder());
export const mobileRailSide = writable<MobileRailSide>(loadSide());
export const mobilePhoneBarSize = writable<number>(loadBarSize());

/** Меняет два раздела местами; остальные остаются на своих. */
export function swapMobileNavTabs(id: string, targetId: string): void {
  const order = [...get(mobileNavOrder)];
  const from = order.indexOf(id as MobileNavTab);
  const to = order.indexOf(targetId as MobileNavTab);
  if (from < 0 || to < 0 || from === to) return;
  [order[from], order[to]] = [order[to], order[from]];
  mobileNavOrder.set(order);
  save(ORDER_KEY, JSON.stringify(order));
}

/** Переносит раздел через границу ряда: в ряду становится на один раздел больше или меньше. barIndex — место в ряду, по умолчанию конец. */
export function moveMobileNavTabAcross(id: string, toBar: boolean, barIndex?: number): void {
  const size = get(mobilePhoneBarSize);
  if (size === (toBar ? PHONE_BAR_MAX : PHONE_BAR_MIN)) return;
  const nextSize = size + (toBar ? 1 : -1);
  const order = get(mobileNavOrder).filter((tab) => tab !== id);
  order.splice(toBar ? (barIndex ?? size) : order.length, 0, id as MobileNavTab);
  mobileNavOrder.set(order);
  mobilePhoneBarSize.set(nextSize);
  save(ORDER_KEY, JSON.stringify(order));
  save(BAR_SIZE_KEY, String(nextSize));
}

export function setMobileRailSide(side: MobileRailSide): void {
  mobileRailSide.set(side);
  save(SIDE_KEY, side);
}
