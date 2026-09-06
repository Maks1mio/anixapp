import { writable } from 'svelte/store';
import { getPath } from '../router';
import { captureActiveScroll, resetScrollAfterRouteChange } from './view-state';
import {
  recordTabNavigation,
  prepareSidebarTabSwitch,
  prepareIndependentNavigation,
  prepareIndependentTabSwitch,
  type IndependentTabId,
} from './tab-navigation';
import { openProfileFromPath } from './user-profile';

export const currentPath = writable<string>(getPath());

export function navigate(path: string, _state?: unknown): void {
  if (openProfileFromPath(path)) return;

  window.dispatchEvent(new CustomEvent('anix:beforeNavigate', { detail: { to: path } }));
  captureActiveScroll();

  // Сначала меняем URL, потом anix:navigate — слушатели читают актуальный location
  if (window.location.protocol === 'file:') {
    const hash = path && path !== '/' ? (path.startsWith('#') ? path : '#' + path) : '#/';
    recordTabNavigation(path);
    if (window.location.hash !== hash) {
      window.location.hash = hash;
      // hashchange → App.svelte listener updates currentPath
    } else {
      currentPath.set(getPath());
      resetScrollAfterRouteChange();
    }
    window.dispatchEvent(new CustomEvent('anix:navigate', { detail: path }));
    return;
  }
  window.history.pushState(_state ?? null, '', path);
  recordTabNavigation(path);
  window.dispatchEvent(new CustomEvent('anix:navigate', { detail: path }));
  currentPath.set(getPath());
  resetScrollAfterRouteChange();
}

/** Заменить текущий URL без новой записи в истории. */
export function replacePath(path: string): void {
  window.dispatchEvent(new CustomEvent('anix:beforeNavigate', { detail: { to: path } }));
  captureActiveScroll();

  if (window.location.protocol === 'file:') {
    const hash = path && path !== '/' ? (path.startsWith('#') ? path : '#' + path) : '#/';
    const next = `${window.location.pathname}${window.location.search}${hash}`;
    recordTabNavigation(path);
    window.history.replaceState(null, '', next);
    currentPath.set(getPath());
    resetScrollAfterRouteChange();
    window.dispatchEvent(new CustomEvent('anix:navigate', { detail: path }));
    return;
  }

  window.history.replaceState(null, '', path);
  recordTabNavigation(path);
  window.dispatchEvent(new CustomEvent('anix:navigate', { detail: path }));
  currentPath.set(getPath());
  resetScrollAfterRouteChange();
}

/** Клик по сайдбару: восстановить последний путь секции или сбросить на корень при повторном клике. */
export function navigateSidebarTab(href: string): void {
  const target = prepareSidebarTabSwitch(href);
  navigate(target ?? href);
}

export function navigateIndependentTab(tabId: IndependentTabId, path: string): void {
  navigate(prepareIndependentNavigation(tabId, path));
}

export function navigateSearchTab(): void {
  navigate(prepareIndependentTabSwitch('search', '/search'));
}
