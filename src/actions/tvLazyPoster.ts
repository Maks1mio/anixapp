/**
 * TV: img.src только в видимой зоне горизонтального ряда.
 * Вне экрана — 1×1 placeholder; при уходе за край — выгрузка из памяти.
 */

const PLACEHOLDER =
  'data:image/gif;base64,R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7';

const SCROLL_ROOT_SEL = '.uiv2-carousel__scroll, .tv-category-page__grid, .tv-home__rails';
const UNLOAD_MS = 180;

function isAndroidTv(): boolean {
  return document.documentElement.classList.contains('tv-android');
}

function maxParallel(): number {
  return isAndroidTv() ? 4 : 6;
}

function rootMargin(): string {
  // Вертикаль · горизонталь — минимальный «peek», без лишних карточек за экраном
  return isAndroidTv() ? '32px 56px' : '48px 96px';
}

type Job = { img: HTMLImageElement; src: string; gen: number };

const gens = new WeakMap<HTMLImageElement, number>();
const unloadTimers = new WeakMap<HTMLImageElement, number>();
const queue: Job[] = [];
let active = 0;

const observers = new WeakMap<Element, IntersectionObserver>();

function bump(img: HTMLImageElement): number {
  const next = (gens.get(img) ?? 0) + 1;
  gens.set(img, next);
  return next;
}

function currentGen(img: HTMLImageElement): number {
  return gens.get(img) ?? 0;
}

function scrollRoot(img: HTMLImageElement): Element | null {
  return img.closest(SCROLL_ROOT_SEL);
}

function setItemOffscreen(img: HTMLImageElement, offscreen: boolean): void {
  const item = img.closest('.uiv2-carousel__item, .tv-category-page__item');
  item?.toggleAttribute('data-tv-poster-offscreen', offscreen);
}

function clearUnloadTimer(img: HTMLImageElement): void {
  const id = unloadTimers.get(img);
  if (id != null) window.clearTimeout(id);
  unloadTimers.delete(img);
}

function pump() {
  const limit = maxParallel();
  while (active < limit && queue.length > 0) {
    const job = queue.shift();
    if (!job) break;
    if (!job.img.isConnected || currentGen(job.img) !== job.gen) continue;
    active += 1;
    const done = () => {
      active = Math.max(0, active - 1);
      pump();
    };
    job.img.addEventListener('load', done, { once: true });
    job.img.addEventListener('error', done, { once: true });
    job.img.src = job.src;
  }
}

function enqueue(img: HTMLImageElement, src: string) {
  if (img.getAttribute('src') === src) return;
  queue.push({ img, src, gen: currentGen(img) });
  pump();
}

function unload(img: HTMLImageElement) {
  bump(img);
  clearUnloadTimer(img);
  if (img.getAttribute('src') !== PLACEHOLDER) {
    img.src = PLACEHOLDER;
  }
}

function scheduleUnload(img: HTMLImageElement) {
  clearUnloadTimer(img);
  const gen = currentGen(img);
  const id = window.setTimeout(() => {
    unloadTimers.delete(img);
    if (!img.isConnected || currentGen(img) !== gen) return;
    unload(img);
    setItemOffscreen(img, true);
  }, UNLOAD_MS);
  unloadTimers.set(img, id);
}

function isLoaded(img: HTMLImageElement, src: string): boolean {
  return img.getAttribute('src') === src && img.complete && img.naturalWidth > 1;
}

function onIntersection(entries: IntersectionObserverEntry[]) {
  for (const entry of entries) {
    const img = entry.target as HTMLImageElement;
    const src = img.dataset.tvPoster;
    if (!src) continue;

    if (entry.isIntersecting) {
      clearUnloadTimer(img);
      setItemOffscreen(img, false);
      if (!isLoaded(img, src)) enqueue(img, src);
    } else {
      scheduleUnload(img);
    }
  }
}

function getObserver(root: Element | null): IntersectionObserver {
  const key = root ?? document.documentElement;
  let obs = observers.get(key);
  if (!obs) {
    obs = new IntersectionObserver(onIntersection, {
      root,
      rootMargin: rootMargin(),
      threshold: 0.02,
    });
    observers.set(key, obs);
  }
  return obs;
}

function observe(img: HTMLImageElement) {
  const root = scrollRoot(img);
  getObserver(root).observe(img);
}

function unobserve(img: HTMLImageElement) {
  const root = scrollRoot(img);
  const key = root ?? document.documentElement;
  observers.get(key)?.unobserve(img);
}

export function tvLazyPoster(node: HTMLImageElement, src: string | null | undefined) {
  function apply(next: string | null | undefined) {
    const value = next?.trim() || '';
    bump(node);
    clearUnloadTimer(node);
    node.src = PLACEHOLDER;
    if (!value) {
      delete node.dataset.tvPoster;
      unobserve(node);
      setItemOffscreen(node, false);
      return;
    }
    node.dataset.tvPoster = value;
    observe(node);
  }

  apply(src);

  return {
    update(next: string | null | undefined) {
      if ((next?.trim() || '') === (node.dataset.tvPoster ?? '')) return;
      unobserve(node);
      apply(next);
    },
    destroy() {
      bump(node);
      clearUnloadTimer(node);
      unobserve(node);
      delete node.dataset.tvPoster;
      setItemOffscreen(node, false);
    },
  };
}
