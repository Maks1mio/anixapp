<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { get } from 'svelte/store';
  import Page from './Page.svelte';
  import { navigate } from '../stores/navigation';
  import { settingsModalInitialTab } from '../stores/modals';
  import {
    renderConnectionTab,
    renderAppearanceTab,
    renderBehaviorTab,
    renderPlaybackTab,
  } from '../views/settings';
  import {
    createIcons,
    User,
    Palette,
    Globe,
    SlidersHorizontal,
    Info,
    LayoutGrid,
    LogOut,
    Star,
    ExternalLink,
    Pencil,
    Github,
    Tv,
    ScrollText,
  } from 'lucide';

  interface Props {
    onClose: () => void;
  }

  const { onClose }: Props = $props();

  export type SettingsTab = 'account' | 'appearance' | 'connection' | 'behavior' | 'playback' | 'uikit' | 'about' | 'logs';

  const TAB_TITLES: Record<SettingsTab, string> = {
    account:    'Моя учётная запись',
    appearance: 'Внешний вид',
    connection: 'Соединение',
    behavior:   'Поведение',
    playback:   'Воспроизведение',
    uikit:      'UI Kit',
    about:      'О программе',
    logs:       'Журнал событий',
  };

  const PRIVACY_OPTIONS = [
    { value: '0', label: 'Все' },
    { value: '1', label: 'Только друзья' },
    { value: '2', label: 'Только я' },
  ];

  const PRIVACY_FRIEND_REQUEST_OPTIONS = [
    { value: '0', label: 'Все' },
    { value: '1', label: 'Только я' },
  ];

  const isDev = import.meta.env.DEV;

  const initialTab = get(settingsModalInitialTab) as SettingsTab | null;
  let activeTab = $state<SettingsTab>(initialTab ?? 'appearance');
  let bodyEl = $state<HTMLElement | null>(null);
  let overlayEl = $state<HTMLElement | null>(null);
  let sidebarScrollEl = $state<HTMLElement | null>(null);

  const profile = (window as any).__anixProfile as { id?: number; login?: string; avatar?: string | null } | undefined;
  const loginDisplay = profile?.login ?? '—';
  const avatarStyle = profile?.avatar ? `background-image: url('${profile.avatar}')` : '';

  function esc(s: string): string {
    const d = document.createElement('div');
    d.textContent = s;
    return d.innerHTML;
  }

  function initIcons(root: HTMLElement): void {
    createIcons({
      icons: { User, Palette, Globe, SlidersHorizontal, Info, LayoutGrid, LogOut, Star, ExternalLink, Pencil, Github, Tv, ScrollText },
      root,
    });
  }

  // ── Account tab ────────────────────────────────────────────────────────────────
  function renderAccountTab(): HTMLElement {
    const el = document.createElement('div');
    const avatarStyleStr = profile?.avatar ? `background-image: url('${esc(profile.avatar)}')` : '';
    const username = profile?.login ? esc(profile.login) : '—';
    const idText = profile?.id ? `ID: ${profile.id}` : '';

    el.innerHTML = `
      <div class="settings-account-card">
        <div class="settings-account-card__banner"></div>
        <div class="settings-account-card__body">
          <div class="settings-account-card__avatar-wrap">
            <div class="settings-account-card__avatar" style="${avatarStyleStr}"></div>
          </div>
          <div class="settings-account-card__info">
            <p class="settings-account-card__name">${username}</p>
            ${idText ? `<p class="settings-account-card__meta">${idText}</p>` : ''}
          </div>
        </div>
      </div>
      <div id="settings-profile-edit">
        <div style="font-size:0.875rem;color:#737373;padding:14px 0;">Загрузка настроек профиля…</div>
      </div>
    `;

    const container = el.querySelector('#settings-profile-edit') as HTMLElement;

    if (typeof window.anixApi?.settings?.getProfileSettings !== 'function') {
      container.innerHTML = `<div class="settings-account-coming-soon">Редактирование профиля доступно только в приложении Electron.</div>`;
      return el;
    }

    Promise.all([
      window.anixApi.settings.getProfileSettings(),
      window.anixApi.settings.getSocial(),
    ])
      .then(([settings, social]) => {
        container.innerHTML = '';

        // Nickname section
        renderLoginSection(container);

        // Status section
        const statusSection = document.createElement('div');
        statusSection.className = 'settings-section';
        statusSection.innerHTML = `<p class="settings-section__label">Статус</p>`;
        const statusBody = document.createElement('div');
        statusBody.className = 'settings-section__body';
        const statusRow = document.createElement('div');
        statusRow.className = 'settings-row settings-row--column';
        statusRow.innerHTML = `
          <div class="settings-input-group">
            <input type="text" class="settings-input" id="sp-status"
                   placeholder="Введите статус…" maxlength="150"
                   value="${esc(settings.status || '')}">
            <button class="settings-btn settings-btn--primary" id="sp-status-save">Сохранить</button>
          </div>
          <div class="settings-feedback" id="sp-status-fb"></div>
        `;
        statusBody.appendChild(statusRow);
        statusSection.appendChild(statusBody);
        container.appendChild(statusSection);

        const statusInput = statusRow.querySelector('#sp-status') as HTMLInputElement;
        const statusSaveBtn = statusRow.querySelector('#sp-status-save') as HTMLButtonElement;
        const statusFb = statusRow.querySelector('#sp-status-fb') as HTMLElement;

        statusSaveBtn.addEventListener('click', async () => {
          statusSaveBtn.disabled = true;
          statusFb.textContent = '';
          try {
            await window.anixApi.settings.setStatus(statusInput.value.trim());
            statusFb.textContent = 'Статус обновлён';
            statusFb.className = 'settings-feedback settings-feedback--ok';
          } catch {
            statusFb.textContent = 'Ошибка при сохранении';
            statusFb.className = 'settings-feedback settings-feedback--err';
          }
          statusSaveBtn.disabled = false;
        });

        // Social links section
        const socialSection = document.createElement('div');
        socialSection.className = 'settings-section';
        socialSection.innerHTML = `<p class="settings-section__label">Социальные сети</p>`;
        const socialBody = document.createElement('div');
        socialBody.className = 'settings-section__body';

        const socialFields: { key: string; label: string; placeholder: string }[] = [
          { key: 'vk_page', label: 'VK', placeholder: 'Логин VK' },
          { key: 'tg_page', label: 'Telegram', placeholder: 'Юзернейм Telegram' },
          { key: 'inst_page', label: 'Instagram', placeholder: 'Юзернейм Instagram' },
          { key: 'tt_page', label: 'TikTok', placeholder: 'Юзернейм TikTok' },
          { key: 'discord_page', label: 'Discord', placeholder: 'Юзернейм Discord' },
        ];
        const socialData: Record<string, string> = {
          vk_page: social.vk_page || '',
          tg_page: social.tg_page || '',
          inst_page: social.inst_page || '',
          tt_page: social.tt_page || '',
          discord_page: (social as any).discord_page || '',
        };

        socialFields.forEach((f) => {
          const row = document.createElement('div');
          row.className = 'settings-row';
          row.innerHTML = `
            <div class="settings-row__info"><div class="settings-row__label">${f.label}</div></div>
            <div class="settings-row__control settings-row__control--wide">
              <input type="text" class="settings-input settings-input--sm"
                     data-social-key="${f.key}" placeholder="${f.placeholder}"
                     value="${esc(socialData[f.key])}">
            </div>
          `;
          socialBody.appendChild(row);
        });

        const socialBtnRow = document.createElement('div');
        socialBtnRow.className = 'settings-row settings-row--end';
        socialBtnRow.innerHTML = `
          <button class="settings-btn settings-btn--primary" id="sp-social-save">Сохранить</button>
          <div class="settings-feedback" id="sp-social-fb"></div>
        `;
        socialBody.appendChild(socialBtnRow);
        socialSection.appendChild(socialBody);
        container.appendChild(socialSection);

        const socialSaveBtn = socialBtnRow.querySelector('#sp-social-save') as HTMLButtonElement;
        const socialFb = socialBtnRow.querySelector('#sp-social-fb') as HTMLElement;
        socialSaveBtn.addEventListener('click', async () => {
          socialSaveBtn.disabled = true;
          socialFb.textContent = '';
          const inputs = socialBody.querySelectorAll<HTMLInputElement>('[data-social-key]');
          const payload: Record<string, string> = {};
          inputs.forEach((inp) => { payload[inp.dataset.socialKey!] = inp.value.trim(); });
          try {
            const res = await window.anixApi.settings.setSocial(payload as any);
            if (res.code === 0) {
              socialFb.textContent = 'Соц. сети обновлены';
              socialFb.className = 'settings-feedback settings-feedback--ok';
            } else {
              const errMap: Record<number, string> = { 2: 'Некорректный VK', 3: 'Некорректный Telegram', 4: 'Некорректный Instagram', 5: 'Некорректный TikTok', 6: 'Некорректный Discord' };
              socialFb.textContent = errMap[res.code ?? -1] || 'Ошибка валидации';
              socialFb.className = 'settings-feedback settings-feedback--err';
            }
          } catch {
            socialFb.textContent = 'Ошибка при сохранении';
            socialFb.className = 'settings-feedback settings-feedback--err';
          }
          socialSaveBtn.disabled = false;
        });

        // Privacy section — import renderSelect lazily to avoid circular deps
        import('./select').then(({ renderSelect }) => {
          const privacySection = document.createElement('div');
          privacySection.className = 'settings-section';
          privacySection.innerHTML = `
            <p class="settings-section__label">Приватность</p>
            <p class="settings-section__desc">Кто может видеть вашу информацию.</p>
          `;
          const privacyBody = document.createElement('div');
          privacyBody.className = 'settings-section__body';

          const privacyItems: { label: string; desc: string; value: number; setter: (s: number) => Promise<unknown>; options: typeof PRIVACY_OPTIONS }[] = [
            { label: 'Статистика просмотров', desc: 'Динамика просмотров, избранное', value: settings.privacy_stats, setter: (s) => window.anixApi.settings.setPrivacyStats(s), options: PRIVACY_OPTIONS },
            { label: 'Счётчики', desc: 'Количество друзей, закладок', value: settings.privacy_counts, setter: (s) => window.anixApi.settings.setPrivacyCounts(s), options: PRIVACY_OPTIONS },
            { label: 'Социальные сети', desc: 'Ваши ссылки на соц. сети', value: settings.privacy_social, setter: (s) => window.anixApi.settings.setPrivacySocial(s), options: PRIVACY_OPTIONS },
            { label: 'Заявки в друзья', desc: 'Кто может отправлять вам заявки', value: settings.privacy_friend_requests, setter: (s) => window.anixApi.settings.setPrivacyFriendRequests(s), options: PRIVACY_FRIEND_REQUEST_OPTIONS },
          ];

          privacyItems.forEach((item) => {
            const row = document.createElement('div');
            row.className = 'settings-row';
            const info = document.createElement('div');
            info.className = 'settings-row__info';
            info.innerHTML = `<div class="settings-row__label">${item.label}</div><div class="settings-row__desc">${item.desc}</div>`;
            row.appendChild(info);
            const ctrl = document.createElement('div');
            ctrl.className = 'settings-row__control settings-row__control--wide';
            const sel = renderSelect({
              placeholder: '—',
              value: String(item.value),
              options: item.options,
              onChange: (val) => { void item.setter(Number(val)); },
            });
            ctrl.appendChild(sel);
            row.appendChild(ctrl);
            privacyBody.appendChild(row);
          });

          privacySection.appendChild(privacyBody);
          container.appendChild(privacySection);
        });
      })
      .catch(() => {
        container.innerHTML = `<div class="settings-account-coming-soon">Не удалось загрузить настройки профиля.</div>`;
      });

    return el;
  }

  function renderLoginSection(container: HTMLElement): void {
    if (typeof window.anixApi?.settings?.getLoginInfo !== 'function') return;

    const section = document.createElement('div');
    section.className = 'settings-section';
    section.innerHTML = `<p class="settings-section__label">Никнейм</p>`;
    const body = document.createElement('div');
    body.className = 'settings-section__body';
    const row = document.createElement('div');
    row.className = 'settings-row settings-row--column';
    row.innerHTML = `<div style="font-size:0.8125rem;color:var(--color-text-muted,#737373);">Загрузка…</div>`;
    body.appendChild(row);
    section.appendChild(body);
    container.appendChild(section);

    window.anixApi.settings.getLoginInfo().then((info: any) => {
      row.innerHTML = '';
      if (!info.is_change_avaliable) {
        const nextDate = info.next_change_avaliable_at
          ? new Date(info.next_change_avaliable_at * 1000).toLocaleDateString('ru-RU')
          : '—';
        row.innerHTML = `
          <div class="settings-row__info">
            <div class="settings-row__label">Текущий никнейм: <strong>${esc(info.login)}</strong></div>
            <div class="settings-row__desc">Смена никнейма будет доступна: ${nextDate}</div>
          </div>
        `;
        return;
      }
      row.innerHTML = `
        <div class="settings-input-group">
          <input type="text" class="settings-input" id="sp-login" placeholder="Новый никнейм" maxlength="30" value="${esc(info.login)}">
          <button class="settings-btn settings-btn--primary" id="sp-login-save">Изменить</button>
        </div>
        <div class="settings-row__desc" style="margin-top:4px;">Никнейм можно менять раз в 30 дней.</div>
        <div class="settings-feedback" id="sp-login-fb"></div>
      `;
      const loginInput = row.querySelector('#sp-login') as HTMLInputElement;
      const loginSaveBtn = row.querySelector('#sp-login-save') as HTMLButtonElement;
      const loginFb = row.querySelector('#sp-login-fb') as HTMLElement;

      loginSaveBtn.addEventListener('click', async () => {
        const newLogin = loginInput.value.trim();
        if (!newLogin || newLogin === info.login) return;
        loginSaveBtn.disabled = true;
        loginFb.textContent = '';
        try {
          const res = await window.anixApi.settings.changeLogin(newLogin);
          if (res.code === 0) {
            loginFb.textContent = 'Никнейм изменён';
            loginFb.className = 'settings-feedback settings-feedback--ok';
            const p = (window as any).__anixProfile;
            if (p) p.login = newLogin;
          } else {
            const errMap: Record<number, string> = { 2: 'Некорректный никнейм', 3: 'Никнейм уже занят', 4: 'Смена никнейма ещё недоступна' };
            loginFb.textContent = errMap[res.code ?? -1] || 'Ошибка';
            loginFb.className = 'settings-feedback settings-feedback--err';
          }
        } catch {
          loginFb.textContent = 'Ошибка при сохранении';
          loginFb.className = 'settings-feedback settings-feedback--err';
        }
        loginSaveBtn.disabled = false;
      });
    }).catch(() => {
      row.innerHTML = `<div class="settings-row__desc">Не удалось загрузить информацию.</div>`;
    });
  }

  // ── Logs tab ───────────────────────────────────────────────────────────────
  function renderLogsTab(): void {
    if (!bodyEl) return;

    // State
    let currentSession = '';
    let currentFile    = 'errors';
    let levelFilter    = 'ALL';
    let filterText     = '';
    let allEntries: any[] = [];
    let lastZipPath    = '';

    // ── Build skeleton ──────────────────────────────────────────────────────
    bodyEl.innerHTML = `
      <div class="log-toolbar">
        <div class="log-toolbar__left">
          <select class="log-session-select" id="log-session-sel" title="Сессия запуска"></select>
          <div class="log-file-tabs" id="log-file-tabs">
            ${['errors','main','ipc','renderer'].map(f => `
              <button class="log-file-tab ${f === currentFile ? 'log-file-tab--active' : ''}" data-file="${f}">${f}</button>
            `).join('')}
          </div>
        </div>
        <div class="log-toolbar__right">
          <button class="log-btn log-btn--icon" id="log-refresh" title="Обновить">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
            Обновить
          </button>
          <button class="log-btn log-btn--icon" id="log-open-folder" title="Открыть папку с логами">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z"/></svg>
            Папка
          </button>
          <button class="log-btn log-btn--primary" id="log-collect-btn">
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            Собрать логи
          </button>
        </div>
      </div>

      <div class="log-filters" id="log-filters">
        <div class="log-level-filters" id="log-level-filters">
          ${['ALL','ERROR','WARN','INFO','DEBUG'].map(l => `
            <button class="log-level-btn ${l === levelFilter ? 'log-level-btn--active' : ''}" data-level="${l}">${l}</button>
          `).join('')}
        </div>
        <input class="log-search" id="log-search" type="text" placeholder="Фильтр по каналу или сообщению…" autocomplete="off" />
      </div>

      <div class="log-stats" id="log-stats"></div>

      <div class="log-list-wrap">
        <div class="log-list" id="log-list">
          <div class="log-empty">Загрузка…</div>
        </div>
      </div>

      <!-- Collect logs modal -->
      <div class="log-modal-backdrop" id="log-modal-backdrop" style="display:none">
        <div class="log-modal" id="log-modal">
          <div class="log-modal__header">
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#ffc300" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
            <span>Собрать диагностические логи</span>
          </div>
          <p class="log-modal__desc">Будет создан ZIP-архив со следующими данными:</p>
          <div class="log-modal__section log-modal__section--include">
            <div class="log-modal__label log-modal__label--include">Включено в архив</div>
            <ul>
              <li>Журналы событий: main.log, ipc.log, renderer.log, errors.log</li>
              <li>Системная информация: ОС, процессор, объём ОЗУ</li>
              <li>Версии: приложение, Electron, Chrome, Node.js</li>
              <li>Все сессии (последние 5 запусков)</li>
            </ul>
          </div>
          <div class="log-modal__section log-modal__section--exclude">
            <div class="log-modal__label log-modal__label--exclude">НЕ включено</div>
            <ul>
              <li>Токены авторизации — автоматически скрыты ([REDACTED])</li>
              <li>Пароли и личные данные аккаунта</li>
              <li>История просмотра и закладки</li>
              <li>Имя компьютера (hostname)</li>
            </ul>
          </div>
          <div class="log-modal__actions">
            <button class="settings-btn settings-btn--secondary" id="log-modal-cancel">Отмена</button>
            <button class="settings-btn settings-btn--primary" id="log-modal-confirm">
              <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
              Создать архив
            </button>
          </div>
        </div>
      </div>

      <!-- System info panel (below log list, collapsible) -->
      <div class="log-sysinfo" id="log-sysinfo">
        <button class="log-sysinfo__toggle" id="log-sysinfo-toggle">
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="14" rx="2"/><line x1="8" y1="21" x2="16" y2="21"/><line x1="12" y1="17" x2="12" y2="21"/></svg>
          Информация о системе
          <svg class="log-sysinfo__chevron" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>
        </button>
        <div class="log-sysinfo__body" id="log-sysinfo-body" style="display:none">
          <div class="log-sysinfo__loading">Загрузка…</div>
        </div>
      </div>
    `;

    // ── Wire up events ──────────────────────────────────────────────────────

    function renderList() {
      const listEl = bodyEl!.querySelector('#log-list') as HTMLElement;
      if (!listEl) return;

      const filtered = allEntries.filter(e => {
        if (levelFilter !== 'ALL' && e.level !== levelFilter) return false;
        if (filterText) {
          const q = filterText.toLowerCase();
          if (!String(e.ch || '').toLowerCase().includes(q) && !String(e.msg || '').toLowerCase().includes(q)) return false;
        }
        return true;
      });

      const statsEl = bodyEl!.querySelector('#log-stats') as HTMLElement;
      const counts = { ERROR: 0, WARN: 0, INFO: 0, DEBUG: 0 };
      for (const e of allEntries) if (e.level in counts) counts[e.level as keyof typeof counts]++;
      statsEl.innerHTML = `
        <span class="log-stat log-stat--error">${counts.ERROR} ошибок</span>
        <span class="log-stat log-stat--warn">${counts.WARN} предупреждений</span>
        <span class="log-stat log-stat--info">${counts.INFO} инфо</span>
        <span class="log-stat log-stat--total">${allEntries.length} всего</span>
      `;

      if (!filtered.length) {
        listEl.innerHTML = `<div class="log-empty">${allEntries.length ? 'Нет записей по фильтру' : 'Записей нет 🎉'}</div>`;
        return;
      }

      listEl.innerHTML = [...filtered].reverse().map(e => {
        const ts = e.ts ? (() => {
          const d = new Date(e.ts);
          return `${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}:${String(d.getSeconds()).padStart(2,'0')}.${String(d.getMilliseconds()).padStart(3,'0')}`;
        })() : '';
        const lvl = e.level || 'INFO';
        const ch  = String(e.ch  || '').slice(0, 40);
        const msg = String(e.msg || '');
        const hasData = e.data !== undefined && e.data !== null;
        const dataId  = Math.random().toString(36).slice(2);
        return `<div class="log-entry">
          <span class="log-level log-level--${lvl.toLowerCase()}">${lvl}</span>
          <span class="log-ts">${ts}</span>
          <span class="log-ch" title="${ch}">${ch}</span>
          <span class="log-msg">${msg.replace(/</g,'&lt;').replace(/>/g,'&gt;').slice(0,600)}</span>
          ${hasData ? `<button class="log-entry__data-toggle" data-id="${dataId}">data ›</button>
            <pre class="log-entry__data" id="data-${dataId}" style="display:none">${JSON.stringify(e.data, null, 2).slice(0,2000).replace(/</g,'&lt;')}</pre>` : ''}
        </div>`;
      }).join('');

      // Toggle data blocks
      listEl.querySelectorAll<HTMLButtonElement>('.log-entry__data-toggle').forEach(btn => {
        btn.addEventListener('click', () => {
          const pre = listEl.querySelector(`#data-${btn.dataset.id}`) as HTMLElement;
          if (!pre) return;
          const open = pre.style.display !== 'none';
          pre.style.display = open ? 'none' : 'block';
          btn.textContent = open ? 'data ›' : 'data ↓';
        });
      });
    }

    function loadLogs() {
      const el = bodyEl!.querySelector('#log-list') as HTMLElement;
      el.innerHTML = '<div class="log-empty">Загрузка…</div>';
      if (typeof (window.electron as any)?.logGetSessionLog === 'function') {
        (window.electron as any).logGetSessionLog(currentSession, currentFile, 500)
          .then((entries: any[]) => { allEntries = entries; renderList(); })
          .catch(() => { el.innerHTML = '<div class="log-empty">Ошибка загрузки логов</div>'; });
      } else {
        el.innerHTML = '<div class="log-empty">Доступно только в Electron</div>';
      }
    }

    // Load sessions
    if (typeof (window.electron as any)?.logGetSessions === 'function') {
      (window.electron as any).logGetSessions().then((sessions: {id: string, ts: string}[]) => {
        const sel = bodyEl!.querySelector('#log-session-sel') as HTMLSelectElement;
        sel.innerHTML = sessions.map((s, i) =>
          `<option value="${s.id}">${s.id.replace('T', ' ').replace(/-/g, (m, o) => o > 7 ? ':' : m)}${i === 0 ? ' (текущая)' : ''}</option>`
        ).join('');
        currentSession = sessions[0]?.id || '';
        loadLogs();
      }).catch(() => {});
    }

    // Session select
    bodyEl!.querySelector('#log-session-sel')?.addEventListener('change', (e) => {
      currentSession = (e.target as HTMLSelectElement).value;
      loadLogs();
    });

    // File tabs
    bodyEl!.querySelector('#log-file-tabs')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-file]') as HTMLElement;
      if (!btn) return;
      currentFile = btn.dataset.file!;
      bodyEl!.querySelectorAll('.log-file-tab').forEach(b => b.classList.toggle('log-file-tab--active', b === btn));
      loadLogs();
    });

    // Level filter
    bodyEl!.querySelector('#log-level-filters')?.addEventListener('click', (e) => {
      const btn = (e.target as HTMLElement).closest('[data-level]') as HTMLElement;
      if (!btn) return;
      levelFilter = btn.dataset.level!;
      bodyEl!.querySelectorAll('.log-level-btn').forEach(b => b.classList.toggle('log-level-btn--active', b === btn));
      renderList();
    });

    // Search
    bodyEl!.querySelector('#log-search')?.addEventListener('input', (e) => {
      filterText = (e.target as HTMLInputElement).value;
      renderList();
    });

    // Refresh
    bodyEl!.querySelector('#log-refresh')?.addEventListener('click', () => loadLogs());

    // Open folder
    bodyEl!.querySelector('#log-open-folder')?.addEventListener('click', () => {
      (window.electron as any)?.logOpenFolder?.();
    });

    // Collect logs button → show modal
    const backdrop = bodyEl!.querySelector('#log-modal-backdrop') as HTMLElement;
    bodyEl!.querySelector('#log-collect-btn')?.addEventListener('click', () => {
      backdrop.style.display = 'flex';
    });
    bodyEl!.querySelector('#log-modal-cancel')?.addEventListener('click', () => {
      backdrop.style.display = 'none';
    });
    backdrop.addEventListener('click', (e) => { if (e.target === backdrop) backdrop.style.display = 'none'; });

    bodyEl!.querySelector('#log-modal-confirm')?.addEventListener('click', async () => {
      const confirmBtn = bodyEl!.querySelector('#log-modal-confirm') as HTMLButtonElement;
      confirmBtn.disabled = true;
      confirmBtn.textContent = 'Создание…';
      try {
        const res = await (window.electron as any)?.logCollectZip?.();
        backdrop.style.display = 'none';
        if (res?.ok && res.path) {
          lastZipPath = res.path;
          const banner = document.createElement('div');
          banner.className = 'log-zip-banner';
          banner.innerHTML = `
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><polyline points="22 4 12 14.01 9 11.01"/></svg>
            Архив создан!
            <button class="log-zip-banner__open" id="log-zip-open">Показать в проводнике</button>
          `;
          bodyEl!.querySelector('.log-list-wrap')?.insertAdjacentElement('beforebegin', banner);
          bodyEl!.querySelector('#log-zip-open')?.addEventListener('click', () => {
            (window.electron as any)?.logOpenZip?.(lastZipPath);
          });
        } else {
          alert('Ошибка при создании архива: ' + (res?.error || 'неизвестная ошибка'));
        }
      } catch (err) {
        backdrop.style.display = 'none';
        alert('Ошибка: ' + String(err));
      } finally {
        confirmBtn.disabled = false;
        confirmBtn.innerHTML = `<svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg> Создать архив`;
      }
    });

    // System info collapsible
    bodyEl!.querySelector('#log-sysinfo-toggle')?.addEventListener('click', () => {
      const body = bodyEl!.querySelector('#log-sysinfo-body') as HTMLElement;
      const chevron = bodyEl!.querySelector('.log-sysinfo__chevron') as HTMLElement;
      const open = body.style.display !== 'none';
      body.style.display = open ? 'none' : 'block';
      chevron.style.transform = open ? '' : 'rotate(180deg)';
      if (!open && body.querySelector('.log-sysinfo__loading')) {
        (window.electron as any)?.logGetSystemInfo?.().then((info: any) => {
          if (!info) return;
          body.innerHTML = `
            <div class="log-sysinfo__grid">
              <div class="log-sysinfo__row"><span>ОС</span><span>${info.os?.type} ${info.os?.release} (${info.os?.arch})</span></div>
              <div class="log-sysinfo__row"><span>Платформа</span><span>${info.os?.platform}</span></div>
              <div class="log-sysinfo__row"><span>Процессор</span><span>${info.cpu?.model} (${info.cpu?.cores} ядер, ${info.cpu?.speedMHz} MHz)</span></div>
              <div class="log-sysinfo__row"><span>ОЗУ</span><span>${info.memory?.totalMB} МБ всего / ${info.memory?.freeMB} МБ свободно</span></div>
              <div class="log-sysinfo__row"><span>AnixApp</span><span>v${info.app?.version}</span></div>
              <div class="log-sysinfo__row"><span>Electron</span><span>${info.app?.electron}</span></div>
              <div class="log-sysinfo__row"><span>Chrome</span><span>${info.app?.chrome}</span></div>
              <div class="log-sysinfo__row"><span>Node.js</span><span>${info.app?.node}</span></div>
            </div>
          `;
        }).catch(() => { body.innerHTML = '<div class="log-sysinfo__loading">Ошибка загрузки</div>'; });
      }
    });
  }

  // ── About tab ──────────────────────────────────────────────────────────────────
  function renderAboutTab(): HTMLElement {
    const el = document.createElement('div');
    el.innerHTML = `
      <div class="settings-about">
        <div class="settings-about__logo">
          <img src="/logo/512x512.png" alt="AnixApp" class="settings-about__logo-img" onerror="this.style.display='none'">
        </div>
        <h2 class="settings-about__name">AnixApp</h2>
        <p class="settings-about__version" id="about-version">—</p>
        <p class="settings-about__desc">
          Неофициальный десктопный клиент для Anixart. Построен с использованием
          <a href="#" class="settings-about__inline-link" id="about-anixartjs-link">theDesConnet/AnixartJS</a>
          — Unofficial Anixart API wrapper for NodeJS.
        </p>
        <a href="#" class="settings-about__star-btn" id="about-star-btn">
          <i data-lucide="star"></i>
          <span>Поставить звезду проекту</span>
          <i data-lucide="external-link"></i>
        </a>
        <div class="settings-nav__sep" style="width:100%;max-width:400px;margin:24px auto;"></div>
        <div class="settings-about__dev-card" id="about-dev-card">
          <div class="settings-about__dev-avatar" id="about-dev-avatar"></div>
          <div class="settings-about__dev-info">
            <p class="settings-about__dev-name">Maks1mio <span class="settings-about__dev-tag">(EvT)</span></p>
            <p class="settings-about__dev-role">Разработчик AnixApp</p>
          </div>
          <a href="#" class="settings-about__dev-github" id="about-dev-github" title="GitHub">
            <i data-lucide="github"></i>
          </a>
        </div>
      </div>
    `;

    initIcons(el);

    if (typeof window.electron?.getVersions === 'function') {
      window.electron.getVersions().then((v: any) => {
        const vEl = el.querySelector('#about-version') as HTMLElement;
        if (v.app) vEl.textContent = `v${v.app}`;
      }).catch(() => {});
    } else if (typeof window.electron?.getAppVersion === 'function') {
      window.electron.getAppVersion().then((v: string) => {
        const vEl = el.querySelector('#about-version') as HTMLElement;
        vEl.textContent = `v${v}`;
      }).catch(() => {});
    }

    el.querySelector('#about-anixartjs-link')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.electron?.openExternal?.('https://github.com/theDesConnet/AnixartJS');
    });
    el.querySelector('#about-star-btn')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.electron?.openExternal?.('https://github.com/Maks1mio/anixapp');
    });
    el.querySelector('#about-dev-github')?.addEventListener('click', (e) => {
      e.preventDefault();
      window.electron?.openExternal?.('https://github.com/Maks1mio');
    });

    const devAvatar = el.querySelector('#about-dev-avatar') as HTMLElement;
    devAvatar.style.backgroundImage = `url('https://github.com/Maks1mio.png')`;

    return el;
  }

  // ── Tab switching ─────────────────────────────────────────────────────────────
  function switchTab(tab: SettingsTab) {
    activeTab = tab;
    if (!bodyEl) return;
    const scrollEl = bodyEl.parentElement as HTMLElement | null;
    bodyEl.innerHTML = '';
    scrollEl?.scrollTo({ top: 0 });

    switch (tab) {
      case 'account':
        bodyEl.appendChild(renderAccountTab());
        break;
      case 'appearance':
        bodyEl.appendChild(renderAppearanceTab());
        break;
      case 'connection':
        bodyEl.appendChild(renderConnectionTab());
        break;
      case 'behavior':
        bodyEl.appendChild(renderBehaviorTab());
        break;
      case 'playback':
        bodyEl.appendChild(renderPlaybackTab());
        break;
      case 'about':
        bodyEl.appendChild(renderAboutTab());
        break;
      case 'logs':
        renderLogsTab();
        break;
      case 'uikit': {
        const w = document.createElement('div');
        w.innerHTML = `
          <p class="settings-section__desc">Компоненты и стили приложения.</p>
          <button class="settings-nav__item" style="width:auto;display:inline-flex;padding:8px 16px;background:rgba(255,255,255,0.06);border-radius:4px;" id="s-goto-uikit">Открыть UI Kit</button>
        `;
        bodyEl.appendChild(w);
        w.querySelector('#s-goto-uikit')?.addEventListener('click', () => {
          close();
          navigate('/uikit');
        });
        break;
      }
    }
  }

  // Re-render tab content whenever bodyEl or activeTab changes
  $effect(() => {
    if (bodyEl) {
      switchTab(activeTab);
    }
  });

  // ── close / keyboard ──────────────────────────────────────────────────────────
  function close() {
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') close();
  }

  function handleOverlayClick(e: MouseEvent) {
    if (e.target === overlayEl) close();
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);

    // Version in sidebar footer
    const versionEl = overlayEl?.querySelector('#s-version') as HTMLElement | null;
    const compEl = overlayEl?.querySelector('#s-components') as HTMLElement | null;

    if (typeof window.electron?.getVersions === 'function') {
      window.electron.getVersions().then((v: any) => {
        if (v.app && versionEl) versionEl.textContent = `AnixApp v${v.app}`;
        if (compEl) {
          const parts: string[] = [];
          if (v.electron) parts.push(`Electron ${v.electron}`);
          if (v.chrome) parts.push(`Chrome ${v.chrome}`);
          if (v.node) parts.push(`Node ${v.node}`);
          if (v.anixartjs) parts.push(`<a href="#" class="settings-sidebar__meta-link" data-url="https://github.com/theDesConnet/AnixartJS">AnixartJS ${v.anixartjs}</a>`);
          compEl.innerHTML = parts.join(' · ');
          compEl.querySelectorAll<HTMLAnchorElement>('.settings-sidebar__meta-link').forEach((a) => {
            a.addEventListener('click', (e) => {
              e.preventDefault();
              const url = a.dataset.url;
              if (url) window.electron?.openExternal?.(url);
            });
          });
        }
      }).catch(() => {});
    } else if (typeof window.electron?.getAppVersion === 'function') {
      window.electron.getAppVersion().then((v: string) => {
        if (versionEl) versionEl.textContent = `AnixApp v${v}`;
      }).catch(() => {});
    }

    // Lucide icons in sidebar
    if (overlayEl) initIcons(overlayEl);
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
  });

  function handleLogout() {
    if (window.anixApi) {
      close();
      window.anixApi.auth.logout().then(() => {
        window.location.reload();
      });
    }
  }

  function handleGithubLink(e: Event) {
    e.preventDefault();
    window.electron?.openExternal?.('https://github.com/Maks1mio/anixapp');
  }
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="settings-overlay settings-overlay--open"
  role="dialog"
  aria-modal="true"
  aria-label="Настройки"
  tabindex="-1"
  bind:this={overlayEl}
  onclick={handleOverlayClick}
