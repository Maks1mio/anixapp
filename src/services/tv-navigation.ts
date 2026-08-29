import { isTvMode } from '../platform/tv';
import { isTvReleasePath, tvKeepAliveKey } from '../tv/keepAlive';
import { getPath } from '../router';
import { scrollTvCarouselItemIntoView } from '../tv/carouselScroll';
import { cancelTvReleaseOpen } from './tv-release-transition';

const FOCUS_ATTR = 'data-tv-focus';
const RAIL_SEL = '.tv-layout__rail';
const MAIN_SEL = '.tv-layout__main';
const TV_HOME_ROW_SEL = '[data-tv-home-row]';
const TV_HOME_RAILS_SEL = '[data-tv-home-rails]';
const TV_ROW_SCROLL_SEL = '.uiv2-carousel__scroll';

const FOCUSABLE = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled]):not([type=hidden]):not([data-tv-ime-lock])',
  'select:not([disabled])',
  'textarea:not([disabled]):not([data-tv-ime-lock])',
  '[tabindex]:not([tabindex="-1"])',
].join(',');

const FOCUS_SKIP = [
  '.zh__poster',
  '.title-info-trigger',
  '.release-page__screenshot-btn',
  '.watch-modal__episode-actions',
  '.watch-modal__episode-actions *',
  '.watch-modal__episode-mini',
  '.watch-modal__backdrop',
  '.watch-page__tap-layer',
  '.watch-page__vol-slider',
].join(',');

const OVERLAY_ROOT = [
  '[role=dialog]',
  '.watch-panel',
  '.custom-select__menu',
  '.search-dropdown',
].join(',');

const FOCUS_PRIORITY = [
  '.watch-panel__ep-row--active',
  '.watch-modal__episode-card',
  '.watch-modal__variant-row',
  '.watch-page__ctrl-btn',
  '.watch-page__gui-overlay button',
  'button.zh__play',
  '.tv-release-page__play',
  '.release-card-h__link',
  '.release-card-v__link',
  '.uiv2-anime-card[role="button"]',
  '.tv-category-see-all[role="button"]',
];

const ARROW_KEYS: Record<string, 'up' | 'down' | 'left' | 'right'> = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right',
};

const CLOSE_SELECTORS = [
  '.watch-modal__close',
  '.watch-panel__icon-btn[aria-label="Закрыть"]',
  '[role=dialog] [aria-label="Закрыть"]',
  '.settings-close-btn',
].join(',');

let stickyFocus: HTMLElement | null = null;
let lastContentFocus: HTMLElement | null = null;
let railEngaged = false;

/** Фокус на keep-alive слоях — восстанавливается при возврате без перезагрузки. */
const parkedFocusByLayer = new Map<string, HTMLElement>();

/** Индекс фокуса внутри каждого ряда главной (по умолчанию 0). */
const tvHomeRowFocusIndex = new Map<string, number>();

const TV_HOME_CARD_SEL = '.uiv2-anime-card[role="button"], .tv-category-see-all[role="button"]';

function tvHomeRow(el: Element | null | undefined): HTMLElement | null {
  const row = el?.closest(TV_HOME_ROW_SEL);
  return row instanceof HTMLElement ? row : null;
}

function tvHomeRows(): HTMLElement[] {
  const rails = document.querySelector(TV_HOME_RAILS_SEL);
  if (!rails) return [];
  return Array.from(rails.querySelectorAll<HTMLElement>(TV_HOME_ROW_SEL));
}

function tvHomeRowKey(row: HTMLElement): string {
  return row.dataset.tvHomeRowId || row.getAttribute('aria-label') || '';
}

function tvHomeRowCards(row: HTMLElement): HTMLElement[] {
  return collectFocusables(row).filter((el) => el.matches(TV_HOME_CARD_SEL));
}

function saveTvHomeRowFocus(row: HTMLElement, active: HTMLElement): void {
  const key = tvHomeRowKey(row);
  if (!key) return;
  const list = tvHomeRowCards(row);
  const idx = list.indexOf(active);
  if (idx >= 0) tvHomeRowFocusIndex.set(key, idx);
}

