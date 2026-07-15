import { writable } from 'svelte/store';
import { getPath } from '../router';
import { captureActiveScroll, resetScrollAfterRouteChange } from './view-state';
import { recordTabNavigation, prepareSidebarTabSwitch } from './tab-navigation';

export const currentPath = writable<string>(getPath());

export function navigate(path: string, _state?: unknown): void {
  window.dispatchEvent(new CustomEvent('anix:beforeNavigate', { detail: { to: path } }));
  captureActiveScroll();
  // Emit for logger before changing location
  window.dispatchEvent(new CustomEvent('anix:navigate', { detail: path }));

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
    return;
  }
  window.history.pushState(_state ?? null, '', path);
  recordTabNavigation(path);
  currentPath.set(getPath());
  resetScrollAfterRouteChange();
}

/** Клик по сайдбару: восстановить последний путь секции или сбросить на корень при повторном клике. */
export function navigateSidebarTab(href: string): void {
  const target = prepareSidebarTabSwitch(href);
  navigate(target ?? href);
}