>
  <div class="settings-panel">

    <aside class="settings-sidebar">
      <div class="settings-sidebar__scroll" bind:this={sidebarScrollEl}>

        <button
          class="settings-sidebar__user settings-nav__item"
          class:settings-nav__item--active={activeTab === 'account'}
          onclick={() => switchTab('account')}
        >
          <div class="settings-sidebar__avatar" style={avatarStyle} id="s-av"></div>
          <div class="settings-sidebar__user-info">
            <span class="settings-sidebar__username">{loginDisplay}</span>
            <span class="settings-sidebar__user-sub">Редактировать профи… <i data-lucide="pencil"></i></span>
          </div>
        </button>

        <div class="settings-nav__sep"></div>

        <p class="settings-nav__section">Настройки приложения</p>
        <button
          class="settings-nav__item settings-nav__item--icon"
          class:settings-nav__item--active={activeTab === 'appearance'}
          onclick={() => switchTab('appearance')}
        >
          <i data-lucide="palette"></i><span>Внешний вид</span>
        </button>
        <button
          class="settings-nav__item settings-nav__item--icon"
          class:settings-nav__item--active={activeTab === 'connection'}
          onclick={() => switchTab('connection')}
        >
          <i data-lucide="globe"></i><span>Соединение</span>
        </button>
        <button
          class="settings-nav__item settings-nav__item--icon"
          class:settings-nav__item--active={activeTab === 'behavior'}
          onclick={() => switchTab('behavior')}
        >
          <i data-lucide="sliders-horizontal"></i><span>Поведение</span>
        </button>
        <button
          class="settings-nav__item settings-nav__item--icon"
          class:settings-nav__item--active={activeTab === 'playback'}
          onclick={() => switchTab('playback')}
        >
          <i data-lucide="tv"></i><span>Воспроизведение</span>
        </button>

        <div class="settings-nav__sep"></div>

        <button
          class="settings-nav__item settings-nav__item--icon"
          class:settings-nav__item--active={activeTab === 'about'}
          onclick={() => switchTab('about')}
        >
          <i data-lucide="info"></i><span>О программе</span>
        </button>
        <button
          class="settings-nav__item settings-nav__item--icon"
          class:settings-nav__item--active={activeTab === 'logs'}
          onclick={() => switchTab('logs')}
        >
          <i data-lucide="scroll-text"></i><span>Журнал событий</span>
        </button>

        {#if isDev}
          <button
            class="settings-nav__item settings-nav__item--icon"
            class:settings-nav__item--active={activeTab === 'uikit'}
            onclick={() => switchTab('uikit')}
          >
            <i data-lucide="layout-grid"></i><span>UI Kit</span>
          </button>
        {/if}

      </div>

      <div class="settings-sidebar__footer-section">
        <button class="settings-nav__item settings-nav__item--logout" id="s-logout" onclick={handleLogout}>
          <i data-lucide="log-out"></i>
          <span>Выйти</span>
        </button>
        <div class="settings-sidebar__meta">
          <span class="settings-sidebar__meta-version" id="s-version">AnixApp</span>
          <button type="button" class="settings-sidebar__meta-icon" id="s-github-link" title="GitHub" onclick={handleGithubLink}>
            <i data-lucide="github"></i>
          </button>
        </div>
        <div class="settings-sidebar__meta-components" id="s-components"></div>
      </div>
    </aside>

    <div class="settings-content">
      <div class="settings-content__header">
        <h1 class="settings-content__title">{TAB_TITLES[activeTab]}</h1>
        <button class="settings-close-btn" aria-label="Закрыть" onclick={close}></button>
      </div>
      <div class="settings-content__page-wrap">
        <Page scrollId="settings-scroll" noPadding={true} extraClass="settings-page">
          <div bind:this={bodyEl}></div>
        </Page>
      </div>
    </div>

  </div>
</div>
