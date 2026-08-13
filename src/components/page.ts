/**
 * Обёртка страницы с кастомным скроллбаром UI Kit V2.
 * id="content" на области скролла — сюда роутер вставляет контент.
 */
import { uiv2CustomScroll } from '../actions/uiv2CustomScroll';

export interface PageOptions {
  /** ID for the scroll element. Defaults to 'content' (used by the router). */
  scrollId?: string;
  /** Extra CSS class(es) to add to the root .page element. */
  extraClass?: string;
  /** If true, omits the `page--padded` class. */
  noPadding?: boolean;
}

export function renderPage(opts?: PageOptions): HTMLElement {
  const page = document.createElement('div');
  const classes = ['page', 'uiv2-scroll-area', 'uiv2-scroll-area--y'];
  if (!opts?.noPadding) classes.push('page--padded');
  if (opts?.extraClass) classes.push(opts.extraClass);
  page.className = classes.join(' ');

  const scrollEl = document.createElement('div');
  if (opts?.scrollId !== undefined) {
    if (opts.scrollId) scrollEl.id = opts.scrollId;
  } else {
    scrollEl.id = 'content';
  }
  scrollEl.className = 'page__scroll uiv2-scroll-area__viewport';
  scrollEl.setAttribute('data-page-scroll', '');
  scrollEl.setAttribute('data-uiv2-scroll', '');

  const vTrack = document.createElement('div');
  vTrack.className = 'uiv2-scroll-area__v-track';
  vTrack.setAttribute('aria-hidden', 'true');
  const vThumb = document.createElement('div');
  vThumb.className = 'uiv2-scroll-area__v-thumb';
  vTrack.appendChild(vThumb);

  page.appendChild(scrollEl);
  page.appendChild(vTrack);

  uiv2CustomScroll(page, { axis: 'y', viewportSelector: '.page__scroll' });
  return page;
}
