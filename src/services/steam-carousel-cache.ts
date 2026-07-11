export interface SteamSlideMediaCacheValue {
  poster: string;
  video: string | null;
  screenshots: string[];
}

const slideMediaCache = new Map<string, SteamSlideMediaCacheValue>();
const slideMediaInflight = new Map<string, Promise<SteamSlideMediaCacheValue>>();
const assetWarmCache = new Map<string, Promise<void>>();

export function getSteamSlideMedia(key: string): SteamSlideMediaCacheValue | undefined {
  return slideMediaCache.get(key);
}

export function setSteamSlideMedia(key: string, media: SteamSlideMediaCacheValue): void {
  slideMediaCache.set(key, media);
}

export function getSteamSlideMediaInflight(
  key: string
): Promise<SteamSlideMediaCacheValue> | undefined {
  return slideMediaInflight.get(key);
}

export function setSteamSlideMediaInflight(
  key: string,
  promise: Promise<SteamSlideMediaCacheValue>
): void {
  slideMediaInflight.set(key, promise);
}

export function clearSteamSlideMediaInflight(key: string): void {
  slideMediaInflight.delete(key);
}

export function warmSteamImage(url: string): Promise<void> {
  if (!url) return Promise.resolve();
  const cacheKey = `image:${url}`;
  const existing = assetWarmCache.get(cacheKey);
  if (existing) return existing;

  const task = new Promise<void>((resolve) => {
    const image = new Image();
    const done = () => resolve();
    image.decoding = 'async';
    image.onload = done;
    image.onerror = done;
    image.src = url;
    if (image.complete) queueMicrotask(done);
  });

  assetWarmCache.set(cacheKey, task);
  return task;
}

export function warmSteamVideo(url: string): Promise<void> {
  if (!url) return Promise.resolve();
  const cacheKey = `video:${url}`;
  const existing = assetWarmCache.get(cacheKey);
  if (existing) return existing;

  const task = new Promise<void>((resolve) => {
    const video = document.createElement('video');
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      video.onloadedmetadata = null;
      video.oncanplay = null;
      video.onerror = null;
      video.removeAttribute('src');
      video.load();
      resolve();
    };
    const timeout = window.setTimeout(done, 8000);
    video.preload = 'auto';
    video.muted = true;
    video.playsInline = true;
    video.onloadedmetadata = done;
    video.oncanplay = done;
    video.onerror = done;
    video.src = url;
    video.load();
  });

  assetWarmCache.set(cacheKey, task);
  return task;
}
