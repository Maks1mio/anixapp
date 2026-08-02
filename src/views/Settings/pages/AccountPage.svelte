<script lang="ts">
  import { onMount, tick } from 'svelte';
  import ProfileHero from '../../Profile/v1/components/ProfileHero.svelte';
  import { renderSelect } from '../../../components/select';
  import { showToast } from '../../../stores/toast';

  type PrivacyVal = 0 | 1 | 2;

  interface ProfileSettings {
    status: string;
    privacy_stats: PrivacyVal;
    privacy_counts: PrivacyVal;
    privacy_social: PrivacyVal;
    privacy_friend_requests: 0 | 1;
  }
  interface SocialSettings {
    vk_page: string; tg_page: string; inst_page: string;
    tt_page: string; discord_page: string;
  }
  interface LoginInfo {
    login: string;
    // AnixartJS typo — actual API may return either spelling
    is_change_avaliable?: boolean;
    is_change_available?: boolean;
    next_change_avaliable_at?: number;
    next_change_available_at?: number;
  }

  const PRIVACY_OPTIONS    = [{ value: '0', label: 'Все' }, { value: '1', label: 'Только друзья' }, { value: '2', label: 'Только я' }];
  const PRIVACY_FR_OPTIONS = [{ value: '0', label: 'Все' }, { value: '1', label: 'Только я' }];

  const rawProfile = (window as any).__anixProfile as any | undefined;

  type LoadState = 'loading' | 'ready' | 'error' | 'unavailable';
  let loadState   = $state<LoadState>('loading');
  let coverUrl    = $state<string | null>(null);
  let fullProfile = $state<any>(rawProfile ?? null);

  let loginInfo        = $state<LoginInfo | null>(null);
  let loginValue       = $state('');
  let loginSaving      = $state(false);
  let loginConfirmOpen = $state(false);

  let statusValue  = $state('');
  let statusSaving = $state(false);

  let socialValues  = $state<SocialSettings>({ vk_page: '', tg_page: '', inst_page: '', tt_page: '', discord_page: '' });
  let socialSaving  = $state(false);

  // Normalize both spellings — API may return either variant
  const canChangeLogin = $derived(
    loginInfo
      ? (loginInfo.is_change_avaliable ?? loginInfo.is_change_available ?? true)
      : false
  );
  const nextChangeAt = $derived(
    loginInfo
      ? (loginInfo.next_change_avaliable_at ?? loginInfo.next_change_available_at ?? null)
      : null
  );

  // displayProfile merges full API data + live-edited fields for preview
  const displayProfile = $derived(fullProfile ? {
    ...fullProfile,
    login:        loginValue || fullProfile.login,
    status:       statusValue,
    vk_page:      socialValues.vk_page,
    tg_page:      socialValues.tg_page,
    inst_page:    socialValues.inst_page,
    tt_page:      socialValues.tt_page,
    discord_page: socialValues.discord_page,
  } : null);

  // Privacy bind:this containers
  // svelte-ignore non_reactive_update
  let privacyStatsEl:  HTMLElement;
  // svelte-ignore non_reactive_update
  let privacyCountsEl: HTMLElement;
  // svelte-ignore non_reactive_update
  let privacySocialEl: HTMLElement;
  // svelte-ignore non_reactive_update
  let privacyFrEl:     HTMLElement;

  // ── Handlers ───────────────────────────────────────────────────────────────
  function requestLoginChange() {
    const val = loginValue.trim();
    if (!val || val === loginInfo?.login) return;
    loginConfirmOpen = true;
  }

  async function confirmLoginChange() {
    loginConfirmOpen = false;
    const val = loginValue.trim();
    if (!val) return;
    loginSaving = true;
    try {
      const res = await (window as any).anixApi.settings.changeLogin(val);
      if (res.code === 0) {
        showToast('Никнейм изменён');
        if (loginInfo) loginInfo = { ...loginInfo, login: val, is_change_avaliable: false, is_change_available: false };
        if ((window as any).__anixProfile) (window as any).__anixProfile.login = val;
        if (fullProfile) fullProfile = { ...fullProfile, login: val };
      } else {
        const m: Record<number, string> = { 2: 'Некорректный никнейм', 3: 'Никнейм уже занят', 4: 'Смена ещё недоступна' };
        showToast(m[res.code ?? -1] ?? 'Ошибка', 'err');
      }
    } catch { showToast('Ошибка при сохранении', 'err'); }
    loginSaving = false;
  }

  async function saveStatus() {
    statusSaving = true;
    try {
      await (window as any).anixApi.settings.setStatus(statusValue.trim());
      showToast('Статус обновлён');
      if ((window as any).__anixProfile) (window as any).__anixProfile.status = statusValue.trim();
    } catch { showToast('Ошибка при сохранении', 'err'); }
    statusSaving = false;
  }

  async function saveSocial() {
    socialSaving = true;
    try {
      const payload = {
        vk_page:      socialValues.vk_page.trim(),
        tg_page:      socialValues.tg_page.trim(),
        inst_page:    socialValues.inst_page.trim(),
        tt_page:      socialValues.tt_page.trim(),
        discord_page: socialValues.discord_page.trim(),
      };
      const res = await (window as any).anixApi.settings.setSocial(payload);
      if (!res || res.code === 0 || res.code === undefined) {
        showToast('Социальные сети сохранены');
      } else {
        const m: Record<number, string> = { 2: 'Некорректный VK', 3: 'Некорректный Telegram', 4: 'Некорректный Instagram', 5: 'Некорректный TikTok', 6: 'Некорректный Discord' };
        showToast(m[res.code] ?? 'Ошибка', 'err');
      }
    } catch { showToast('Ошибка при сохранении', 'err'); }
    socialSaving = false;
  }

  function mountPrivacySelects(settings: ProfileSettings) {
    const api = (window as any).anixApi.settings;
    const defs = [
      { el: privacyStatsEl,   val: settings.privacy_stats,             opts: PRIVACY_OPTIONS,    setter: (v: number) => api.setPrivacyStats(v) },
      { el: privacyCountsEl,  val: settings.privacy_counts,            opts: PRIVACY_OPTIONS,    setter: (v: number) => api.setPrivacyCounts(v) },
      { el: privacySocialEl,  val: settings.privacy_social,            opts: PRIVACY_OPTIONS,    setter: (v: number) => api.setPrivacySocial(v) },
      { el: privacyFrEl,      val: settings.privacy_friend_requests,   opts: PRIVACY_FR_OPTIONS, setter: (v: number) => api.setPrivacyFriendRequests(v) },
    ];
    for (const d of defs) {
      if (!d.el) continue;
      d.el.innerHTML = '';
      d.el.appendChild(renderSelect({
        value: String(d.val),
        options: d.opts,
        onChange: (v) => {
          void d.setter(Number(v)).then(() => showToast('Сохранено')).catch(() => showToast('Ошибка', 'err'));
        },
      }));
    }
  }

  onMount(async () => {
    if ((window as any).anixApi) {
      try {
        const [selfData, channelData] = await Promise.all([
          (window as any).anixApi.profile.self(),
          (window as any).anixApi.channel?.getBlog?.((rawProfile as any)?.id).catch(() => null) ?? Promise.resolve(null),
        ]) as any[];
        if (selfData?.profile) fullProfile = selfData.profile;
        const cover =
          selfData?.blogInfo?.channel?.cover || selfData?.blog_info?.channel?.cover ||
          selfData?.blog?.channel?.cover || channelData?.blogInfo?.channel?.cover ||
          channelData?.channel?.cover || null;
        if (cover) coverUrl = cover;
      } catch { /* keep rawProfile */ }
    }

    if (typeof (window as any).anixApi?.settings?.getProfileSettings !== 'function') {
      loadState = 'unavailable'; return;
    }

    try {
      const [settings, social, loginInfoRes] = await Promise.all([
        (window as any).anixApi.settings.getProfileSettings() as Promise<ProfileSettings>,
        (window as any).anixApi.settings.getSocial() as Promise<SocialSettings>,
        (window as any).anixApi.settings.getLoginInfo() as Promise<LoginInfo>,
      ]);
      statusValue  = settings.status ?? '';
      socialValues = {
        vk_page:      (social as any).vk_page      ?? (social as any).vkPage      ?? '',
        tg_page:      (social as any).tg_page      ?? (social as any).tgPage      ?? '',
        inst_page:    (social as any).inst_page    ?? (social as any).instPage    ?? '',
        tt_page:      (social as any).tt_page      ?? (social as any).ttPage      ?? '',
        discord_page: (social as any).discord_page ?? (social as any).discordPage ?? '',
      };
      loginInfo  = loginInfoRes;
      loginValue = loginInfoRes.login ?? '';
      loadState  = 'ready';
      await tick();
      mountPrivacySelects(settings);
    } catch {
      loadState = 'error';
    }
  });