function focusTvHomeRowAtSaved(row: HTMLElement): boolean {
  const list = tvHomeRowCards(row);
  if (!list.length) return false;
  const key = tvHomeRowKey(row);
  const idx = Math.min(Math.max(0, tvHomeRowFocusIndex.get(key) ?? 0), list.length - 1);
  focusElement(list[idx]);
  return true;
}

function moveTvHomeRowVertical(active: HTMLElement, dir: 'up' | 'down'): boolean {
  if (!active.closest(TV_HOME_RAILS_SEL)) return false;

  const rows = tvHomeRows();
  if (!rows.length) return false;

  const currentRow = tvHomeRow(active);
  if (currentRow) saveTvHomeRowFocus(currentRow, active);

  if (!currentRow) {
    if (dir === 'down') return focusTvHomeRowAtSaved(rows[0]);
    return false;
  }

  const rowIdx = rows.indexOf(currentRow);
  if (rowIdx < 0) return false;

  const nextIdx = dir === 'down' ? rowIdx + 1 : rowIdx - 1;
  if (nextIdx < 0 || nextIdx >= rows.length) return false;

  return focusTvHomeRowAtSaved(rows[nextIdx]);
}

function isTvHomeCarouselCard(el: HTMLElement): boolean {
  return el.matches(TV_HOME_CARD_SEL) && !!el.closest(TV_HOME_RAILS_SEL);
}

function setRailEngaged(engaged: boolean): void {
  if (railEngaged === engaged) return;
  railEngaged = engaged;
  document.documentElement.toggleAttribute('data-tv-rail-expanded', engaged);
}

function isVisible(el: Element): boolean {
  const rect = el.getBoundingClientRect();
  if (rect.width <= 1 || rect.height <= 1) return false;
  const style = getComputedStyle(el);
  return !(style.visibility === 'hidden' || style.display === 'none' || Number(style.opacity) === 0);
}

function isInRail(el: Element | null | undefined): boolean {
  return !!el?.closest(RAIL_SEL);
}

function isInMain(el: Element | null | undefined): boolean {
  return !!el?.closest(MAIN_SEL);
}

function overlayRoot(): Element | null {
  const overlays = Array.from(document.querySelectorAll(OVERLAY_ROOT)).filter(isVisible);
  return overlays.length ? overlays[overlays.length - 1] : null;
}

function collectFocusables(root: Element | Document): HTMLElement[] {
  return Array.from(root.querySelectorAll(FOCUSABLE))
    .filter((el): el is HTMLElement => el instanceof HTMLElement)
    .filter((el) => !el.closest(FOCUS_SKIP))
    .filter(isVisible);
}

function contentFocusables(): HTMLElement[] {
  const overlay = overlayRoot();
  if (overlay) {
    return collectFocusables(overlay).filter((el) => !isInRail(el));
  }
  const main = document.querySelector(MAIN_SEL);
  if (main) return collectFocusables(main);
  return collectFocusables(document).filter((el) => !isInRail(el));
}

/** Только фокусируемые элементы активного TV-слоя (keep-alive). */
function activeContentFocusables(): HTMLElement[] {
  return contentFocusables().filter((el) => {
    const layer = el.closest('.tv-route-layer');
    return !(layer instanceof HTMLElement) || layer.classList.contains('tv-route-layer--active');
  });
}

function railFocusables(): HTMLElement[] {
  const rail = document.querySelector(RAIL_SEL);
  if (!rail) return [];
  return collectFocusables(rail);
}

function horizontalRowContainer(el: HTMLElement): HTMLElement | null {
  const homeRow = el.closest(TV_HOME_ROW_SEL);
  if (homeRow instanceof HTMLElement) return homeRow;
  const carouselScroll = el.closest(TV_ROW_SCROLL_SEL);
  if (carouselScroll instanceof HTMLElement) return carouselScroll;
  return null;
}

