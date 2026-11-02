import { writable } from 'svelte/store';

/**
 * «Поддержать AnixApp» (Anix+): модалка с уровнями и одноразовое уведомление после входа.
 * Флаги живут в localStorage — промо показывается один раз на установку.
 */

const PROMO_SEEN_KEY = 'anixapp.supportPromo.seen.v1';
const MODAL_SEEN_KEY = 'anixapp.supportModal.seen.v1';

/** Telegram-бот, через который оформляется поддержка (тот же, что в anixback BADGE_BOT_USERNAME). */
export const SUPPORT_BOT_USERNAME = 'anixapp_bot';

function readFlag(key: string): boolean {
  try {
    return localStorage.getItem(key) === '1';
  } catch {
    return false;
  }
}

function writeFlag(key: string): void {
  try {
    localStorage.setItem(key, '1');
  } catch {
    /* private mode — покажем ещё раз, не страшно */
  }
}

export const supportModalOpen = writable(false);

/** true, пока модалку ни разу не открывали — подсвечиваем алмаз в боковой панели. */
export const supportModalUnseen = writable(!readFlag(MODAL_SEEN_KEY));

export function openSupportModal(): void {
  supportModalOpen.set(true);
  supportModalUnseen.set(false);
  writeFlag(MODAL_SEEN_KEY);
  // Модалку уже открыли — уведомление больше не нужно.
  writeFlag(PROMO_SEEN_KEY);
}

export function closeSupportModal(): void {
  supportModalOpen.set(false);
}

export function isSupportPromoSeen(): boolean {
  return readFlag(PROMO_SEEN_KEY);
}

export function markSupportPromoSeen(): void {
  writeFlag(PROMO_SEEN_KEY);
}

/** Anix+ tier badges (teer-1…3) open the support modal when clicked anywhere. */
export function isSupportBadge(slug: string): boolean {
  return /^teer-\d+$/.test(slug);
}

/** Click/keyboard handler for an Anix+ badge: open the modal, don't trigger the parent (profile link). */
export function onSupportBadgeActivate(e: MouseEvent | KeyboardEvent): void {
  if (e instanceof KeyboardEvent && e.key !== 'Enter' && e.key !== ' ') return;
  e.preventDefault();
  e.stopPropagation();
  openSupportModal();
}
