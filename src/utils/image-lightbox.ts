import { isTvMode } from '../platform/tv';
import { toCdnProxyUrl } from './posterUrl';

const FOCUS_ATTR = 'data-tv-focus';

let returnFocus: HTMLElement | null = null;
let activeClose: (() => void) | null = null;

export function isImageLightboxOpen(): boolean {
  return !!document.querySelector('.release-lightbox');
}

export function closeImageLightbox(): boolean {
  if (!activeClose) return false;
  activeClose();
  return true;
}

export function openImageLightbox(imageUrl: string, trigger?: HTMLElement | null): void {
  if (isImageLightboxOpen()) return;

  const displayUrl = toCdnProxyUrl(imageUrl);
  returnFocus = trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);

  const overlay = document.createElement('div');
  overlay.className = 'release-lightbox';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Изображение');

  const div = document.createElement('div');
  div.textContent = displayUrl;
  const safeUrl = div.innerHTML;

  overlay.innerHTML = `
    <div class="release-lightbox__backdrop"></div>
    <div class="release-lightbox__content">
      <button type="button" class="release-lightbox__close" aria-label="Закрыть">
        <span aria-hidden="true">×</span>
      </button>
      <img src="${safeUrl}" alt="" decoding="async" />
    </div>
  `;

  const backdrop = overlay.querySelector('.release-lightbox__backdrop');
  const closeBtn = overlay.querySelector<HTMLButtonElement>('.release-lightbox__close');
  const img = overlay.querySelector('img');

  const restoreFocus = () => {
    const target = returnFocus;
    returnFocus = null;

    if (isTvMode()) {
      void import('../services/tv-navigation').then(({ restoreTvFocus }) => {
        restoreTvFocus(target);
      });
      return;
    }

    if (target?.isConnected) {
      target.focus();
    }
  };

  const close = () => {
    if (!overlay.isConnected) return;
    overlay.remove();
    document.removeEventListener('keydown', onKey, true);
    document.body.style.overflow = '';
    activeClose = null;
    restoreFocus();
  };

  activeClose = close;

  const onKey = (event: KeyboardEvent) => {
    if (
      event.key === 'Escape'
      || event.key === 'Back'
      || event.key === 'BrowserBack'
    ) {
      event.preventDefault();
      event.stopPropagation();
      close();
    }
  };

  closeBtn?.addEventListener('click', (event) => {
    event.stopPropagation();
    close();
  });

  overlay.addEventListener('click', (event) => {
    if (event.target === overlay || event.target === backdrop) close();
  });

  img?.addEventListener('click', (event) => event.stopPropagation());

  document.addEventListener('keydown', onKey, true);
  document.body.style.overflow = 'hidden';
  document.body.appendChild(overlay);

  document.querySelectorAll(`[${FOCUS_ATTR}]`).forEach((node) => node.removeAttribute(FOCUS_ATTR));

  if (isTvMode()) {
    void import('../services/tv-navigation').then(({ scheduleFocusTvOverlayContent }) => {
      scheduleFocusTvOverlayContent(30);
    });
  } else {
    closeBtn?.focus();
  }
}
