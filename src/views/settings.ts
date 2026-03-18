import { renderSelect } from '../components/select';
import { getCardLayout, setCardLayout, type CardLayout } from '../prefs';
import { navigate } from '../app';

const ENDPOINT_OPTIONS = [
  { value: 'https://api-s.anixsekai.com', label: 'api-s.anixsekai.com' },
  { value: 'https://api.anixart.app', label: 'api.anixart.app' },
  { value: 'https://api.anixart.tv', label: 'api.anixart.tv (Заблокирован в РФ)' },
  // Специальный фейковый эндпоинт для проверки поведения при недоступном сервере.
  { value: 'https://api.fake-anixapp.invalid', label: 'api.fake-anixapp.invalid (пример недоступного сервера)' },
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
    <div class="settings-section" id="settings-behavior-wrap"></div>
  `;

  const endpointContainer = wrap.querySelector('#settings-endpoint-wrap') as HTMLElement;
  const endpointLoadEl = wrap.querySelector('#settings-endpoint-load') as HTMLElement;
  const cardsContainer = wrap.querySelector('#settings-cards-wrap') as HTMLElement;
  const cardsLoadEl = wrap.querySelector('#settings-cards-load') as HTMLElement;

  if (typeof window.anixApi === 'undefined') {
    endpointLoadEl.textContent = 'API доступно только в приложении Electron.';
    cardsLoadEl.textContent = 'Настройки карточек доступны только в приложении.';
    return wrap;
  }

  window.anixApi.client
    .getBaseUrl()
    .then((currentBaseUrl) => {
      endpointLoadEl.remove();

      let currentValue = currentBaseUrl || ENDPOINT_OPTIONS[0].value;

      const selectEl = renderSelect({
        label: 'Эндпоинт API',
        placeholder: 'Выберите эндпоинт',
        value: currentValue,
        options: ENDPOINT_OPTIONS,
        onChange: (value) => {
          currentValue = value;
          window.anixApi?.client?.setBaseUrl(value);
          // После смены эндпоинта сразу показываем экран проверки соединения,
          // чтобы пользователь видел процесс переподключения.
          window.dispatchEvent(new CustomEvent('anix:offline'));
        },
      });
      endpointContainer.appendChild(selectEl);

      const triggerText = selectEl.querySelector('.custom-select__trigger-text') as HTMLElement | null;

      // Базовые подписи без пинга (чтобы не накапливать " — xxx мс")
      const baseLabels: Record<string, string> = {};
      ENDPOINT_OPTIONS.forEach((o) => {
        baseLabels[o.value] = o.label;
      });

      type PingState = { ok: boolean; latencyMs: number | null };
      const state: Record<string, PingState> = {};

      function formatLabel(value: string): { host: string; suffix: string | null } {
        const base = baseLabels[value] ?? value;
        const s = state[value];
        if (!s) return { host: base, suffix: null };
        if (s.ok && typeof s.latencyMs === 'number') {
          return { host: base, suffix: `${s.latencyMs} мс` };
        }
        if (!s.ok) {
          return { host: base, suffix: 'недоступен' };
        }
        return { host: base, suffix: null };
      }

      function qualityFor(value: string): string {
        const s = state[value];
        if (!s || !s.ok || typeof s.latencyMs !== 'number') return s && !s.ok ? 'offline' : '';
        const ms = s.latencyMs;
        if (ms < 150) return 'good';
        if (ms < 300) return 'medium';
        return 'bad';
      }

      function updateDisplay() {
        ENDPOINT_OPTIONS.forEach((opt) => {
          const { host, suffix } = formatLabel(opt.value);
          const quality = qualityFor(opt.value);
          const optionEls = document.querySelectorAll<HTMLElement>(
            `.custom-select__option[data-value="${CSS.escape(opt.value)}"]`,
          );
          optionEls.forEach((el) => {
            el.innerHTML = suffix
              ? `<span class="endpoint-option__host">${host}</span><span class="endpoint-option__ping">${suffix}</span>`
              : `<span class="endpoint-option__host">${host}</span>`;
            if (quality) el.dataset.latencyQuality = quality;
            else delete el.dataset.latencyQuality;
          });
          if (opt.value === currentValue && triggerText) {
            triggerText.innerHTML = suffix
              ? `<span class="endpoint-option__host">${host}</span><span class="endpoint-option__ping">${suffix}</span>`
              : `<span class="endpoint-option__host">${host}</span>`;
          }
        });
      }

      async function pingOnce() {
        await Promise.all(
          ENDPOINT_OPTIONS.map(async (opt) => {
            try {
              const res = await window.anixApi!.client.pingBaseUrl(opt.value);
              state[opt.value] = res;
            } catch {
              state[opt.value] = { ok: false, latencyMs: null };
            }
          }),
        );
        updateDisplay();
      }

      // Первый замер сразу при открытии настроек
      void pingOnce();

      // Обновляем пинг примерно раз в секунду, пока открыт селект.
      const pingInterval = window.setInterval(() => {
        if (!document.body.contains(selectEl)) {
          window.clearInterval(pingInterval);
          return;
        }
        void pingOnce();
      }, 1000);
    })
    .catch(() => {
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
      // Перерисовываем страницы, которые зависят от раскладки карточек
      if (
        path === '/'
        || path.startsWith('/catalog')
        || path.startsWith('/search')
        || path.startsWith('/bookmarks')
      ) {
        navigate(path);
      }
    },
  });
  cardsContainer.appendChild(layoutSelect);

  // ——— Поведение при закрытии (minimizeToTray) ———
  const behaviorContainer = wrap.querySelector('#settings-behavior-wrap') as HTMLElement;

  if (window.electron?.getSettings) {
    void window.electron.getSettings().then((settings) => {
      const toggleRow = document.createElement('div');
      toggleRow.className = 'settings-toggle';

      let checked = settings.minimizeToTray;

      toggleRow.innerHTML = `
        <div class="settings-toggle__info">
          <div class="settings-toggle__label">Сворачивать в трей при закрытии</div>
          <div class="settings-toggle__desc">Если включено — окно скрывается в системный трей вместо выхода</div>
        </div>
        <label class="settings-toggle__switch" aria-label="Сворачивать в трей">
          <input type="checkbox" id="toggle-minimize-tray" ${checked ? 'checked' : ''}>
          <span class="settings-toggle__switch-track"></span>
          <span class="settings-toggle__switch-thumb"></span>
        </label>
      `;

      const input = toggleRow.querySelector('#toggle-minimize-tray') as HTMLInputElement;
      input.addEventListener('change', () => {
        checked = input.checked;
        window.electron?.saveSettings?.({ minimizeToTray: checked });
      });

      behaviorContainer.appendChild(toggleRow);
    });
  }

  return wrap;
}

export function renderSettings(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'view view-settings';
  wrap.innerHTML = `<header class="settings-header"><h1 class="settings-title">Настройки</h1></header>`;
  wrap.appendChild(renderSettingsContent());
  return wrap;
}
