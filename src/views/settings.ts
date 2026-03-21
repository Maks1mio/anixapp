import { renderSelect } from '../components/select';
import { getCardLayout, setCardLayout, type CardLayout } from '../prefs';
import { navigate } from '../stores/navigation';
import {
  getAllThemes, getActiveThemeId, applyThemeById,
  createCustomTheme, deleteCustomTheme,
  BUILT_IN_THEMES, type Theme,
} from '../services/themes';

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

  // ── 1. Card layout toggle ─────────────────────────────────────────────────
  const cardSection = document.createElement('div');
  cardSection.className = 'settings-section';
  cardSection.innerHTML = `<p class="settings-section__label">Отображение карточек</p>`;

  const toggleWrap = document.createElement('div');
  toggleWrap.className = 'settings-card-layout-toggle';

  function makeLayoutBtn(value: CardLayout, label: string, iconHtml: string): HTMLButtonElement {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = `settings-card-layout-btn${getCardLayout() === value ? ' settings-card-layout-btn--active' : ''}`;
    btn.dataset['layout'] = value;
    btn.innerHTML = `
      <div class="settings-card-layout-btn__preview">${iconHtml}</div>
      <span>${label}</span>
    `;
    btn.addEventListener('click', () => {
      setCardLayout(value);
      toggleWrap.querySelectorAll('.settings-card-layout-btn').forEach(b => b.classList.remove('settings-card-layout-btn--active'));
      btn.classList.add('settings-card-layout-btn--active');
      const p = window.location.pathname + window.location.search;
      if (p === '/' || p.startsWith('/catalog') || p.startsWith('/search') || p.startsWith('/bookmarks')) {
        navigate(p);
      }
    });
    return btn;
  }

  const listIcon = `
    <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="8" y="10" width="28" height="6" rx="2" fill="currentColor" opacity="0.7"/>
      <rect x="8" y="20" width="28" height="6" rx="2" fill="currentColor" opacity="0.7"/>
      <rect x="8" y="30" width="28" height="6" rx="2" fill="currentColor" opacity="0.7"/>
    </svg>`;
  const gridIcon = `
    <svg viewBox="0 0 44 44" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect x="7"  y="7"  width="13" height="13" rx="2" fill="currentColor" opacity="0.7"/>
      <rect x="24" y="7"  width="13" height="13" rx="2" fill="currentColor" opacity="0.7"/>
      <rect x="7"  y="24" width="13" height="13" rx="2" fill="currentColor" opacity="0.7"/>
      <rect x="24" y="24" width="13" height="13" rx="2" fill="currentColor" opacity="0.7"/>
    </svg>`;

  toggleWrap.appendChild(makeLayoutBtn('wide', 'Списком', listIcon));
  toggleWrap.appendChild(makeLayoutBtn('mini', 'Карточками', gridIcon));
  cardSection.appendChild(toggleWrap);
  wrap.appendChild(cardSection);

  // ── 2. Built-in themes ────────────────────────────────────────────────────
  const themeSection = document.createElement('div');
  themeSection.className = 'settings-section';
  themeSection.innerHTML = `<p class="settings-section__label">Тема оформления</p>`;

  const builtInGrid = document.createElement('div');
  builtInGrid.className = 'settings-theme-grid';
  renderThemeTiles(builtInGrid, BUILT_IN_THEMES);
  themeSection.appendChild(builtInGrid);
  wrap.appendChild(themeSection);

  // ── 3. Custom themes ──────────────────────────────────────────────────────
  const customSection = document.createElement('div');
  customSection.className = 'settings-section';
  customSection.innerHTML = `<p class="settings-section__label">Пользовательские темы</p>`;

  const customGrid = document.createElement('div');
  customGrid.className = 'settings-theme-grid';

  const refreshCustomGrid = () => {
    customGrid.innerHTML = '';
    const customs = getAllThemes().filter(t => !t.builtIn);
    renderThemeTiles(customGrid, customs, true, refreshCustomGrid);
    // "+ Создать тему" tile
    const addTile = document.createElement('button');
    addTile.type = 'button';
    addTile.className = 'settings-theme-tile settings-theme-tile--add';
    addTile.innerHTML = `<span class="settings-theme-tile__plus">+</span><span>Создать тему</span>`;
    addTile.addEventListener('click', () => {
      const newTheme = createCustomTheme();
      refreshCustomGrid(); // show tile immediately before editor opens
      openThemeEditor(newTheme.id, true);
    });
    customGrid.appendChild(addTile);
  };
  refreshCustomGrid();

  // Listen for saves/deletes coming back from theme editor window
  window.addEventListener('anix:themeEditorSaved', ((e: CustomEvent) => {
    refreshCustomGrid();
    // Re-highlight active tile in built-in grid too
    builtInGrid.querySelectorAll('.settings-theme-tile').forEach(t => {
      const el = t as HTMLElement;
      el.classList.toggle('settings-theme-tile--active', el.dataset['themeId'] === getActiveThemeId());
    });
  }) as EventListener);

  window.addEventListener('anix:themeEditorDeleted', (() => {
    refreshCustomGrid();
  }) as EventListener);

  customSection.appendChild(customGrid);
  wrap.appendChild(customSection);

  return wrap;
}

