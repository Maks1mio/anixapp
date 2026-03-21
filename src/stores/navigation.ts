import { writable } from 'svelte/store';
import { getPath } from '../router';

export const currentPath = writable<string>(getPath());

export function navigate(path: string, _state?: unknown): void {
  if (window.location.protocol === 'file:') {
    const hash = path && path !== '/' ? (path.startsWith('#') ? path : '#' + path) : '#/';
    if (window.location.hash !== hash) {
      window.location.hash = hash;
      // hashchange → App.svelte listener updates currentPath
    } else {
      currentPath.set(getPath());
    }
    return;
  }
  window.history.pushState(_state ?? null, '', path);
  currentPath.set(getPath());
}
