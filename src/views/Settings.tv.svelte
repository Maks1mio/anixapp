<script lang="ts">
  import { onMount } from 'svelte';
  import TvPage from '../components/tv/TvPage.svelte';
  import TvChoiceDialog, { type TvChoiceOption } from '../components/tv/TvChoiceDialog.svelte';
  import UserAvatar from '../components/UserAvatar.svelte';
  import { navigate } from '../stores/navigation';
  import { applyAccountSessionChange, isAuthenticated, openLoginPrompt, syncAuthStatus } from '../stores/auth';
  import { showToast } from '../stores/toast';
  import { restoreTvFocus, exitTvApp } from '../services/tv-navigation';
  import { isDebugMetricsEnabled, setDebugMetricsEnabled } from '../services/debug-metrics';
  import { exitBigPicture, isBigPictureMode, tvPosterThumbUrl } from '../platform/tv';
  import { SELECTABLE_API_ENDPOINTS, normalizeSelectableApiEndpoint } from '../constants/apiEndpoints';
  import {
    ANIME4K_TYPES,
    mapAnime4kPreset,
    normalizeAnime4kPreset,
    normalizeAnime4kTargetRes,
    type Anime4kIntensity,
    type Anime4kTargetRes,
    type Anime4kType,
  } from './Watch/core/anime4k-presets';
  import { hasAppSettingsStore, loadAppSettings, saveAppSettings } from '../utils/app-settings';
  import { initWebGpuAvailability } from '../utils/webgpu-availability.svelte';

  type Account = { id: number; login: string; avatar: string | null; active: boolean };
  type DialogId = 'accounts' | 'logout' | 'endpoint' | 'upscale' | 'quit';

  let account = $state<Account | null>(null);
  let accounts = $state<Account[]>([]);
  let canSwitchAccounts = $state(false);
  let endpoint = $state('');
  let upscaleAvailable = $state(false);
  let upscaleType = $state<Anime4kType>('off');
  let upscaleIntensity = $state<Anime4kIntensity>('optimal');
  let upscaleTargetRes = $state<Anime4kTargetRes>('1080');
  let debugMetrics = $state(isDebugMetricsEnabled());
  let version = $state('');
  let busy = $state(false);

  let dialog = $state<DialogId | null>(null);
  let dialogReturn: HTMLElement | null = null;

  const bigPicture = isBigPictureMode();

  const endpointLabel = $derived(
    SELECTABLE_API_ENDPOINTS.find((o) => o.value === endpoint)?.label ?? (endpoint || '—'),
  );
  const upscaleLabel = $derived(ANIME4K_TYPES.find((t) => t.id === upscaleType)?.label ?? 'Выкл');

  const dialogTitle: Record<DialogId, string> = {
    accounts: 'Сменить аккаунт',
    logout: 'Выйти из аккаунта?',
    endpoint: 'API-эндпоинт',
    upscale: 'Улучшение изображения',
    quit: bigPicture ? 'Закрыть AnixApp?' : 'Выйти из приложения?',
  };

  const dialogOptions = $derived.by((): TvChoiceOption[] => {
    switch (dialog) {
      case 'accounts':
        return [
          ...accounts.map((a) => ({ value: String(a.id), label: a.login || `ID ${a.id}`, hint: a.active ? 'Текущий' : undefined })),
          { value: 'add', label: 'Добавить аккаунт', hint: 'Вход по QR-коду или паролю' },
        ];
      case 'logout':
        return [
          { value: 'yes', label: 'Выйти', hint: 'Аккаунт пропадёт из быстрой смены' },
          { value: 'no', label: 'Отмена' },
        ];
      case 'quit':
        return [
          { value: 'yes', label: bigPicture ? 'Закрыть' : 'Выйти' },
          { value: 'no', label: 'Отмена' },
        ];
      case 'endpoint':
        return SELECTABLE_API_ENDPOINTS.map((o) => ({ value: o.value, label: o.label }));
      case 'upscale':
        return ANIME4K_TYPES.map((t) => ({
          value: t.id,
          label: t.label,
          hint: t.recommended ? `${t.hint} · рекомендуется` : t.hint,
        }));
      default:
        return [];
    }
  });

  const dialogValue = $derived(
    dialog === 'endpoint'
      ? endpoint
      : dialog === 'upscale'
        ? upscaleType
        : dialog === 'accounts'
          ? String(account?.id ?? '')
          : '',
  );

  function accountsLabel(n: number): string {
    const mod10 = n % 10;
    const mod100 = n % 100;
    if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20)) return `${n} аккаунта`;
    return `${n} аккаунтов`;
  }

  function openDialog(id: DialogId, event: MouseEvent) {
    dialogReturn = event.currentTarget as HTMLElement;
    dialog = id;
  }

  function closeDialog() {
    dialog = null;
    restoreTvFocus(dialogReturn);
  }

  async function loadAccount() {
    const authed = await syncAuthStatus();
    if (!authed) {
      account = null;
      accounts = [];
      return;
    }
    try {
      const res = await window.anixApi?.auth?.listAccounts?.();
      accounts = res?.accounts ?? [];
      canSwitchAccounts = !!window.anixApi?.auth?.switchAccount;
      account = accounts.find((a) => a.active) ?? null;
    } catch {
      accounts = [];
    }
    if (!account) {
      try {
        const self = (await window.anixApi.profile.self()) as { profile?: { id?: number; login?: string; avatar?: string } };
        const p = self?.profile;
        if (p?.id) account = { id: p.id, login: p.login ?? '', avatar: p.avatar ?? null, active: true };
      } catch {
        account = null;
      }
    }
  }

  async function loadPlayback() {
    if (!hasAppSettingsStore()) return;
    upscaleAvailable = await initWebGpuAvailability();
    if (!upscaleAvailable) return;
    const settings = await loadAppSettings();
    const preset = normalizeAnime4kPreset(settings);
    upscaleType = preset.type;
    upscaleIntensity = preset.intensity;
    upscaleTargetRes = normalizeAnime4kTargetRes(settings.upscaleTargetRes);
  }

  async function loadVersion() {
    try {
      if (typeof window.electron?.getVersions === 'function') {
        const v = await window.electron.getVersions();
        if (v?.app) version = `v${v.app}`;
        return;
      }
    } catch {
      /* ignore */
    }
    if (__ANIXAPP_VERSION__) version = `v${__ANIXAPP_VERSION__}`;
  }

  async function loadEndpoint() {
    try {
      const current = (await window.anixApi?.client?.getBaseUrl?.()) as string | undefined;
      endpoint = current ? normalizeSelectableApiEndpoint(current) : '';
    } catch {
      endpoint = '';
    }
  }

  async function switchAccount(id: number) {
    if (busy) return;
    busy = true;
    try {
      const res = await window.anixApi?.auth?.switchAccount?.(id);
      if (!res?.success) throw new Error('switch failed');
      if (!res.alreadyActive) await applyAccountSessionChange();
    } catch {
      showToast('Не удалось переключить аккаунт', 'err');
    } finally {
      busy = false;
    }
  }

  async function logout() {
    if (busy) return;
    busy = true;
    try {
      await window.anixApi?.auth?.logout?.();
      await applyAccountSessionChange();
    } catch {
      showToast('Не удалось выйти', 'err');
      busy = false;
    }
  }

  async function setEndpoint(value: string) {
    const selected = normalizeSelectableApiEndpoint(value);
    if (selected === endpoint) return;
    try {
      await window.anixApi.client.setBaseUrl(selected);
      endpoint = selected;
      window.dispatchEvent(new CustomEvent('anix:offline'));
    } catch {
      showToast('Не удалось сменить эндпоинт', 'err');
    }
  }

  function setUpscale(value: string) {
    const type = ANIME4K_TYPES.find((t) => t.id === value)?.id;
    if (!type) return;
    upscaleType = type;
    const mapped = mapAnime4kPreset({ type: upscaleType, intensity: upscaleIntensity });
    const patch = {
      upscaleEnabled: mapped.enabled,
      upscaleMode: mapped.mode,
      upscaleType,
      upscaleIntensity,
      upscaleTargetRes,
    };
    void saveAppSettings(patch);
    window.electron?.sendUpscaleSettings?.(patch);
    window.dispatchEvent(new CustomEvent('anix:upscaleChanged', { detail: patch }));
  }

  function toggleMetrics() {
    debugMetrics = !debugMetrics;
    setDebugMetricsEnabled(debugMetrics);
  }

  function onDialogSelect(value: string) {
    const id = dialog;
    if (id === 'accounts') {
      if (value === 'add') {
        closeDialog();
        openLoginPrompt();
        return;
      }
      closeDialog();
      void switchAccount(Number(value));
      return;
    }
    if (id === 'logout') {
      closeDialog();
      if (value === 'yes') void logout();
      return;
    }
    if (id === 'quit') {
      closeDialog();
      if (value === 'yes') void exitTvApp();
      return;
    }
    if (id === 'endpoint') void setEndpoint(value);
    if (id === 'upscale') setUpscale(value);
    closeDialog();
  }

  onMount(() => {
    void loadAccount();
    void loadPlayback();
    void loadVersion();
    void loadEndpoint();
    const onAuthChanged = () => void loadAccount();
    window.addEventListener('anix:authChanged', onAuthChanged);
    return () => window.removeEventListener('anix:authChanged', onAuthChanged);
  });
