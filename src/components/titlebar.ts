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
      <button type="button" class="titlebar__nav-btn" id="titlebar-back" aria-label="Назад">${iconArrowLeft(16)}</button>
      <button type="button" class="titlebar__nav-btn" id="titlebar-forward" aria-label="Вперёд">${iconArrowRight(16)}</button>
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
      <button type="button" class="titlebar__btn titlebar__btn--min" aria-label="Свернуть"></button>
      <button type="button" class="titlebar__btn titlebar__btn--max" aria-label="Развернуть"></button>
      <button type="button" class="titlebar__btn titlebar__btn--close" aria-label="Закрыть"></button>
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
