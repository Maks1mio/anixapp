import { writable } from 'svelte/store';

export type FeedLightboxItem = {
  url: string;
  kind: 'image' | 'video' | 'gif';
};

export type FeedLightboxOrigin = {
  left: number;
  top: number;
  width: number;
  height: number;
  borderRadius: string;
};

export type FeedLightboxState = {
  items: FeedLightboxItem[];
  index: number;
  origin: FeedLightboxOrigin | null;
};

export const feedMediaLightbox = writable<FeedLightboxState | null>(null);

export function openFeedMediaLightbox(
  items: FeedLightboxItem[],
  index: number,
  originEl?: HTMLElement | null,
): void {
  const usable = items.filter((item) => item.kind !== 'video' || !!item.url);
  if (usable.length === 0) return;
  const safeIndex = Math.max(0, Math.min(index, usable.length - 1));
  const rect = originEl?.getBoundingClientRect();
  const borderRadius = originEl ? getComputedStyle(originEl).borderRadius || '12px' : '12px';
  feedMediaLightbox.set({
    items: usable,
    index: safeIndex,
    origin: rect
      ? {
          left: rect.left,
          top: rect.top,
          width: rect.width,
          height: rect.height,
          borderRadius,
        }
      : null,
  });
}

export function closeFeedMediaLightbox(): void {
  feedMediaLightbox.set(null);
}

export function stepFeedMediaLightbox(delta: number): void {
  feedMediaLightbox.update((state) => {
    if (!state || state.items.length < 2) return state;
    const next = (state.index + delta + state.items.length) % state.items.length;
    return { ...state, index: next, origin: null };
  });
}