</script>

<TvPage title="Настройки">
  <div class="tv-settings">
    <section class="tv-settings__group" aria-label="Аккаунт">
      <h2 class="tv-settings__group-title">Аккаунт</h2>
      {#if $isAuthenticated && account}
        <button type="button" class="tv-setting tv-setting--account" onclick={() => navigate('/profile')}>
          <span class="tv-setting__avatar">
            <UserAvatar src={account.avatar ? tvPosterThumbUrl(account.avatar) : null} label={account.login || '?'} />
          </span>
          <span class="tv-setting__text">
            <span class="tv-setting__title">{account.login || `ID ${account.id}`}</span>
            <span class="tv-setting__desc">Открыть профиль</span>
          </span>
        </button>
        {#if canSwitchAccounts}
          <button type="button" class="tv-setting" onclick={(e) => openDialog('accounts', e)} disabled={busy}>
            <span class="tv-setting__text">
              <span class="tv-setting__title">Сменить аккаунт</span>
              <span class="tv-setting__desc">Быстрое переключение между сохранёнными аккаунтами</span>
            </span>
            <span class="tv-setting__value">{accounts.length > 1 ? accountsLabel(accounts.length) : ''}</span>
          </button>
        {/if}
        <button type="button" class="tv-setting" onclick={(e) => openDialog('logout', e)} disabled={busy}>
          <span class="tv-setting__text">
            <span class="tv-setting__title">Выйти из аккаунта</span>
          </span>
        </button>
      {:else}
        <button type="button" class="tv-setting" onclick={() => openLoginPrompt()}>
          <span class="tv-setting__text">
            <span class="tv-setting__title">Войти</span>
            <span class="tv-setting__desc">Закладки, история просмотра и профиль</span>
          </span>
        </button>
      {/if}
    </section>

    {#if upscaleAvailable}
      <section class="tv-settings__group" aria-label="Воспроизведение">
        <h2 class="tv-settings__group-title">Воспроизведение</h2>
        <button type="button" class="tv-setting" onclick={(e) => openDialog('upscale', e)}>
          <span class="tv-setting__text">
            <span class="tv-setting__title">Улучшение изображения</span>
            <span class="tv-setting__desc">Anime4K: чёткость и шумоподавление в плеере</span>
          </span>
          <span class="tv-setting__value">{upscaleLabel}</span>
        </button>
      </section>
    {/if}

    <section class="tv-settings__group" aria-label="Интерфейс">
      <h2 class="tv-settings__group-title">Интерфейс</h2>
      <button type="button" class="tv-setting" role="switch" aria-checked={debugMetrics} onclick={toggleMetrics}>
        <span class="tv-setting__text">
          <span class="tv-setting__title">Показывать Local metrics</span>
          <span class="tv-setting__desc">FPS и задержки поверх интерфейса</span>
        </span>
        <span class="tv-setting__switch" class:tv-setting__switch--on={debugMetrics} aria-hidden="true"></span>
      </button>
    </section>

    {#if window.anixApi?.client?.setBaseUrl}
      <section class="tv-settings__group" aria-label="Соединение">
        <h2 class="tv-settings__group-title">Соединение</h2>
        <button type="button" class="tv-setting" onclick={(e) => openDialog('endpoint', e)}>
          <span class="tv-setting__text">
            <span class="tv-setting__title">API-эндпоинт</span>
            <span class="tv-setting__desc">Смените, если тайтлы не загружаются</span>
          </span>
          <span class="tv-setting__value">{endpointLabel}</span>
        </button>
      </section>
    {/if}

    <section class="tv-settings__group" aria-label="Приложение">
      <h2 class="tv-settings__group-title">Приложение</h2>
      {#if bigPicture}
        <button type="button" class="tv-setting" onclick={() => exitBigPicture()}>
          <span class="tv-setting__text">
            <span class="tv-setting__title">Выйти из режима большого экрана</span>
            <span class="tv-setting__desc">Вернуться к обычному интерфейсу AnixApp</span>
          </span>
        </button>
      {/if}
      <button type="button" class="tv-setting" onclick={(e) => openDialog('quit', e)}>
        <span class="tv-setting__text">
          <span class="tv-setting__title">{bigPicture ? 'Закрыть AnixApp' : 'Выйти из приложения'}</span>
        </span>
        <span class="tv-setting__value">{version}</span>
      </button>
    </section>
  </div>
</TvPage>

{#if dialog}
  <TvChoiceDialog
    title={dialogTitle[dialog]}
    options={dialogOptions}
    value={dialogValue}
    danger={dialog === 'logout' || dialog === 'quit'}
    onSelect={onDialogSelect}
    onClose={closeDialog}
  />
{/if}
