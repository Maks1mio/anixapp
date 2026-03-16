/**
 * Точка входа только для окна плеера.
 * Окно загружает player.html с query-параметрами (releaseId, sourceId, ep, title, sourceName).
 * Кастомный хедер (иконка + AnixApp + кнопка закрыть), при fullscreen хедер скрывается.
 */

import './styles/main.scss';
import './styles/player-titlebar.scss';
import { renderWatch } from './views/watch';

function renderPlayerTitlebar(): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'player-titlebar';
  bar.innerHTML = `
    <div class="player-titlebar__drag">
      <span class="player-titlebar__logo" aria-hidden="true">
        <img src="logo/512x512.png" alt="" class="player-titlebar__logo-img" />
      </span>
      <span class="player-titlebar__title">AnixApp</span>
    </div>
    <div class="player-titlebar__controls">
      <button type="button" class="player-titlebar__btn player-titlebar__btn--close" aria-label="Закрыть"></button>
    </div>
  `;
  bar.querySelector('.player-titlebar__btn--close')?.addEventListener('click', () => {
    window.electron?.closePlayerWindow?.();
  });
  return bar;
}

document.addEventListener('DOMContentLoaded', () => {
  const app = document.getElementById('app');
  if (!app) return;
  app.classList.add('app--player-window');

  const titlebar = renderPlayerTitlebar();
  const content = document.createElement('div');
  content.className = 'player-window__content';
  content.appendChild(renderWatch());

  app.appendChild(titlebar);
  app.appendChild(content);

  window.addEventListener('player-fullscreen', ((e: CustomEvent<boolean>) => {
    document.body.classList.toggle('player-fullscreen', e.detail === true);
  }) as EventListener);
});
