import { writable } from 'svelte/store';

export type AppScreen = 'offline' | 'login' | 'main';

export const appScreen = writable<AppScreen>('offline');