</script>

<!-- ── PROFILE HERO ──────────────────────────────────────────────────────────── -->
{#if displayProfile}
  <div class="acc-hero-preview">
    <ProfileHero
      profile={displayProfile}
      {coverUrl}
      isMyProfile={true}
      onOpenSocial={(url) => (window as any).electron?.openExternal?.(url)}
    />
  </div>
{/if}

<!-- ── FORM ──────────────────────────────────────────────────────────────────── -->
{#if loadState === 'loading'}
  <div class="acc-loading">Загрузка настроек профиля…</div>

{:else if loadState === 'unavailable'}
  <p class="settings-account-coming-soon">Редактирование профиля доступно только в приложении Electron.</p>

{:else if loadState === 'error'}
  <p class="settings-account-coming-soon">Не удалось загрузить настройки профиля.</p>

{:else}

  <!-- ── Профиль ──────────────────────────────────────────────────────────── -->
  <div class="acc-section">
    <p class="acc-section__title">Профиль</p>

    <!-- Никнейм — всегда показываем поле, disabled если cooldown (как в AniDesk) -->
    <div class="acc-field">
      <span class="acc-field__label">никнейм</span>
      <div class="acc-field__body acc-field__body--row">
        <input
          type="text"
          class="acc-input acc-input--grow"
          placeholder="Никнейм"
          maxlength="30"
          disabled={!canChangeLogin}
          bind:value={loginValue}
        />
        <button
          type="button"
          class="acc-btn"
          disabled={loginSaving || !canChangeLogin}
          onclick={requestLoginChange}
        >
          изменить
          <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/></svg>
        </button>
      </div>
      {#if loginInfo && !canChangeLogin}
        <div class="acc-field__label" style="grid-column: 2; padding-top: 0;">
          <span class="acc-field__hint">
            Смена доступна раз в 30 дней
            {#if nextChangeAt}
              · с {new Date(nextChangeAt * 1000).toLocaleDateString('ru-RU')}
            {/if}
          </span>
        </div>
      {/if}
    </div>

    <!-- Статус -->
    <div class="acc-field">
      <span class="acc-field__label">статус</span>
      <div class="acc-field__body acc-field__body--row">
        <input
          type="text"
          class="acc-input acc-input--grow"
          placeholder="Введите статус…"
          maxlength="150"
          bind:value={statusValue}
        />
        <button type="button" class="acc-btn" disabled={statusSaving} onclick={saveStatus}>сохранить</button>
      </div>
    </div>
  </div>

  <!-- ── Социальные сети ──────────────────────────────────────────────────── -->
  <div class="acc-section">
    <p class="acc-section__title">Социальные сети</p>

    {#each [
      { key: 'vk_page',      label: 'VK',        placeholder: 'Логин VK' },
      { key: 'tg_page',      label: 'Telegram',  placeholder: 'Юзернейм' },
      { key: 'inst_page',    label: 'Instagram', placeholder: 'Юзернейм' },
      { key: 'tt_page',      label: 'TikTok',    placeholder: 'Юзернейм' },
      { key: 'discord_page', label: 'Discord',   placeholder: 'Юзернейм' },
    ] as f}
      <div class="acc-field">
        <span class="acc-field__label">{f.label}</span>
        <div class="acc-field__body">
          <input
            type="text"
            class="acc-input"
            placeholder={f.placeholder}
            value={socialValues[f.key as keyof SocialSettings]}
            oninput={(e) => { socialValues = { ...socialValues, [f.key]: (e.target as HTMLInputElement).value }; }}
          />
        </div>
      </div>
    {/each}

    <div class="acc-field acc-field--actions">
      <span class="acc-field__label"></span>
      <div class="acc-field__body">
        <button type="button" class="acc-btn acc-btn--primary" disabled={socialSaving} onclick={saveSocial}>Сохранить</button>
      </div>
    </div>
  </div>

  <!-- ── Приватность ──────────────────────────────────────────────────────── -->
  <div class="acc-section">
    <p class="acc-section__title">Приватность</p>
    <p class="acc-section__desc">Кто может видеть вашу информацию.</p>

    <div class="acc-field">
      <span class="acc-field__label">статистика</span>
      <div class="acc-field__body" bind:this={privacyStatsEl}></div>
    </div>
    <div class="acc-field">
      <span class="acc-field__label">счётчики</span>
      <div class="acc-field__body" bind:this={privacyCountsEl}></div>
    </div>
    <div class="acc-field">
      <span class="acc-field__label">соц. сети</span>
      <div class="acc-field__body" bind:this={privacySocialEl}></div>
    </div>
    <div class="acc-field">
      <span class="acc-field__label">заявки</span>
      <div class="acc-field__body" bind:this={privacyFrEl}></div>
    </div>
  </div>

{/if}

<!-- ── Confirm nickname change dialog ───────────────────────────────────── -->
{#if loginConfirmOpen}
  <div class="acc-confirm-backdrop" onclick={() => loginConfirmOpen = false} role="presentation">
    <div class="acc-confirm" onclick={(e) => e.stopPropagation()} onkeydown={(e) => e.stopPropagation()} role="dialog" aria-modal="true" tabindex="-1">
      <p class="acc-confirm__title">Сменить никнейм?</p>
      <p class="acc-confirm__body">
        После смены никнейм можно будет изменить снова только через <strong>30 дней</strong>.
      </p>
      <div class="acc-confirm__actions">
        <button type="button" class="acc-btn" onclick={() => loginConfirmOpen = false}>Отмена</button>
        <button type="button" class="acc-btn acc-btn--primary" onclick={confirmLoginChange}>Подтвердить</button>
      </div>
    </div>
  </div>
{/if}

<style>
  .acc-hero-preview { overflow: hidden; margin-bottom: 4px; }

  .acc-confirm-backdrop {
    position: fixed;
    inset: 0;
    z-index: 10002;
    display: flex;
    align-items: center;
    justify-content: center;
    background: rgba(0, 0, 0, 0.55);
  }

  .acc-confirm {
    background: var(--color-surface, #2a2a2a);
    border: 1px solid var(--color-border, rgba(255,255,255,.1));
    border-radius: 12px;
    padding: 24px;
    width: 340px;
    max-width: calc(100vw - 32px);
    box-shadow: 0 8px 32px rgba(0,0,0,.5);
  }

  .acc-confirm__title {
    font-size: 1rem;
    font-weight: 700;
    color: var(--color-text, #fff);
    margin: 0 0 10px;
  }

  .acc-confirm__body {
    font-size: 0.875rem;
    color: var(--color-text-muted, #aaa);
    margin: 0 0 20px;
    line-height: 1.5;
  }

  .acc-confirm__actions {
    display: flex;
    gap: 8px;
    justify-content: flex-end;
  }

  .acc-loading {
    padding: 20px 0;
    font-size: 0.875rem;
    color: var(--color-text-muted, #737373);
  }

  .acc-section {
    padding: 20px 0 8px;
  }

  .acc-section__title {
    font-size: 0.6875rem;
    font-weight: 700;
    letter-spacing: 0.08em;
    text-transform: uppercase;
    color: var(--color-text-muted, #737373);
    margin: 0 0 14px;
  }

  .acc-section__desc {
    font-size: 0.8125rem;
    color: var(--color-text-muted, #737373);
    margin: -10px 0 14px;
  }

  .acc-field {
    display: grid;
    grid-template-columns: 100px 1fr;
    align-items: start;
    gap: 6px 16px;
    padding: 6px 0;
    border-bottom: 1px solid var(--color-border, rgba(255,255,255,.05));
  }
  .acc-field:last-child { border-bottom: none; }
  .acc-field--actions   { padding-top: 12px; }

  .acc-field__label {
    font-size: 0.775rem;
    color: var(--color-text-muted, #737373);
    padding-top: 8px;
    line-height: 1.4;
    white-space: nowrap;
  }

  .acc-field__hint {
    font-size: 0.75rem;
    color: var(--color-text-muted, #737373);
  }

  .acc-field__body {
    display: flex;
    flex-direction: column;
    gap: 4px;
  }
  .acc-field__body--row {
    flex-direction: row;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .acc-input {
    background: var(--color-surface, #2a2a2a);
    border: 1px solid var(--color-border, rgba(255,255,255,.1));
    border-radius: 6px;
    color: var(--color-text, #fff);
    font-size: 0.875rem;
    padding: 7px 10px;
    outline: none;
    transition: border-color 0.15s;
    width: 100%;
    box-sizing: border-box;
  }
  .acc-input:focus { border-color: var(--color-accent, #7c6bff); }
  .acc-input:disabled { opacity: 0.45; cursor: not-allowed; }
  .acc-input--grow { flex: 1; width: auto; }

  .acc-btn {
    display: inline-flex;
    align-items: center;
    gap: 6px;
    padding: 7px 14px;
    border-radius: 6px;
    font-size: 0.8125rem;
    font-weight: 600;
    background: var(--color-surface-raised, #333);
    color: var(--color-text, #fff);
    border: 1px solid var(--color-border, rgba(255,255,255,.1));
    cursor: pointer;
    white-space: nowrap;
    transition: background 0.15s, opacity 0.15s;
  }
  .acc-btn:hover:not(:disabled) { background: var(--color-surface-hover, #404040); }
  .acc-btn:disabled { opacity: 0.45; cursor: not-allowed; }
  .acc-btn--primary {
    background: var(--color-accent, #7c6bff);
    border-color: transparent;
    color: #fff;
  }
  .acc-btn--primary:hover:not(:disabled) { background: var(--color-accent-hover, #6a59ee); }
</style>
