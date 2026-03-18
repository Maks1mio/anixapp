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

// ── Соединение ────────────────────────────────────────────────────────────────
export function renderConnectionTab(): HTMLElement {
  const wrap = document.createElement('div');

  if (typeof window.anixApi === 'undefined') {
    wrap.innerHTML = `<p class="settings-account-coming-soon">API доступно только в приложении Electron.</p>`;
    return wrap;
  }

  const section = document.createElement('div');
  section.className = 'settings-section';
  section.innerHTML = `
    <p class="settings-section__label">Эндпоинт API</p>
    <p style="font-size:0.8125rem;color:#737373;margin:0 0 12px;line-height:1.5;">
      Используется для всех запросов. После смены перезагрузка не требуется.
    </p>
    <div id="conn-endpoint-wrap">
      <div style="font-size:0.875rem;color:#737373;">Загрузка…</div>
    </div>
  `;
  wrap.appendChild(section);

  const container = section.querySelector('#conn-endpoint-wrap') as HTMLElement;

  window.anixApi.client
    .getBaseUrl()
    .then((currentBaseUrl) => {
      container.innerHTML = '';

      let currentValue = currentBaseUrl || ENDPOINT_OPTIONS[0].value;

      const selectEl = renderSelect({
        label: 'Эндпоинт API',
        placeholder: 'Выберите эндпоинт',
        value: currentValue,
        options: ENDPOINT_OPTIONS,
        onChange: (value) => {
          currentValue = value;
          window.anixApi?.client?.setBaseUrl(value);
          window.dispatchEvent(new CustomEvent('anix:offline'));
        },
      });
      container.appendChild(selectEl);

      const triggerText = selectEl.querySelector('.custom-select__trigger-text') as HTMLElement | null;

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

      void pingOnce();

      const pingInterval = window.setInterval(() => {
        if (!document.body.contains(selectEl)) {
          window.clearInterval(pingInterval);
          return;
        }
        void pingOnce();
      }, 1000);
    })
    .catch(() => {
      container.innerHTML = `<p style="font-size:0.875rem;color:#737373;">Не удалось загрузить текущий эндпоинт.</p>`;
    });

  return wrap;
}

// ── Внешний вид ───────────────────────────────────────────────────────────────
export function renderAppearanceTab(): HTMLElement {
  const wrap = document.createElement('div');

  const section = document.createElement('div');
  section.className = 'settings-section';
  section.innerHTML = `<p class="settings-section__label">Отображение карточек</p>`;
  wrap.appendChild(section);

  const currentLayout: CardLayout = getCardLayout();
  const layoutSelect = renderSelect({
    label: 'Вид карточек',
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
  section.appendChild(layoutSelect);

  return wrap;
}

// ── Поведение ─────────────────────────────────────────────────────────────────
export function renderBehaviorTab(): HTMLElement {
  const wrap = document.createElement('div');

  if (!window.electron?.getSettings) {
    wrap.innerHTML = `<p class="settings-account-coming-soon">Настройки поведения доступны только в приложении Electron.</p>`;
    return wrap;
  }

  void window.electron.getSettings().then((settings) => {
    let checked = settings.minimizeToTray;
    let accelChecked = settings.adaptiveAcceleration !== false;

    const section = document.createElement('div');
    section.className = 'settings-section';
    section.innerHTML = `<p class="settings-section__label">Окно</p>`;

    const body = document.createElement('div');
    body.className = 'settings-section__body';

    const row = document.createElement('div');
    row.className = 'settings-row';
    row.innerHTML = `
      <div class="settings-row__info">
        <div class="settings-row__label">Сворачивать в трей при закрытии</div>
        <div class="settings-row__desc">Окно скрывается в системный трей вместо выхода</div>
      </div>
      <div class="settings-row__control">
        <label class="settings-toggle-switch" aria-label="Сворачивать в трей">
          <input type="checkbox" id="settings-tray-toggle" ${checked ? 'checked' : ''}>
          <span class="settings-toggle-switch__track"></span>
          <span class="settings-toggle-switch__thumb"></span>
        </label>
      </div>
    `;

    const input = row.querySelector('#settings-tray-toggle') as HTMLInputElement;
    input.addEventListener('change', () => {
      checked = input.checked;
      window.electron?.saveSettings?.({ minimizeToTray: checked });
    });

    body.appendChild(row);

    const accelRow = document.createElement('div');
    accelRow.className = 'settings-row';
    accelRow.innerHTML = `
      <div class="settings-row__info">
        <div class="settings-row__label">Адаптивное ускорение</div>
        <div class="settings-row__desc">Использовать аппаратное ускорение (GPU). Может повысить производительность, но иногда вызывает артефакты. Требуется перезапуск.</div>
      </div>
      <div class="settings-row__control">
        <label class="settings-toggle-switch" aria-label="Адаптивное ускорение">
          <input type="checkbox" id="settings-accel-toggle" ${accelChecked ? 'checked' : ''}>
          <span class="settings-toggle-switch__track"></span>
          <span class="settings-toggle-switch__thumb"></span>
        </label>
      </div>
    `;
    const accelInput = accelRow.querySelector('#settings-accel-toggle') as HTMLInputElement;
    accelInput.addEventListener('change', () => {
      accelChecked = accelInput.checked;
      window.electron?.saveSettings?.({ adaptiveAcceleration: accelChecked });
    });
    body.appendChild(accelRow);

    section.appendChild(body);
    wrap.appendChild(section);
  });

  return wrap;
}

// ── Legacy export (backward compat) ──────────────────────────────────────────
/** @deprecated Используйте renderConnectionTab / renderAppearanceTab / renderBehaviorTab */
export function renderSettingsContent(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'settings-modal-content';
  wrap.appendChild(renderConnectionTab());
  wrap.appendChild(renderAppearanceTab());
  wrap.appendChild(renderBehaviorTab());
  return wrap;
}

export function renderSettings(): HTMLElement {
  const wrap = document.createElement('div');
  wrap.className = 'view view-settings';
  wrap.innerHTML = `<header class="settings-header"><h1 class="settings-title">Настройки</h1></header>`;
  wrap.appendChild(renderSettingsContent());
  return wrap;
}
