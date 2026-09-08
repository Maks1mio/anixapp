import { get } from 'svelte/store';
import {
  closeFeedMediaLightbox,
  feedMediaLightbox,
  openFeedMediaLightbox,
  type FeedLightboxItem,
} from './feed-media-lightbox';
import { toCdnProxyUrl } from './posterUrl';

/** Совместимость с TV/старым API: тот же предпросмотр, что в ленте (поверх профиля). */

export function isImageLightboxOpen(): boolean {
  return get(feedMediaLightbox) != null;
}

export function closeImageLightbox(): boolean {
  if (!isImageLightboxOpen()) return false;
  closeFeedMediaLightbox();
  return true;
}

export function openImageLightbox(imageUrl: string, trigger?: HTMLElement | null): void {
  const url = toCdnProxyUrl(imageUrl);
  if (!url) return;
  openFeedMediaLightbox([{ url, kind: 'image' }], 0, trigger);
}

export function openImageLightboxGallery(
  imageUrls: string[],
  index: number,
  trigger?: HTMLElement | null,
): void {
  const items: FeedLightboxItem[] = imageUrls
    .map((raw) => toCdnProxyUrl(raw))
    .filter(Boolean)
    .map((url) => ({ url, kind: 'image' as const }));
  if (!items.length) return;
  openFeedMediaLightbox(items, index, trigger);
}
