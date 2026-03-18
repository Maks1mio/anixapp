import { iconArrowLeft, iconArrowRight, iconSearch } from './icons';

export function renderTitleBar(): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'titlebar';

  const hasWindowApi = typeof (window as Window).electron?.window !== 'undefined';

  bar.innerHTML = `
    <div class="titlebar__drag">
      <span class="titlebar__logo" aria-hidden="true">
        <img src="logo/512x512.png" alt="" class="titlebar__logo-img" />
      </span>
      <span class="titlebar__title">AnixApp</span>
    </div>
    <div class="titlebar__nav" id="titlebar-nav">
      <button type="button" class="titlebar__nav-btn tooltip-trigger" id="titlebar-back" aria-label="Назад">
        ${iconArrowLeft(16)}
        <span class="tooltip tooltip--animated">Назад</span>
      </button>
      <button type="button" class="titlebar__nav-btn tooltip-trigger" id="titlebar-forward" aria-label="Вперёд">
        ${iconArrowRight(16)}
        <span class="tooltip tooltip--animated">Вперёд</span>
      </button>
    </div>
    <div class="titlebar__search" id="titlebar-search-wrap">
      <span class="titlebar__search-icon">${iconSearch(14)}</span>
      <input type="text" class="titlebar__search-input" id="titlebar-search-input"
             placeholder="Поиск аниме, пользователей, коллекций…"
             autocomplete="off" spellcheck="false" aria-label="Поиск" />
      <kbd class="titlebar__search-kbd">Ctrl+K</kbd>
    </div>
    <div class="titlebar__menu" id="titlebar-menu"></div>
    ${hasWindowApi ? `
    <div class="titlebar__controls">
      <button type="button" class="titlebar__btn titlebar__btn--min tooltip-trigger" aria-label="Свернуть">
        <span class="tooltip tooltip--animated">Свернуть</span>
      </button>
      <button type="button" class="titlebar__btn titlebar__btn--max tooltip-trigger" aria-label="Развернуть">
        <span class="tooltip tooltip--animated">Развернуть</span>
      </button>
      <button type="button" class="titlebar__btn titlebar__btn--close tooltip-trigger" aria-label="Закрыть">
        <span class="tooltip tooltip--animated">Закрыть</span>
      </button>
    </div>
    ` : ''}
  `;

  bar.querySelector('#titlebar-back')?.addEventListener('click', () => window.history.back());
  bar.querySelector('#titlebar-forward')?.addEventListener('click', () => window.history.forward());

  if (hasWindowApi) {
    const win = (window as Window).electron!.window;
    bar.querySelector('.titlebar__btn--min')?.addEventListener('click', () => win.minimize());
    bar.querySelector('.titlebar__btn--max')?.addEventListener('click', () => win.maximize());
    bar.querySelector('.titlebar__btn--close')?.addEventListener('click', () => win.close());
  }

  return bar;
}
