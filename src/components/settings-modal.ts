/**
 * Модальное окно настроек (в стиле Discord).
 * Содержит форму настроек и ссылку на переход в UI Kit.
 */

import { navigate } from '../app';
import { renderSettingsContent } from '../views/settings';

export function openSettingsModal(onClose: () => void): void {
  const overlay = document.createElement('div');
  overlay.className = 'settings-modal-overlay';
  overlay.setAttribute('role', 'dialog');
  overlay.setAttribute('aria-modal', 'true');
  overlay.setAttribute('aria-label', 'Настройки');

  const panel = document.createElement('div');
  panel.className = 'settings-modal-panel';

  panel.innerHTML = `
    <div class="settings-modal__header">
      <h2 class="settings-modal__title">Настройки</h2>
      <button type="button" class="settings-modal__close" aria-label="Закрыть"></button>
    </div>
    <div class="settings-modal__body"></div>
  `;

  const body = panel.querySelector('.settings-modal__body') as HTMLElement;
  const settingsContent = renderSettingsContent();
  body.appendChild(settingsContent);

  // Блок перехода в UI Kit
  const uikitBlock = document.createElement('div');
  uikitBlock.className = 'settings-modal__uikit';
  uikitBlock.innerHTML = `
    <p class="settings-modal__uikit-desc">Интерфейс компонентов и стилей приложения.</p>
    <a href="/uikit" class="settings-modal__uikit-link" data-nav-uikit>Открыть UI Kit</a>
  `;
  body.appendChild(uikitBlock);

  overlay.appendChild(panel);
  document.body.appendChild(overlay);

  requestAnimationFrame(() => overlay.classList.add('settings-modal-overlay--open'));

  let closed = false;
  function close() {
    if (closed) return;
    closed = true;
    overlay.classList.remove('settings-modal-overlay--open');
    overlay.classList.add('settings-modal-overlay--closing');
    const done = () => {
      if (!overlay.parentNode) return;
      overlay.remove();
      document.removeEventListener('keydown', onKey);
      onClose();
    };
    overlay.addEventListener('transitionend', done, { once: true });
    setTimeout(done, 320);
  }
  const onKey = (e: KeyboardEvent) => {
    if (e.key === 'Escape') close();
  };
  document.addEventListener('keydown', onKey);

  panel.querySelector('.settings-modal__close')?.addEventListener('click', close);
  overlay.addEventListener('click', (e) => {
    if (e.target === overlay) close();
  });

  uikitBlock.querySelector('[data-nav-uikit]')?.addEventListener('click', (e) => {
    e.preventDefault();
    close();
    navigate('/uikit');
  });
}
