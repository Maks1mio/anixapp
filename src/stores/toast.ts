import { writable } from 'svelte/store';

export interface Toast {
  id: number;
  message: string;
  type: 'ok' | 'err' | 'info';
}

export const toasts = writable<Toast[]>([]);

let _id = 0;

export function showToast(message: string, type: Toast['type'] = 'ok', duration = 3000): void {
  const id = ++_id;
  toasts.update(t => [...t, { id, message, type }]);
  setTimeout(() => {
    toasts.update(t => t.filter(x => x.id !== id));
  }, duration);
}