// ── Theme tile renderer ───────────────────────────────────────────────────────
function renderThemeTiles(
  grid: HTMLElement,
  themes: Theme[],
  editable = false,
  onRefresh?: () => void,
): void {
  themes.forEach(theme => {
    const tile = document.createElement('button');
    tile.type = 'button';
    tile.className = `settings-theme-tile${theme.id === getActiveThemeId() ? ' settings-theme-tile--active' : ''}`;
    tile.dataset['themeId'] = theme.id;

    // Mini color preview
    const preview = document.createElement('div');
    preview.className = 'settings-theme-tile__preview';

    if (theme.id === 'auto') {
      // Split preview: left half dark, right half light
      preview.style.background = 'linear-gradient(to right, #1a1a1a 50%, #f0f0f0 50%)';
      preview.style.border = '1px solid #888';
      // Auto icon (sun/moon)
      preview.innerHTML = `<svg class="settings-theme-tile__auto-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <circle cx="12" cy="12" r="4"/>
        <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41"/>
        <path d="M12 2a10 10 0 0 1 0 20" stroke-dasharray="3 2" opacity=".4"/>
      </svg>`;
    } else {
      preview.style.background = theme.vars.colorSurface;
      preview.style.border = `1px solid ${theme.vars.colorBorder}`;

      const accent = document.createElement('div');
      accent.className = 'settings-theme-tile__accent';
      accent.style.background = theme.vars.colorAccent;
      preview.appendChild(accent);

      const bar1 = document.createElement('div');
      bar1.className = 'settings-theme-tile__bar';
      bar1.style.background = theme.vars.colorText;
      const bar2 = document.createElement('div');
      bar2.className = 'settings-theme-tile__bar settings-theme-tile__bar--short';
      bar2.style.background = theme.vars.colorTextMuted;
      preview.appendChild(bar1);
      preview.appendChild(bar2);
    }
    tile.appendChild(preview);

    // Active check
    const check = document.createElement('div');
    check.className = 'settings-theme-tile__check';
    check.innerHTML = `<svg viewBox="0 0 16 16" fill="none"><polyline points="3,8 6.5,11.5 13,5" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
    tile.appendChild(check);

    const name = document.createElement('span');
    name.className = 'settings-theme-tile__name';
    name.textContent = theme.name;
    tile.appendChild(name);

    // Edit/delete buttons for custom themes
    if (editable) {
      const actions = document.createElement('div');
      actions.className = 'settings-theme-tile__actions';

      const editBtn = document.createElement('button');
      editBtn.type = 'button';
      editBtn.className = 'settings-theme-tile__action-btn';
      editBtn.title = 'Редактировать';
      editBtn.innerHTML = `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><path d="M11 2l3 3-8.5 8.5L2 14l.5-3.5L11 2z"/></svg>`;
      editBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        openThemeEditor(theme.id, false);
      });

      actions.appendChild(editBtn);
      tile.appendChild(actions);
    }

    tile.addEventListener('click', () => {
      applyThemeById(theme.id);
      grid.closest('.settings-section')?.parentElement?.querySelectorAll('.settings-theme-tile').forEach(t => {
        (t as HTMLElement).classList.toggle('settings-theme-tile--active', (t as HTMLElement).dataset['themeId'] === theme.id);
      });
      // Also deselect built-in tiles when a custom is picked and vice versa
      document.querySelectorAll('.settings-theme-tile').forEach(t => {
        (t as HTMLElement).classList.toggle('settings-theme-tile--active', (t as HTMLElement).dataset['themeId'] === theme.id);
      });
    });

    grid.appendChild(tile);
  });
}

function openThemeEditor(themeId: string, isNew: boolean): void {
  const el = window.electron as { openThemeEditor?: (opts: object) => void } | undefined;
  el?.openThemeEditor?.({ themeId, isNew });
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

// ── Воспроизведение ───────────────────────────────────────────────────────────
const UPSCALE_MODES: { id: number; label: string; desc: string }[] = [
  { id: 14, label: 'ModeA [Preset]', desc: 'Быстрый пресет с умеренным восстановлением и апскейлом.' },
  { id: 15, label: 'ModeB [Preset]', desc: 'Сбалансированный пресет с акцентом на детализацию.' },
  { id: 16, label: 'ModeC [Preset]', desc: 'Качественный пресет с более агрессивным улучшением.' },
  { id: 17, label: 'ModeA+A [Preset]', desc: 'Расширенный ModeA с дополнительной обработкой.' },
  { id: 18, label: 'ModeB+B [Preset]', desc: 'Улучшенный ModeB, обеспечивает более высокое качество.' },
  { id: 19, label: 'ModeC+A [Preset]', desc: 'Комбинированный пресет с высокой чёткостью и восстановлением.' },
  { id: 0, label: 'DoG [Deblur]', desc: 'Удаление размытия и усиление границ с помощью фильтра разности Гауссиан.' },
  { id: 1, label: 'BilateralMean [Denoise]', desc: 'Снижение шума без потери резкости с помощью билинейного среднего.' },
  { id: 2, label: 'CNNM [Restore]', desc: 'Нейросетевое восстановление с умеренной глубиной, хорошо для общего улучшения.' },
  { id: 3, label: 'CNNSoftM [Restore]', desc: 'Более мягкое восстановление, минимизирующее артефакты и перегибы.' },
  { id: 4, label: 'CNNSoftVLM [Restore]', desc: 'Очень лёгкое и мягкое восстановление, подходит для слабых устройств.' },
  { id: 5, label: 'CNNVL [Restore]', desc: 'Восстановление с малой задержкой и быстрой обработкой.' },
  { id: 6, label: 'CNNUL [Restore]', desc: 'Универсальное восстановление с акцентом на стабильность.' },
  { id: 7, label: 'GANUUL [Restore]', desc: 'GAN-реконструкция изображения для высокого качества.' },
  { id: 8, label: 'CNNx2M [Upscale]', desc: 'Апскейл ×2 с сохранением структуры кадра.' },
  { id: 9, label: 'CNNx2VL [Upscale]', desc: 'Быстрый апскейл ×2 для слабых систем.' },
  { id: 10, label: 'DenoiseCNNx2VL [Upscale]', desc: 'Апскейл ×2 с предварительным шумоподавлением.' },
  { id: 11, label: 'CNNx2UL [Upscale]', desc: 'Универсальный сбалансированный апскейл ×2.' },
  { id: 12, label: 'GANx3L [Upscale]', desc: 'GAN апскейл ×3 для высокого качества.' },
  { id: 13, label: 'GANx4UUL [Upscale]', desc: 'GAN апскейл ×4 — максимальное качество.' },
];

export function renderPlaybackTab(): HTMLElement {
  const wrap = document.createElement('div');

  if (!window.electron?.getSettings) {
    wrap.innerHTML = `<p class="settings-account-coming-soon">Настройки воспроизведения доступны только в приложении Electron.</p>`;
    return wrap;
  }

  const gpuAvailable = typeof navigator.gpu !== 'undefined';

  void window.electron.getSettings().then((settings) => {
    let upscaleEnabled = (settings as { upscaleEnabled?: boolean; upscaleMode?: number }).upscaleEnabled ?? false;
    let upscaleMode = (settings as { upscaleEnabled?: boolean; upscaleMode?: number }).upscaleMode ?? 15;

    const section = document.createElement('div');
    section.className = 'settings-section';
    section.innerHTML = `<p class="settings-section__label">Улучшение качества (Anime4K / WebGPU)</p>`;

    const body = document.createElement('div');
    body.className = 'settings-section__body';

    if (!gpuAvailable) {
      const notice = document.createElement('div');
      notice.className = 'settings-upscale-notice settings-upscale-notice--warn';
      notice.innerHTML = `
        <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
          <circle cx="10" cy="10" r="8"/><line x1="10" y1="6" x2="10" y2="10.5"/><circle cx="10" cy="13.5" r=".7" fill="currentColor" stroke="none"/>
        </svg>
        <span>Ваш GPU не поддерживает WebGPU — улучшение качества недоступно.</span>
      `;
      body.appendChild(notice);
    }

    // Info box
    const infoBox = document.createElement('div');
    infoBox.className = 'settings-upscale-notice';
    infoBox.innerHTML = `
      <svg viewBox="0 0 20 20" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round">
        <circle cx="10" cy="10" r="8"/><line x1="10" y1="9" x2="10" y2="14"/><circle cx="10" cy="6.5" r=".7" fill="currentColor" stroke="none"/>
      </svg>
      <span>Технология Anime4K улучшает видео в реальном времени, используя WebGPU. Она повышает резкость, убирает шум и улучшает общую чёткость изображения. Не добавляет новых деталей — улучшает уже имеющиеся.</span>
    `;
    body.appendChild(infoBox);

    // Toggle row
    const toggleRow = document.createElement('div');
    toggleRow.className = 'settings-row';
    toggleRow.innerHTML = `
      <div class="settings-row__info">
        <div class="settings-row__label">Включить улучшение качества</div>
        <div class="settings-row__desc">Активирует улучшение через GPU с использованием WebGPU и Anime4K.</div>
      </div>
      <div class="settings-row__control">
        <label class="settings-toggle-switch" aria-label="Улучшение качества">
          <input type="checkbox" id="upscale-toggle" ${upscaleEnabled ? 'checked' : ''} ${!gpuAvailable ? 'disabled' : ''}>
          <span class="settings-toggle-switch__track"></span>
          <span class="settings-toggle-switch__thumb"></span>
        </label>
      </div>
    `;
    body.appendChild(toggleRow);

    const toggleInput = toggleRow.querySelector('#upscale-toggle') as HTMLInputElement;

    // Mode select
    const modeSection = document.createElement('div');
    modeSection.className = 'settings-section';
    modeSection.innerHTML = `<p class="settings-section__label">Режим улучшения</p>`;

    const modeSelectEl = renderSelect({
      options: UPSCALE_MODES.map(m => ({ value: String(m.id), label: m.label, desc: m.desc })),
      value: String(upscaleMode),
      onChange: (value) => {
        upscaleMode = Number(value);
        window.electron?.saveSettings?.({ upscaleEnabled, upscaleMode } as Parameters<typeof window.electron.saveSettings>[0]);
        window.electron?.sendUpscaleSettings?.({ upscaleEnabled, upscaleMode });
        window.dispatchEvent(new CustomEvent('anix:upscaleChanged', { detail: { upscaleEnabled, upscaleMode } }));
      },
    });

    const setModeSelectDisabled = (disabled: boolean) => {
      const btn = modeSelectEl.querySelector<HTMLButtonElement>('.custom-select__trigger');
      if (btn) btn.disabled = disabled;
      modeSelectEl.classList.toggle('custom-select--disabled', disabled);
    };
    setModeSelectDisabled(!gpuAvailable || !upscaleEnabled);

    toggleInput.addEventListener('change', () => {
      upscaleEnabled = toggleInput.checked;
      setModeSelectDisabled(!upscaleEnabled || !gpuAvailable);
      window.electron?.saveSettings?.({ upscaleEnabled, upscaleMode } as Parameters<typeof window.electron.saveSettings>[0]);
      window.electron?.sendUpscaleSettings?.({ upscaleEnabled, upscaleMode });
      window.dispatchEvent(new CustomEvent('anix:upscaleChanged', { detail: { upscaleEnabled, upscaleMode } }));
    });

    modeSection.appendChild(modeSelectEl);

    // Preview tool button
    const toolSection = document.createElement('div');
    toolSection.className = 'settings-section';
    toolSection.innerHTML = `<p class="settings-section__label">Инструменты разработки</p>`;
    const toolBody = document.createElement('div');
    toolBody.className = 'settings-section__body';
    const toolRow = document.createElement('div');
    toolRow.className = 'settings-row';
    toolRow.innerHTML = `
      <div class="settings-row__info">
        <div class="settings-row__label">Предпросмотр моделей</div>
        <div class="settings-row__desc">Открыть инструмент сравнения — 5 пресетов аниме, split-ползунок для сравнения оригинала и фильтра в реальном времени.</div>
      </div>
      <div class="settings-row__control">
        <button class="settings-btn settings-btn--primary" id="open-upscale-tool">Открыть</button>
      </div>
    `;
    const toolBtn = toolRow.querySelector('#open-upscale-tool') as HTMLButtonElement;
    toolBtn.addEventListener('click', () => {
      (window.electron as { openUpscaleTool?: () => void })?.openUpscaleTool?.();
    });
    toolBody.appendChild(toolRow);
    toolSection.appendChild(toolBody);

    section.appendChild(body);
    wrap.appendChild(section);
    wrap.appendChild(modeSection);
    wrap.appendChild(toolSection);
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
