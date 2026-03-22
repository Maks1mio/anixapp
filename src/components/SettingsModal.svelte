<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import Page from './Page.svelte';
  import { navigate } from '../stores/navigation';
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
  } from 'lucide';

  interface Props {
    onClose: () => void;
  }

  const { onClose }: Props = $props();

  export type SettingsTab = 'account' | 'appearance' | 'connection' | 'behavior' | 'playback' | 'uikit' | 'about';

  const TAB_TITLES: Record<SettingsTab, string> = {
    account:    'Моя учётная запись',
    appearance: 'Внешний вид',
    connection: 'Соединение',
    behavior:   'Поведение',
    playback:   'Воспроизведение',
    uikit:      'UI Kit',
    about:      'О программе',
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

  let activeTab = $state<SettingsTab>('account');
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
      icons: { User, Palette, Globe, SlidersHorizontal, Info, LayoutGrid, LogOut, Star, ExternalLink, Pencil, Github, Tv },
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

        <p class="settings-nav__section">Настройки пользователя</p>
        <button
          class="settings-nav__item settings-nav__item--icon"
          class:settings-nav__item--active={activeTab === 'account'}
          onclick={() => switchTab('account')}
        >
          <i data-lucide="user"></i><span>Моя учётная запись</span>
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
          <a class="settings-sidebar__meta-icon" href="#" id="s-github-link" title="GitHub" onclick={handleGithubLink}>
            <i data-lucide="github"></i>
          </a>
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
