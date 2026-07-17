import { get, writable } from 'svelte/store';
import { openProfileModal, profileModalOpen } from './modals';

export interface UserProfilePopoutTarget {
  userId: number;
  anchor: HTMLElement;
}

export const userProfilePopout = writable<UserProfilePopoutTarget | null>(null);

export function closeUserProfilePopout(): void {
  userProfilePopout.set(null);
}

export function openUserProfilePopout(userId: number, anchor: HTMLElement): void {
  if (!userId) return;
  closeUserProfilePopout();
  userProfilePopout.set({ userId, anchor });
}

export function openUserProfileModal(userId?: number): void {
  closeUserProfilePopout();
  openProfileModal(userId);
}

export function handleUserProfileClick(userId: number | undefined | null, event: MouseEvent): void {
  if (!userId) return;
  event.preventDefault();
  event.stopPropagation();

  if (get(profileModalOpen)) {
    openUserProfileModal(userId);
    return;
  }

  const anchor = (event.currentTarget as HTMLElement | null) ?? (event.target as HTMLElement);
  openUserProfilePopout(userId, anchor);
}