function focusablesInHorizontalRow(active: HTMLElement, list: HTMLElement[]): HTMLElement[] {
  const row = horizontalRowContainer(active);
  if (!row) return list;
  return list.filter((el) => row.contains(el));
}

function moveWithinRowOrEdge(
  list: HTMLElement[],
  active: HTMLElement,
  dir: 'left' | 'right',
): 'moved' | 'edge' | 'none' {
  const row = horizontalRowContainer(active);
  if (!row) return 'none';

  const rowList = focusablesInHorizontalRow(active, list);
  if (!rowList.includes(active)) return 'none';

  if (moveWithin(rowList, active, dir)) return 'moved';
  return 'edge';
}

function overlap(a0: number, a1: number, b0: number, b1: number): number {
  return Math.min(a1, b1) - Math.max(a0, b0);
}

function spatialScore(
  from: DOMRect,
  to: DOMRect,
  dir: 'up' | 'down' | 'left' | 'right',
): number {
  const horizontal = dir === 'left' || dir === 'right';
  let gap: number;
  let cross: number;

  if (dir === 'right') {
    gap = to.left - from.right;
    cross = overlap(from.top, from.bottom, to.top, to.bottom);
  } else if (dir === 'left') {
    gap = from.left - to.right;
    cross = overlap(from.top, from.bottom, to.top, to.bottom);
  } else if (dir === 'down') {
    gap = to.top - from.bottom;
    cross = overlap(from.left, from.right, to.left, to.right);
  } else {
    gap = from.top - to.bottom;
    cross = overlap(from.left, from.right, to.left, to.right);
  }

  if (gap < -8) return Infinity;
  const primary = Math.max(gap, 0);
  const secondary = cross > 0 ? 0 : Math.abs(cross);
  const bias = cross > 0 ? 0 : horizontal ? 900 : 40;
  return primary + secondary * (horizontal ? 3 : 0.25) + bias;
}

function preferredTarget(list: HTMLElement[]): HTMLElement | null {
  for (const selector of FOCUS_PRIORITY) {
    const hit = list.find((el) => el.matches(selector) || !!el.closest(selector));
    if (hit) return hit;
  }
  return null;
}

function scrollCarouselItemIntoView(el: HTMLElement): void {
  scrollTvCarouselItemIntoView(el);
}

function scrollHomeRowIntoView(el: HTMLElement): boolean {
  const rails = el.closest(TV_HOME_RAILS_SEL);
  const homeRow = el.closest(TV_HOME_ROW_SEL);
  if (!(rails instanceof HTMLElement) || !(homeRow instanceof HTMLElement)) return false;

  const railsRect = rails.getBoundingClientRect();
  const rowRect = homeRow.getBoundingClientRect();
  const targetTop = rails.scrollTop + (rowRect.top - railsRect.top);
  rails.scrollTo({ top: targetTop, behavior: 'smooth' });
  return true;
}

function focusElement(el: HTMLElement, sticky = false, preserveScroll = false): void {
  document.querySelectorAll(`[${FOCUS_ATTR}]`).forEach((node) => node.removeAttribute(FOCUS_ATTR));
  el.setAttribute(FOCUS_ATTR, 'true');
  el.focus({ preventScroll: true });
  if (!isInRail(el) && !preserveScroll) {
    const onHomeRails = scrollHomeRowIntoView(el);
    scrollCarouselItemIntoView(el);
    if (!onHomeRails) {
      el.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' });
    }
    const homeRow = tvHomeRow(el);
    if (homeRow && isTvHomeCarouselCard(el)) {
      saveTvHomeRowFocus(homeRow, el);
    }
  }
  stickyFocus = sticky ? el : null;
  if (isInMain(el)) lastContentFocus = el;
  setRailEngaged(isInRail(el));
}

function focusActiveRailItem(): boolean {
  const active = document.querySelector<HTMLElement>('.tv-layout__rail-item--active');
  if (!active) return false;
  focusElement(active, true);
  return true;
}

