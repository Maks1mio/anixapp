import { navigate } from '../stores/navigation';
import { isTvMode } from '../platform/tv';
import { toPosterDisplayUrl } from '../utils/posterUrl';

export const TV_RELEASE_POSTER_SELECTOR = '[data-tv-release-poster]';

const DURATION_MS = 560;
const CONTENT_IN_MS = 480;
const EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';

export interface TvReleaseOpenPayload {
  releaseId: number;
  posterUrl: string;
  title: string;
  sourceRect: DOMRect;
  borderRadius: string;
}

let pending: TvReleaseOpenPayload | null = null;
let overlayRoot: HTMLElement | null = null;
let overlayPoster: HTMLElement | null = null;
let sourceCard: HTMLElement | null = null;

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

function readPosterRect(cardEl: HTMLElement): { rect: DOMRect; borderRadius: string } | null {
  const poster = cardEl.querySelector('.uiv2-anime-card__poster');
  if (!(poster instanceof HTMLElement)) return null;
  return {
    rect: poster.getBoundingClientRect(),
    borderRadius: getComputedStyle(poster).borderRadius || '0px',
  };
}

function readPosterImageUrl(cardEl: HTMLElement): string {
  const img = cardEl.querySelector('.uiv2-anime-card__poster img');
  if (img instanceof HTMLImageElement) {
    const src = img.currentSrc || img.src;
    if (src && !src.startsWith('data:')) return src;
  }
  return '';
}

function ensureOverlay(posterUrl: string, from: DOMRect, borderRadius: string): void {
  removeOverlay();

  const root = document.createElement('div');
  root.className = 'tv-release-open';
  root.setAttribute('aria-hidden', 'true');

  const scrim = document.createElement('div');
  scrim.className = 'tv-release-open__scrim';

  const poster = document.createElement('div');
  poster.className = 'tv-release-open__poster';
  poster.style.left = `${from.left}px`;
  poster.style.top = `${from.top}px`;
  poster.style.width = `${from.width}px`;
  poster.style.height = `${from.height}px`;
  poster.style.borderRadius = borderRadius;

  const img = document.createElement('img');
  img.src = posterUrl;
  img.alt = '';
  img.decoding = 'async';
  poster.appendChild(img);

  root.appendChild(scrim);
  root.appendChild(poster);
  document.body.appendChild(root);

  overlayRoot = root;
  overlayPoster = poster;

  requestAnimationFrame(() => {
    root.classList.add('tv-release-open--visible');
  });
}

function removeOverlay(): void {
  overlayRoot?.remove();
  overlayRoot = null;
  overlayPoster = null;
}

function clearSourceCard(): void {
  sourceCard?.removeAttribute('data-tv-release-source');
  sourceCard = null;
}

function resetDomState(): void {
  const root = document.documentElement;
  root.removeAttribute('data-tv-release-opening');
  root.removeAttribute('data-tv-release-opened');
  clearSourceCard();
  removeOverlay();
  pending = null;
}

function finishTransition(): void {
  resetDomState();
}

function animatePosterTo(target: DOMRect, targetRadius: string): Promise<void> {
  const poster = overlayPoster;
  if (!poster || !pending) return Promise.resolve();

  const from = pending.sourceRect;
  const dx = target.left - from.left;
  const dy = target.top - from.top;
  const sx = from.width > 0 ? target.width / from.width : 1;
  const sy = from.height > 0 ? target.height / from.height : 1;

  const fromRadius = pending.borderRadius;
  const animation = poster.animate(
    [
      {
        transform: 'translate(0px, 0px) scale(1, 1)',
        borderRadius: fromRadius,
      },
      {
        transform: `translate(${dx}px, ${dy}px) scale(${sx}, ${sy})`,
        borderRadius: targetRadius,
      },
    ],
    { duration: DURATION_MS, easing: EASE, fill: 'forwards' },
  );

  return new Promise((resolve) => {
    animation.onfinish = () => resolve();
    animation.oncancel = () => resolve();
  });
}

function waitForPosterTarget(timeoutMs: number): Promise<HTMLElement | null> {
  return new Promise((resolve) => {
    const pick = () => document.querySelector<HTMLElement>(TV_RELEASE_POSTER_SELECTOR);

    const existing = pick();
    if (existing) {
      requestAnimationFrame(() => resolve(existing));
      return;
    }

    const observer = new MutationObserver(() => {
      const el = pick();
      if (!el) return;
      observer.disconnect();
      requestAnimationFrame(() => resolve(el));
    });

    observer.observe(document.body, { childList: true, subtree: true });
    window.setTimeout(() => {
      observer.disconnect();
      resolve(pick());
    }, timeoutMs);
  });
}

function startOpen(cardEl: HTMLElement, releaseId: number, posterUrl: string, title: string): boolean {
  if (!isTvMode() || prefersReducedMotion()) return false;

  const geometry = readPosterRect(cardEl);
  if (!geometry || geometry.rect.width < 8 || geometry.rect.height < 8) return false;

  const imageUrl = readPosterImageUrl(cardEl) || posterUrl;
  if (!imageUrl) return false;

  pending = {
    releaseId,
    posterUrl: toPosterDisplayUrl(imageUrl, 'releaseHero') || imageUrl,
    title,
    sourceRect: geometry.rect,
    borderRadius: geometry.borderRadius,
  };

  sourceCard = cardEl;
  sourceCard.setAttribute('data-tv-release-source', 'true');
  document.documentElement.setAttribute('data-tv-release-opening', String(releaseId));
  ensureOverlay(pending.posterUrl, geometry.rect, geometry.borderRadius);
  return true;
}

export function getTvReleaseOpenTarget(releaseId: number): TvReleaseOpenPayload | null {
  if (!pending || pending.releaseId !== releaseId) return null;
  return pending;
}

export function hasTvReleaseOpenTarget(releaseId: number): boolean {
  return pending?.releaseId === releaseId;
}

export function openTvReleaseFromCard(
  cardEl: HTMLElement,
  releaseId: number,
  posterUrl: string,
  title: string,
): void {
  const path = `/release/${releaseId}`;
  if (!startOpen(cardEl, releaseId, posterUrl, title)) {
    navigate(path);
    return;
  }
  navigate(path);
}

export async function runTvReleaseOpenAnimation(releaseId: number): Promise<void> {
  if (!pending || pending.releaseId !== releaseId) return;

  await new Promise<void>((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });

  const target = await waitForPosterTarget(2400);
  if (!pending || pending.releaseId !== releaseId) return;

  if (!target || !overlayPoster) {
    finishTransition();
    return;
  }

  const targetRect = target.getBoundingClientRect();
  const targetRadius = getComputedStyle(target).borderRadius || '0px';

  try {
    await animatePosterTo(targetRect, targetRadius);
    document.documentElement.setAttribute('data-tv-release-opened', 'true');
    await new Promise<void>((resolve) => {
      window.setTimeout(resolve, CONTENT_IN_MS);
    });
  } finally {
    finishTransition();
  }
}

export function cancelTvReleaseOpen(): void {
  if (!pending) return;
  finishTransition();
}
