/** Episode frames: memory for this session, Cache API across restarts. */

const CACHE_NAME = 'anix-episode-covers-v1';
const memory = new Map<string, string>();
const inflight = new Map<string, Promise<string>>();
const shown = new Set<string>();

async function resolveCover(url: string): Promise<string> {
  const hit = memory.get(url);
  if (hit) return hit;
  const pending = inflight.get(url);
  if (pending) return pending;

  const job = (async () => {
    try {
      if (typeof caches === 'undefined') return url;
      const cache = await caches.open(CACHE_NAME);
      let res = await cache.match(url);
      if (!res) {
        const fetched = await fetch(url, { credentials: 'same-origin' });
        if (!fetched.ok) return '';
        await cache.put(url, fetched.clone());
        res = fetched;
      }
      const blobUrl = URL.createObjectURL(await res.blob());
      memory.set(url, blobUrl);
      return blobUrl;
    } catch {
      return url;
    } finally {
      inflight.delete(url);
    }
  })();

  inflight.set(url, job);
  return job;
}

function paint(img: HTMLImageElement, src: string, key: string, instant: boolean) {
  if (img.getAttribute('src') !== src) img.src = src;
  const show = () => {
    shown.add(key);
    if (instant) img.classList.add('watch-modal__episode-cover--instant');
    img.classList.add('watch-modal__episode-cover--on');
  };
  if (img.complete && img.naturalWidth > 0) show();
  else img.addEventListener('load', show, { once: true });
}

/** Puts a cached frame on an `<img>`. Already seen URLs appear without the fade. */
export function cachedCover(img: HTMLImageElement, url: string) {
  let current = url;
  let token = 0;
  let observer: IntersectionObserver | null = null;

  const stopWatch = () => {
    observer?.disconnect();
    observer = null;
  };

  const run = (next: string) => {
    const my = ++token;
    current = next;
    stopWatch();
    img.classList.remove('watch-modal__episode-cover--on');

    const mem = memory.get(next);
    if (mem) {
      paint(img, mem, next, true);
      return;
    }
    if (shown.has(next)) {
      paint(img, next, next, true);
      return;
    }

    const start = () => {
      void resolveCover(next).then((src) => {
        if (my !== token || !src) return;
        paint(img, src, next, false);
      });
    };

    const root = img.closest<HTMLElement>('.page__scroll');
    if (!root || typeof IntersectionObserver === 'undefined') {
      start();
      return;
    }
    observer = new IntersectionObserver(
      (entries) => {
        if (!entries.some((entry) => entry.isIntersecting)) return;
        stopWatch();
        start();
      },
      { root, rootMargin: '480px' },
    );
    observer.observe(img);
  };

  run(url);

  return {
    update(next: string) {
      if (next && next !== current) run(next);
    },
    destroy() {
      token += 1;
      stopWatch();
    },
  };
}
