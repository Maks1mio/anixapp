import { renderSelect } from '../components/select';
import { getCardLayout, setCardLayout, type CardLayout } from '../prefs';
import { navigate } from '../app';

const ENDPOINT_OPTIONS = [
  { value: 'https://api-s.anixsekai.com', label: 'api-s.anixsekai.com' },
  { value: 'https://api.anixart.app', label: 'api.anixart.app' },
  { value: 'https://api.anixart.tv', label: 'api.anixart.tv (Заблокирован в РФ)' },
];

/** Контент настроек для модального окна (без обёртки страницы). */
export function renderSettingsContent(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'settings-modal-content';

  wrap.innerHTML = `
    <p class="settings-modal-content__desc">Эндпоинт API используется для всех запросов. После смены перезагрузка не требуется.</p>
    <div class="settings-section" id="settings-endpoint-wrap">
      <div class="settings-loading" id="settings-endpoint-load">Загрузка…</div>
    </div>
    <div class="settings-section" id="settings-cards-wrap">
      <div class="settings-loading" id="settings-cards-load">Загрузка…</div>
    </div>
  `;

  const endpointContainer = wrap.querySelector('#settings-endpoint-wrap') as HTMLElement;
  const endpointLoadEl = wrap.querySelector('#settings-endpoint-load') as HTMLElement;
  const cardsContainer = wrap.querySelector('#settings-cards-wrap') as HTMLElement;
  const cardsLoadEl = wrap.querySelector('#settings-cards-load') as HTMLElement;

  if (typeof window.anix === 'undefined') {
    endpointLoadEl.textContent = 'API доступно только в приложении Electron.';
    cardsLoadEl.textContent = 'Настройки карточек доступны только в приложении.';
    return wrap;
  }

  window.anix.getBaseUrl().then((currentBaseUrl) => {
    endpointLoadEl.remove();
    const selectEl = renderSelect({
      label: 'Эндпоинт API',
      placeholder: 'Выберите эндпоинт',
      value: currentBaseUrl || ENDPOINT_OPTIONS[0].value,
      options: ENDPOINT_OPTIONS,
      onChange: (value) => {
        window.anix?.setBaseUrl(value);
      },
    });
    endpointContainer.appendChild(selectEl);
  }).catch(() => {
    endpointLoadEl.textContent = 'Не удалось загрузить текущий эндпоинт.';
  });

  // Настройки отображения карточек
  const currentLayout: CardLayout = getCardLayout();
  cardsLoadEl.remove();
  const layoutSelect = renderSelect({
    label: 'Отображение карточек',
    placeholder: 'Выберите вариант',
    value: currentLayout,
    options: [
      { value: 'wide', label: 'Широкая карточка (список)' },
      { value: 'mini', label: 'Мини-карточка (сетка)' },
    ],
    onChange: (value) => {
      const v = value === 'mini' ? 'mini' : 'wide';
      setCardLayout(v);
      const path = window.location.pathname + window.location.search;
      if (path.startsWith('/catalog') || path.startsWith('/search')) {
        navigate(path);
      }
    },
  });
  cardsContainer.appendChild(layoutSelect);

  return wrap;
}

export function renderSettings(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'view view-settings';
  wrap.innerHTML = `<header class="settings-header"><h1 class="settings-title">Настройки</h1></header>`;
  wrap.appendChild(renderSettingsContent());
  return wrap;
}