function focusDefaultContent(): boolean {
  const list = activeContentFocusables();
  if (!list.length) return false;
  const restore = lastContentFocus && list.includes(lastContentFocus) ? lastContentFocus : null;
  focusElement(restore ?? preferredTarget(list) ?? list[0]);
  return true;
}

export function returnTvFocusToContent(): void {
  window.setTimeout(() => {
    if (!focusTvPageContent()) scheduleFocusTvPageContent(20);
  }, 0);
}

function moveWithin(list: HTMLElement[], active: HTMLElement, dir: 'up' | 'down' | 'left' | 'right'): boolean {
  const from = active.getBoundingClientRect();
  let best: HTMLElement | null = null;
  let bestScore = Infinity;

  for (const candidate of list) {
    if (candidate === active) continue;
    const score = spatialScore(from, candidate.getBoundingClientRect(), dir);
    if (score < bestScore) {
      bestScore = score;
      best = candidate;
    }
  }

  if (!best || bestScore === Infinity) return false;
  focusElement(best);
  return true;
}

function focusTvReleaseContent(): boolean {
  const layer = document.querySelector('.tv-route-layer--active .tv-release-page');
  if (!layer) return false;

  const play = layer.querySelector<HTMLElement>('.tv-release-page__play:not([disabled])');
  if (play) {
    focusElement(play);
    return true;
  }

  const chip = layer.querySelector<HTMLElement>('.tv-release-page__chip');
  if (chip) {
    focusElement(chip);
    return true;
  }

  return false;
}

export function focusTvReleasePage(): void {
  scheduleFocusTvPageContent(30);
}

function focusTvPageContent(): boolean {
  setRailEngaged(false);

  if (isTvReleasePath(getPath()) && focusTvReleaseContent()) {
    return true;
  }

  return focusDefaultContent();
}

export function scheduleFocusTvPageContent(maxTries = 40): void {
  if (!isTvMode()) return;

  let tries = 0;
  const attempt = () => {
    if (focusTvPageContent()) return;
    tries += 1;
    if (tries < maxTries) window.requestAnimationFrame(attempt);
  };

  window.requestAnimationFrame(attempt);
}

function ensureInitialFocus(): void {
  scheduleFocusTvPageContent(40);
}

function moveFocus(dir: 'up' | 'down' | 'left' | 'right'): boolean {
  const active = document.activeElement as HTMLElement | null;

  if (overlayRoot()) {
    const list = contentFocusables();
    if (!list.length) return false;
    if (!active || active === document.body || !list.includes(active)) {
      ensureInitialFocus();
      return true;
    }
    if (dir === 'left' || dir === 'right') {
      const rowMove = moveWithinRowOrEdge(list, active, dir);
      if (rowMove === 'moved' || rowMove === 'edge') return true;
    }
    if (dir === 'up' || dir === 'down') {
      if (moveTvHomeRowVertical(active, dir)) return true;
    }
    return moveWithin(list, active, dir);
  }

  if (isInRail(active)) {
    if (dir === 'right') {
      return focusDefaultContent();
    }
    if (dir === 'left') return false;
    const list = railFocusables();
    if (!list.includes(active)) return focusActiveRailItem();
    return moveWithin(list, active, dir);
  }

  if (isInMain(active) || document.querySelector(MAIN_SEL)) {
    const list = activeContentFocusables();
    if (!list.length) {
      if (dir === 'left') return focusActiveRailItem();
      return false;
    }

    if (!active || active === document.body || !list.includes(active)) {
      return focusDefaultContent();
    }

    if (dir === 'left') {
      const rowMove = moveWithinRowOrEdge(list, active, 'left');
      if (rowMove === 'moved') return true;
      if (rowMove === 'edge') return focusActiveRailItem();
      if (moveWithin(list, active, 'left')) return true;
      return focusActiveRailItem();
    }

    if (dir === 'right') {
      const rowMove = moveWithinRowOrEdge(list, active, 'right');
      if (rowMove === 'moved' || rowMove === 'edge') return true;
    }

    if (dir === 'up' || dir === 'down') {
      if (moveTvHomeRowVertical(active, dir)) return true;
    }

    return moveWithin(list, active, dir);
  }

  const fallback = activeContentFocusables();
  if (!fallback.length) return false;
  if (!active || active === document.body || !fallback.includes(active)) {
    ensureInitialFocus();
    return true;
  }
  return moveWithin(fallback, active, dir);
}

function isTextInput(el: Element | null): boolean {
  if (!el) return false;
  if (el.tagName === 'TEXTAREA') return true;
  if (el.tagName !== 'INPUT') return false;
  const type = (el as HTMLInputElement).type;
  return ['text', 'search', 'email', 'password', 'url', 'tel', 'number'].includes(type);
}

function onArrowKeydown(event: KeyboardEvent): void {
  if (!isTvMode()) return;
  const dir = ARROW_KEYS[event.key];
  if (!dir) return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;

  const active = document.activeElement;
  if (isTextInput(active) && (dir === 'left' || dir === 'right')) return;

  if (moveFocus(dir)) {
    event.preventDefault();
    event.stopPropagation();
  }
}

function observeDom(): void {
  let timer = 0;
  new MutationObserver(() => {
    if (timer) return;
    timer = window.setTimeout(() => {
      timer = 0;
      const overlay = overlayRoot();
      if (overlay) {
        const active = document.activeElement;
        if (!active || active === document.body || !overlay.contains(active)) {
          ensureInitialFocus();
        }
        return;
      }

      const active = document.activeElement;
      if (isInMain(active)) return;
      if (isInRail(active)) {
        if (!railEngaged) scheduleFocusTvPageContent(20);
        return;
      }
      if (!active || active === document.body) {
        scheduleFocusTvPageContent(20);
      }
    }, 150);
  }).observe(document.body, { childList: true, subtree: true });
}

function handleBack(): void {
  if (railEngaged && isInRail(document.activeElement)) {
    focusDefaultContent();
    return;
  }

  const searchDropdown = document.querySelector('.search-dropdown');
  if (searchDropdown && isVisible(searchDropdown)) {
    document.getElementById('titlebar-search-input')?.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
    );
    return;
  }

  const closeBtn = Array.from(document.querySelectorAll(CLOSE_SELECTORS))
    .filter(isVisible)
    .pop() as HTMLElement | undefined;
  if (closeBtn) {
    closeBtn.click();
    return;
  }

  if (document.querySelector('.watch-page')) {
    const panel = document.querySelector('.watch-panel');
    const gui = document.querySelector('.watch-page__gui-overlay:not(.watch-page__gui-overlay--hidden)');
    if (panel || gui) {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      return;
    }
  }

  if (window.history.length > 1) {
    window.history.back();
    return;
  }

  void exitTvApp();
}

async function exitTvApp(): Promise<void> {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (cap?.isNativePlatform?.()) {
      const { App } = await import('@capacitor/app');
      await App.exitApp();
      return;
    }
  } catch {
    /* ignore */
  }
  window.electron?.window?.close?.();
}

async function bindCapacitorBackButton(): Promise<void> {
  try {
    const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
    if (!cap?.isNativePlatform?.()) return;
    const { App } = await import('@capacitor/app');
    await App.addListener('backButton', () => {
      handleBack();
    });
  } catch {
    /* ignore */
  }
}

function currentRoutePath(): string {
  return getPath();
}

function parkActiveLayerFocus(): void {
  const focused = document.querySelector<HTMLElement>(`[${FOCUS_ATTR}="true"]`);
  if (!focused || isInRail(focused)) return;
  const layer = focused.closest('[data-tv-keep]');
  if (!(layer instanceof HTMLElement)) return;
  const key = layer.dataset.tvKeep;
  if (!key) return;
  parkedFocusByLayer.set(key, focused);
  lastContentFocus = focused;
}

function restoreParkedFocus(path: string): boolean {
  const key = tvKeepAliveKey(path);
  if (!key) return false;
  const parked = parkedFocusByLayer.get(key);
  if (!parked || !parked.isConnected) {
    parkedFocusByLayer.delete(key);
    return false;
  }
  const layer = parked.closest('[data-tv-keep]');
  if (!(layer instanceof HTMLElement) || layer.dataset.tvKeep !== key) return false;
  if (!layer.classList.contains('tv-route-layer--active')) return false;
  focusElement(parked, false, true);
  return true;
}

function onBeforeTvNavigate(): void {
  parkActiveLayerFocus();
}

function destinationLayerReady(path: string): boolean {
  const key = tvKeepAliveKey(path);
  if (key) {
    return !!document.querySelector(`.tv-route-layer--active[data-tv-keep="${key}"]`);
  }
  return !!document.querySelector(
    '.tv-route-layer--active .tv-release-page, .tv-route-layer--active .tv-page',
  );
}

function onTvNavigate(): void {
  cancelTvReleaseOpen();
  setRailEngaged(false);
  const path = currentRoutePath();

  const settle = (tries = 0) => {
    if (!destinationLayerReady(path) && tries < 24) {
      window.requestAnimationFrame(() => settle(tries + 1));
      return;
    }
    if (restoreParkedFocus(path)) return;
    scheduleFocusTvPageContent(40);
  };

  window.requestAnimationFrame(() => settle());
}

function watchRouteChanges(): void {
  window.addEventListener('anix:beforeNavigate', onBeforeTvNavigate);
  window.addEventListener('anix:navigate', onTvNavigate);
}

function bindBackKeys(): void {
  window.addEventListener('keydown', (event) => {
    if (!isTvMode()) return;
    if (event.key !== 'Escape' && event.key !== 'BrowserBack' && event.key !== 'Back') return;
    if (event.key === 'Escape' && (event.altKey || event.ctrlKey || event.metaKey)) return;
    const tag = (event.target as HTMLElement | null)?.tagName;
    if (event.key === 'Escape' && tag === 'INPUT' && (event.target as HTMLInputElement).type === 'text') {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    handleBack();
  }, true);
}

export function isTvRailEngaged(): boolean {
  return railEngaged;
}

function onActivateKeydown(event: KeyboardEvent): void {
  if (!isTvMode()) return;
  if (event.key !== 'Enter' && event.key !== 'NumpadEnter') return;
  if (event.altKey || event.ctrlKey || event.metaKey) return;
  if (isTextInput(event.target as Element | null)) return;

  const focused = document.querySelector<HTMLElement>(`[${FOCUS_ATTR}="true"]`);
  if (!focused) return;
  if (
    !focused.matches('.uiv2-anime-card[role="button"]')
    && !focused.matches('.tv-category-see-all[role="button"]')
  ) {
    return;
  }

  event.preventDefault();
  event.stopPropagation();
  focused.click();
}

export function initTvNavigation(): void {
  if (typeof window === 'undefined' || !isTvMode()) return;
  if ((window as Window & { __tvNavReady?: boolean }).__tvNavReady) return;
  (window as Window & { __tvNavReady?: boolean }).__tvNavReady = true;

  document.addEventListener('keydown', onArrowKeydown, true);
  document.addEventListener('keydown', onActivateKeydown, true);
  bindBackKeys();
  observeDom();
  watchRouteChanges();
  void bindCapacitorBackButton();

  let attempts = 0;
  const boot = window.setInterval(() => {
    attempts += 1;
    const active = document.activeElement;
    if (active && active !== document.body && isInMain(active)) {
      window.clearInterval(boot);
      return;
    }
    if (contentFocusables().length) {
      scheduleFocusTvPageContent(40);
      window.clearInterval(boot);
      return;
    }
    if (attempts > 25) window.clearInterval(boot);
  }, 400);
}
