<script lang="ts">
  import { tick, onMount } from 'svelte';
  import UiV2OutlinedField from '../components/uikit-v2/UiV2OutlinedField.svelte';
  import OAuthBrandIcon from '../components/OAuthBrandIcon.svelte';
  import AuthCoverGrid from '../components/AuthCoverGrid.svelte';
  import type { AuthCodeResult, OAuthSignInResult } from '../types/api';
  import { iconDownload } from '../components/icons';
  import { checkForUpdate, type UpdateInfo } from '../services/update-checker';
  import type { AppUpdateProgress } from '../types/electron';
  import ConnectionBanner from '../components/ConnectionBanner.svelte';

  interface Props {
    onSuccess: () => void;
    /** Закрыть оверлей без входа (гость) */
    onDismiss?: () => void;
    /** Показать «Продолжить без входа» */
    allowGuest?: boolean;
    /** Компактный оверлей поверх приложения */
    overlay?: boolean;
    onConnectionRetry?: () => void | Promise<void>;
  }

  let { onSuccess, onDismiss, allowGuest = false, overlay = false, onConnectionRetry }: Props = $props();

  type OAuthProvider = 'vk' | 'google' | 'telegram' | 'yandex';
  type AuthPanel =
    | 'signin'
    | 'register'
    | 'registerVerify'
    | 'forgot'
    | 'forgotVerify'
    | 'oauthSignup';

  const OAUTH_PROVIDERS: { id: OAuthProvider; label: string }[] = [
    { id: 'vk', label: 'Войти через VK' },
    { id: 'google', label: 'Войти через Google' },
    { id: 'telegram', label: 'Войти через Telegram' },
    { id: 'yandex', label: 'Войти через Яндекс' },
  ];

  const FADE_MS = 180;
  const SIZE_MS = 320;
  const MORPH_EASE = 'cubic-bezier(0.22, 1, 0.36, 1)';
  const EXIT_MS = 280;

  let panel = $state<AuthPanel>('signin');
  let panelKey = $state(0);
  let panelVisible = $state(true);
  let panelBusy = $state(false);
  let exiting = $state(false);

  let morphEl = $state<HTMLDivElement | null>(null);
  let morphInnerEl = $state<HTMLDivElement | null>(null);

  let login = $state('');
  let password = $state('');
  let errorText = $state('');
  let infoText = $state('');
  let isSubmitting = $state(false);
  let oauthBusy = $state<OAuthProvider | null>(null);

  let regLogin = $state('');
  let regEmail = $state('');
  let regPassword = $state('');
  let regPassword2 = $state('');
  let regCode = $state('');
  let regHash = $state('');
  let suggestedLogins = $state<string[]>([]);

  let restoreData = $state('');
  let restorePassword = $state('');
  let restorePassword2 = $state('');
  let restoreCode = $state('');
  let restoreHash = $state('');

  let signupProvider = $state<OAuthProvider | null>(null);
  let signupLogin = $state('');
  let signupEmail = $state('');

  const hasApi = typeof window !== 'undefined' && !!window.anixApi;

  const providerLabel: Record<OAuthProvider, string> = {
    vk: 'VK',
    google: 'Google',
    telegram: 'Telegram',
    yandex: 'Яндекс',
  };

  function prefersReducedMotion(): boolean {
    return typeof window !== 'undefined'
      && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  }

  function wait(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  async function playExitThen(done: () => void) {
    if (exiting) return;
    if (!overlay || prefersReducedMotion()) {
      done();
      return;
    }
    exiting = true;
    await wait(EXIT_MS);
    done();
  }

  function finishSuccess() {
    void playExitThen(() => onSuccess());
  }

  function finishDismiss() {
    if (!onDismiss) return;
    void playExitThen(() => onDismiss());
  }

  async function goPanel(next: AuthPanel, opts?: { info?: string }) {
    if (next === panel || panelBusy) return;
    const nextInfo = opts?.info ?? '';
    const shell = morphEl;
    const inner = morphInnerEl;

    if (prefersReducedMotion() || !shell || !inner) {
      panel = next;
      panelKey += 1;
      errorText = '';
      infoText = nextInfo;
      panelVisible = true;
      return;
    }

    panelBusy = true;

    // Lock current height without animating from "auto"
    const fromH = shell.offsetHeight;
    shell.style.transition = 'none';
    shell.style.height = `${fromH}px`;
    void shell.offsetHeight;

    panelVisible = false;
    await wait(FADE_MS);

    panel = next;
    panelKey += 1;
    errorText = '';
    infoText = nextInfo;
    await tick();

    // Natural height of new content (not clipped by overflow)
    const toH = Math.ceil(inner.scrollHeight);

    // Animate height + fade in together
    shell.style.transition = `height ${SIZE_MS}ms ${MORPH_EASE}`;
    void shell.offsetHeight;
    shell.style.height = `${toH}px`;
    panelVisible = true;
    await wait(SIZE_MS);

    shell.style.transition = 'none';
    shell.style.height = 'auto';
    void shell.offsetHeight;
    shell.style.transition = '';
    panelBusy = false;
  }

  function mapOAuthError(result: OAuthSignInResult | null | undefined, provider: OAuthProvider): string {
    if (!result) return `Ошибка входа через ${providerLabel[provider]}.`;
    if (result.cancelled) return '';
    if (result.error === 'oauth_electron_only') {
      return 'Вход через сервисы доступен только в приложении (Electron).';
    }
    if (result.error === 'timeout') return 'Время ожидания авторизации истекло.';
    if (result.error) return `Ошибка: ${result.error}`;
    const code = result.code;
    if (code === 2) return 'VK отклонил токен. Попробуйте ещё раз или войдите через другой сервис.';
    if (code === -1) return `Ошибка входа через ${providerLabel[provider]} (нет ответа API).`;
    if (code != null) return `Ошибка входа через ${providerLabel[provider]} (код ${code}).`;
    return `Ошибка входа через ${providerLabel[provider]}.`;
  }

  function mapRegisterError(code?: number, error?: string): string {
    if (error === 'fields_required') return 'Заполните все поля.';
    if (error) return `Ошибка: ${error}`;
    const map: Record<number, string> = {
      2: 'Некорректный никнейм.',
      3: 'Некорректный email.',
      4: 'Некорректный пароль.',
      5: 'Никнейм уже занят.',
      6: 'Email уже занят.',
      7: 'Код уже отправлен.',
      8: 'Не удалось отправить код.',
      9: 'Email-сервис недоступен.',
      10: 'Слишком много регистраций.',
    };
    if (code != null && map[code]) return map[code];
    if (code != null) return `Ошибка регистрации (код ${code}).`;
    return 'Не удалось зарегистрироваться.';
  }

  function mapVerifyError(code?: number, error?: string): string {
    if (error === 'fields_required') return 'Заполните все поля.';
    if (error) return `Ошибка: ${error}`;
    const map: Record<number, string> = {
      2: 'Некорректный никнейм.',
      3: 'Некорректный email.',
      4: 'Некорректный пароль.',
      5: 'Никнейм уже занят.',
      6: 'Email уже занят.',
      7: 'Код уже отправлен.',
      8: 'Не удалось отправить код.',
      9: 'Некорректный hash.',
      10: 'Email-сервис недоступен.',
      11: 'Слишком много регистраций.',
    };
    if (code != null && map[code]) return map[code];
    if (code != null) return `Ошибка подтверждения (код ${code}).`;
    return 'Не удалось подтвердить код.';
  }

  function mapRestoreError(code?: number, error?: string): string {
    if (error === 'data_required' || error === 'fields_required') return 'Никнейм или Email не указан';
    if (error) return `Ошибка: ${error}`;
    const map: Record<number, string> = {
      2: 'Профиль с указанным именем или Email не найден',
      3: 'Код уже отправлен.',
      4: 'Не удалось отправить код.',
    };
    if (code != null && map[code]) return map[code];
    if (code != null) return `Ошибка восстановления (код ${code}).`;
    return 'Не удалось начать восстановление.';
  }

  function mapRestoreVerifyError(code?: number, error?: string): string {
    if (error === 'fields_required') return 'Заполните все поля.';
    if (error) return `Ошибка: ${error}`;
    const map: Record<number, string> = {
      2: 'Аккаунт не найден.',
      3: 'Некорректный пароль.',
      4: 'Неверный код.',
      5: 'Код истёк.',
      6: 'Некорректный hash.',
    };
    if (code != null && map[code]) return map[code];
    if (code != null) return `Ошибка подтверждения (код ${code}).`;
    return 'Не удалось сменить пароль.';
  }

  function mapOAuthSignupError(code?: number, error?: string): string {
    if (error === 'login_email_required') return 'Укажите никнейм и email.';
    if (error === 'no_pending_oauth') return 'Сессия OAuth истекла. Войдите через сервис ещё раз.';
    if (error) return `Ошибка: ${error}`;
    const map: Record<number, string> = {
      2: 'Некорректный запрос.',
      4: 'Некорректный никнейм.',
      5: 'Некорректный email.',
      6: 'Никнейм уже занят.',
      7: 'Email уже занят.',
      8: 'Код уже отправлен.',
      9: 'Email-сервис недоступен.',
      10: 'Слишком много регистраций.',
    };
    if (code != null && map[code]) return map[code];
    if (code != null) return `Ошибка регистрации (код ${code}).`;
    return 'Не удалось завершить регистрацию.';
  }

  async function handleSignIn(e: SubmitEvent) {
    e.preventDefault();
    if (!login.trim() || !password) return;
    if (!window.anixApi) return;

    errorText = '';
    isSubmitting = true;

    try {
      const result = await window.anixApi.auth.signIn(login.trim(), password);
      if (result?.success) {
        finishSuccess();
        return;
      }
      const code = result?.code ?? -1;
      if (code === 401 || code === 2 || code === 3) errorText = 'Неверная почта/никнейм или пароль.';
      else if (code === 402) errorText = 'Аккаунт заблокирован.';
      else if (code === 403) errorText = 'Аккаунт заблокирован навсегда.';
      else errorText = `Ошибка входа (код ${code}).`;
    } catch (err) {
      errorText = `Ошибка: ${String(err)}`;
    } finally {
      isSubmitting = false;
    }
  }

  async function handleOAuth(provider: OAuthProvider) {
    if (!window.anixApi || oauthBusy || isSubmitting) return;
    errorText = '';
    oauthBusy = provider;

    try {
      const api = window.anixApi.auth;
      const result =
        provider === 'vk'
          ? await api.signInWithVk()
          : provider === 'google'
            ? await api.signInWithGoogle()
            : provider === 'telegram'
              ? await api.signInWithTelegram()
              : await api.signInWithYandex();

      if (result?.success) {
        finishSuccess();
        return;
      }
      if (result?.cancelled) return;

      if (result?.needsSignup) {
        signupProvider = provider;
        signupEmail = result.email?.trim() || '';
        signupLogin = result.suggestedLogins?.[0] || '';
        suggestedLogins = result.suggestedLogins || [];
        goPanel('oauthSignup');
        return;
      }

      errorText = mapOAuthError(result, provider);
    } catch (err) {
      errorText = `Ошибка: ${String(err)}`;
    } finally {
      oauthBusy = null;
    }
  }

  async function handleOAuthSignUp(e: SubmitEvent) {
    e.preventDefault();
    if (!window.anixApi || !signupProvider) return;
    if (!signupLogin.trim() || !signupEmail.trim()) {
      errorText = 'Укажите никнейм и email.';
      return;
    }

    errorText = '';
    isSubmitting = true;
    try {
      const result = await window.anixApi.auth.completeOAuthSignUp({
        login: signupLogin.trim(),
        email: signupEmail.trim(),
      });
      if (result?.success) {
        finishSuccess();
        return;
      }
      if (result?.needsVerify) {
        errorText =
          'Аккаунт создан, но нужна подтверждение email из приложения Anixart. Попробуйте войти через сервис после подтверждения.';
        return;
      }
      if (result?.suggestedLogins?.length) {
        suggestedLogins = result.suggestedLogins;
        if (!signupLogin.trim()) signupLogin = result.suggestedLogins[0];
      }
      errorText = mapOAuthSignupError(result?.code, result?.error);
    } catch (err) {
      errorText = `Ошибка: ${String(err)}`;
    } finally {
      isSubmitting = false;
    }
  }

  async function cancelOAuthSignup() {
    signupProvider = null;
    signupLogin = '';
    signupEmail = '';
    suggestedLogins = [];
    goPanel('signin');
    try {
      await window.anixApi?.auth.clearOAuthPending();
    } catch {
      /* ignore */
    }
  }

  async function handleRegister(e: SubmitEvent) {
    e.preventDefault();
    if (!window.anixApi) return;
    if (!regLogin.trim() || !regEmail.trim() || !regPassword) {
      errorText = 'Заполните все поля.';
      return;
    }
    if (regPassword !== regPassword2) {
      errorText = 'Пароли не совпадают.';
      return;
    }
    if (regPassword.length < 6) {
      errorText = 'Пароль слишком короткий.';
      return;
    }

    errorText = '';
    isSubmitting = true;
    try {
      const result: AuthCodeResult = await window.anixApi.auth.signUp({
        login: regLogin.trim(),
        email: regEmail.trim(),
        password: regPassword,
      });
      if (result?.suggestedLogins?.length) suggestedLogins = result.suggestedLogins;
      if (result?.hash) {
        regHash = result.hash;
        goPanel('registerVerify', { info: 'Код отправлен на email. Введите его ниже.' });
        return;
      }
      errorText = mapRegisterError(result?.code, result?.error);
    } catch (err) {
      errorText = `Ошибка: ${String(err)}`;
    } finally {
      isSubmitting = false;
    }
  }

  async function handleRegisterVerify(e: SubmitEvent) {
    e.preventDefault();
    if (!window.anixApi || !regHash) return;
    const code = Number(String(regCode).trim());
    if (!Number.isFinite(code)) {
      errorText = 'Введите код из письма.';
      return;
    }

    errorText = '';
    isSubmitting = true;
    try {
      const result = await window.anixApi.auth.signUpVerify({
        login: regLogin.trim(),
        email: regEmail.trim(),
        password: regPassword,
        hash: regHash,
        code,
      });
      if (result?.success) {
          if (result.needsLogin) {
            login = regLogin.trim();
            password = regPassword;
            goPanel('signin', { info: 'Аккаунт подтверждён. Войдите с новым паролем.' });
            return;
          }
        finishSuccess();
        return;
      }
      errorText = mapVerifyError(result?.code, result?.error);
    } catch (err) {
      errorText = `Ошибка: ${String(err)}`;
    } finally {
      isSubmitting = false;
    }
  }

  async function handleRegisterResend() {
    if (!window.anixApi || !regHash || isSubmitting) return;
    isSubmitting = true;
    errorText = '';
    try {
      const result = await window.anixApi.auth.signUpResend({
        login: regLogin.trim(),
        email: regEmail.trim(),
        password: regPassword,
        hash: regHash,
      });
      if (result?.success) {
        if (result.hash) regHash = result.hash;
        infoText = 'Код отправлен повторно.';
        return;
      }
      errorText = mapRegisterError(result?.code, result?.error);
    } catch (err) {
      errorText = `Ошибка: ${String(err)}`;
    } finally {
      isSubmitting = false;
    }
  }

  async function handleForgot(e: SubmitEvent) {
    e.preventDefault();
    if (!window.anixApi) return;
    if (!restoreData.trim()) {
      errorText = 'Никнейм или Email не указан';
      return;
    }
    if (!restorePassword) {
      errorText = 'Укажите новый пароль.';
      return;
    }
    if (restorePassword !== restorePassword2) {
      errorText = 'Пароль не совпадает';
      return;
    }
    if (restorePassword.length < 6) {
      errorText = 'Пароль слишком короткий.';
      return;
    }
    if (restorePassword.length > 32) {
      errorText = 'Пароль слишком длинный.';
      return;
    }

    errorText = '';
    isSubmitting = true;
    try {
      const result = await window.anixApi.auth.restore(restoreData.trim());
      if (result?.hash) {
        restoreHash = result.hash;
        goPanel('forgotVerify', {
          info: restoreData.includes('@')
            ? `Код отправлен на ${restoreData.trim()}`
            : `Код отправлен на email профиля ${restoreData.trim()}`,
        });
        return;
      }
      errorText = mapRestoreError(result?.code, result?.error);
    } catch (err) {
      errorText = `Ошибка: ${String(err)}`;
    } finally {
      isSubmitting = false;
    }
  }

  async function handleForgotVerify(e: SubmitEvent) {
    e.preventDefault();
    if (!window.anixApi || !restoreHash) return;
    const code = Number(String(restoreCode).trim());
    if (!Number.isFinite(code)) {
      errorText = 'Введите код из письма.';
      return;
    }

    errorText = '';
    isSubmitting = true;
    try {
      const result = await window.anixApi.auth.restoreVerify({
        data: restoreData.trim(),
        password: restorePassword,
        hash: restoreHash,
        code,
      });
      if (result?.success) {
        if (result.needsLogin) {
          login = restoreData.trim();
          password = restorePassword;
          goPanel('signin', { info: 'Пароль изменён. Войдите с новым паролем.' });
          return;
        }
        finishSuccess();
        return;
      }
      errorText = mapRestoreVerifyError(result?.code, result?.error);
    } catch (err) {
      errorText = `Ошибка: ${String(err)}`;
    } finally {
      isSubmitting = false;
    }
  }

  async function handleForgotResend() {
    if (!window.anixApi || !restoreHash || isSubmitting) return;
    if (!restorePassword) {
      errorText = 'Сессия восстановления повреждена. Начните заново.';
      return;
    }
    isSubmitting = true;
    errorText = '';
    try {
      const result = await window.anixApi.auth.restoreResend({
        data: restoreData.trim(),
        password: restorePassword,
        hash: restoreHash,
      });
      if (result?.success) {
        if (result.hash) restoreHash = result.hash;
        infoText = 'Код успешно отправлен повторно.';
        return;
      }
      errorText = mapRestoreError(result?.code, result?.error);
    } catch (err) {
      errorText = `Ошибка: ${String(err)}`;
    } finally {
      isSubmitting = false;
    }
  }

  function openForgot() {
    restoreData = login.trim();
    restorePassword = '';
    restorePassword2 = '';
    restoreCode = '';
    restoreHash = '';
    goPanel('forgot');
  }

  function openRegister() {
    regLogin = '';
    regEmail = login.includes('@') ? login.trim() : '';
    regPassword = '';
    regPassword2 = '';
    regCode = '';
    regHash = '';
    suggestedLogins = [];
    goPanel('register');
  }

  function openSignIn() {
    if (regEmail.trim()) login = regEmail.trim();
    goPanel('signin');
  }

  const isAuthMain = $derived(panel === 'signin' || panel === 'register');
  const isRegister = $derived(panel === 'register');

  const subtitle = $derived.by(() => {
    if (panel === 'oauthSignup' && signupProvider) {
      return `Завершите регистрацию через ${providerLabel[signupProvider]}`;
    }
    if (panel === 'register') return 'Создайте аккаунт Anixart по почте или через сервис.';
    if (panel === 'registerVerify') return 'Подтвердите email кодом из письма';
    if (panel === 'forgot') return 'Восстановление пароля';
    if (panel === 'forgotVerify') return 'Введите код подтверждения из письма';
    if (overlay) return 'Войдите, чтобы открыть этот раздел. Можно войти по почте или никнейму Anixart.';
    return 'Войдите по почте или никнейму Anixart';
  });

  const busy = $derived(isSubmitting || !!oauthBusy);
  const hasWindowApi = typeof window !== 'undefined' && !!window.electron?.window;
  let appVersion = $state('');
  let updateInfo: UpdateInfo | null = $state(null);
  let updateDownloading = $state(false);
  let updatePct = $state(0);
  let updateState: 'idle' | 'downloading' | 'ready' | 'error' | 'installing' | 'install-error' = $state('idle');
  let installType: string | null = $state(null);

  function installLabel(): string {
    if (installType === 'appimage') return 'Установить и перезапустить';
    if (installType === 'pacman') return 'Установить (Arch)';
    if (installType === 'flatpak') return 'Обновить (Flatpak)';
    return 'Установить';
  }

  function installTooltip(): string {
    if (installType === 'appimage') return 'Файл скачан — приложение заменится и перезапустится';
    if (installType === 'pacman') return 'Откроется окно pkexec (ввод пароля root)';
    if (installType === 'flatpak') return 'Запустится flatpak update';
    return 'Откроется установщик пакета';
  }

  function handleStartUpdate() {
    if (updateState === 'ready') {
      window.electron?.installUpdate?.();
      return;
    }
    if (updateDownloading || !updateInfo) return;
    updateDownloading = true;
    updateState = 'downloading';
    updatePct = 0;
    window.electron?.startUpdateDownload?.().catch(() => {
      updateDownloading = false;
      updateState = 'error';
    });
  }

  onMount(() => {
    void (async () => {
      try {
        const versions = await window.electron?.getVersions?.();
        const v = versions?.app || (await window.electron?.getAppVersion?.());
        if (v) {
          appVersion = String(v).replace(/^v/i, '');
          const info = await checkForUpdate(String(v)).catch(() => null);
          if (info) updateInfo = info;
        }
      } catch {
        // ignore
      }
    })();

    window.electron?.getLinuxInstallType?.().then((t) => {
      if (t) installType = t;
    }).catch(() => {});

    const onProgress = (ev: Event) => {
      const data = (ev as CustomEvent<AppUpdateProgress>).detail;
      if (data.installType && !installType) installType = data.installType;
      if (data.state === 'downloading') {
        updatePct = data.total > 0 ? Math.round((data.received / data.total) * 100) : data.percent || 0;
        updateState = 'downloading';
      } else if (data.state === 'ready') {
        updateState = 'ready';
        updatePct = 100;
      } else if (data.state === 'error') {
        updateState = 'error';
        updateDownloading = false;
      } else if (data.state === 'installing') {
        updateState = 'installing';
      } else if (data.state === 'install-error') {
        updateState = 'ready';
        updateDownloading = false;
      }
    };
    window.addEventListener('app-update-progress', onProgress);
    return () => window.removeEventListener('app-update-progress', onProgress);
  });
</script>

<div class="view view-auth view-auth--v2" class:view-auth--overlay={overlay} class:view-auth--fullscreen={!overlay} class:view-auth--exiting={exiting}>
  <div class="titlebar titlebar--auth" role="banner">
    <div class="titlebar__drag">
      <span class="titlebar__logo" aria-hidden="true">
        <img src="logo/512x512.png" alt="" class="titlebar__logo-img" />
      </span>
      <div class="titlebar__brand" title={appVersion ? `AnixApp v${appVersion}` : 'AnixApp beta'}>
        <span class="titlebar__title">AnixApp</span>
        <span class="titlebar__beta">beta</span>
        {#if appVersion}
          <span class="titlebar__version">v{appVersion}</span>
        {/if}
      </div>
    </div>

    <div class="titlebar__menu">
      <ConnectionBanner onRetry={onConnectionRetry} />
      {#if updateInfo}
        {#if updateState === 'downloading'}
          <button
            type="button"
            class="titlebar__menu-item titlebar__menu-item--update titlebar__menu-item--update-downloading"
            aria-label="Загрузка обновления {updatePct}%"
          >
            <span class="titlebar__update-fill" style="width:{updatePct}%"></span>
            {@html iconDownload(14)}
            <span class="titlebar__update-label">{updatePct}%</span>
          </button>
        {:else if updateState === 'installing'}
          <button
            type="button"
            class="titlebar__menu-item titlebar__menu-item--update titlebar__menu-item--update-downloading tooltip-trigger"
            aria-label="Установка обновления…"
          >
            <span class="titlebar__update-fill titlebar__update-fill--pulse" style="width:100%"></span>
            {@html iconDownload(14)}
            <span class="titlebar__update-label">Установка…</span>
            <span class="tooltip tooltip--animated">Введите пароль в диалоге авторизации</span>
          </button>
        {:else if updateState === 'ready'}
          <button
            type="button"
            class="titlebar__menu-item titlebar__menu-item--update titlebar__menu-item--update-downloading titlebar__menu-item--update-ready tooltip-trigger"
            aria-label={installLabel()}
            onclick={handleStartUpdate}
          >
            <span class="titlebar__update-fill" style="width:100%"></span>
            {@html iconDownload(14)}
            <span class="titlebar__update-label">{installLabel()}</span>
            <span class="tooltip tooltip--animated">{installTooltip()}</span>
          </button>
        {:else}
          <button
            type="button"
            class="titlebar__menu-item titlebar__menu-item--update tooltip-trigger"
            aria-label="Доступно обновление"
            onclick={handleStartUpdate}
          >
            <span class="titlebar__update-icon">{@html iconDownload(18)}</span>
            <span class="titlebar__update-dot" aria-hidden="true"></span>
            <span class="tooltip tooltip--animated">
              {updateState === 'error'
                ? 'Ошибка загрузки. Нажмите для повтора'
                : `Доступна версия ${updateInfo.version}. Нажмите для загрузки.`}
            </span>
          </button>
        {/if}
      {/if}
    </div>

    {#if hasWindowApi}
      <div class="titlebar__controls">
        <button
          type="button"
          class="titlebar__btn titlebar__btn--min"
          aria-label="Свернуть"
          onclick={() => window.electron?.window?.minimize?.()}
        ></button>
        <button
          type="button"
          class="titlebar__btn titlebar__btn--max"
          aria-label="Развернуть"
          onclick={() => window.electron?.window?.maximize?.()}
        ></button>
        <button
          type="button"
          class="titlebar__btn titlebar__btn--close"
          aria-label="Закрыть"
          onclick={() => window.electron?.window?.close?.()}
        ></button>
      </div>
    {/if}
  </div>

  <div class="view-auth__body">
    <div class="view-auth__covers">
      <AuthCoverGrid />
    </div>

    <div class="view-auth__panel">
    <div class="auth auth--v2" role={overlay ? 'dialog' : undefined} aria-modal={overlay || undefined} aria-label="Вход">
      <h1 class="auth__title">AnixApp</h1>

      <div class="auth__morph" bind:this={morphEl}>
        <div
          class="auth__morph-inner"
          class:auth__morph-inner--hidden={!panelVisible}
          bind:this={morphInnerEl}
        >
          <p class="auth__subtitle">{subtitle}</p>

          {#if !hasApi}
            <p class="auth-form__error">API недоступно. Запустите <code>npm run electron:dev</code>.</p>
          {:else}
            {#key panelKey}
              <div class="auth-panel">
                {#if isAuthMain}
              <form
                class="auth-form"
                onsubmit={(e) => {
                  if (isRegister) void handleRegister(e);
                  else void handleSignIn(e);
                }}
              >
                {#if isRegister}
                  <UiV2OutlinedField
                    label="Никнейм"
                    bind:value={regLogin}
                    autocomplete="username"
                    maxlength={20}
                    required
                    disabled={busy}
                  />
                  {#if suggestedLogins.length}
                    <div class="auth-oauth__suggestions" role="list">
                      {#each suggestedLogins as suggestion}
                        <button
                          type="button"
                          class="auth-oauth__chip"
                          disabled={busy}
                          onclick={() => { regLogin = suggestion; }}
                        >
                          {suggestion}
                        </button>
                      {/each}
                    </div>
                  {/if}
                  <UiV2OutlinedField
                    label="Почта"
                    type="email"
                    bind:value={regEmail}
                    autocomplete="email"
                    required
                    disabled={busy}
                  />
                  <UiV2OutlinedField
                    label="Пароль"
                    type="password"
                    bind:value={regPassword}
                    autocomplete="new-password"
                    maxlength={32}
                    required
                    disabled={busy}
                    revealable
                  />
                  <UiV2OutlinedField
                    label="Повторите пароль"
                    type="password"
                    bind:value={regPassword2}
                    autocomplete="new-password"
                    maxlength={32}
                    required
                    disabled={busy}
                    revealable
                  />
                {:else}
                  <UiV2OutlinedField
                    label="Почта или никнейм"
                    bind:value={login}
                    autocomplete="username"
                    inputmode="email"
                    required
                    disabled={busy}
                  />
                  <UiV2OutlinedField
                    label="Пароль"
                    type="password"
                    bind:value={password}
                    autocomplete="current-password"
                    required
                    disabled={busy}
                    revealable
                  />
                  <div class="auth-form__forgot">
                    <button
                      type="button"
                      class="auth-link"
                      disabled={busy}
                      onclick={openForgot}
                    >
                      Забыли пароль?
                    </button>
                  </div>
                {/if}

                {#if infoText}
                  <p class="auth-form__info" role="status">{infoText}</p>
                {/if}
                {#if errorText}
                  <p class="auth-form__error" role="alert">{errorText}</p>
                {/if}

                <button
                  type="submit"
                  class="uiv2-btn uiv2-btn--lg uiv2-btn--primary uiv2-btn--block auth-form__submit"
                  disabled={busy}
                >
                  <span class="uiv2-btn__label">
                    {#if isRegister}
                      {isSubmitting ? 'Регистрация…' : 'Создать аккаунт'}
                    {:else}
                      {isSubmitting ? 'Вход…' : 'Войти'}
                    {/if}
                  </span>
                </button>

                <div
                  class="auth-oauth"
                  aria-label={isRegister ? 'Регистрация через сервисы' : 'Вход через сервисы'}
                >
                  <p class="auth-oauth__divider">
                    <span>{isRegister ? 'Способы регистрации' : 'Способы входа'}</span>
                  </p>
                  <div class="auth-oauth__icons" role="group" aria-label="Сервисы">
                    {#each OAUTH_PROVIDERS as provider, i (provider.id)}
                      <button
                        type="button"
                        class="auth-oauth__icon-btn auth-oauth__icon-btn--{provider.id}"
                        class:auth-oauth__icon-btn--busy={oauthBusy === provider.id}
                        class:auth-oauth__icon-btn--dimmed={oauthBusy && oauthBusy !== provider.id}
                        style="--oauth-i: {i}"
                        disabled={busy}
                        aria-label="{isRegister ? 'Регистрация' : 'Войти'} через {providerLabel[provider.id]}"
                        title="{isRegister ? 'Регистрация' : 'Войти'} через {providerLabel[provider.id]}"
                        onclick={() => handleOAuth(provider.id)}
                      >
                        <span class="auth-oauth__icon-face">
                          <OAuthBrandIcon provider={provider.id} size={28} />
                        </span>
                        {#if oauthBusy === provider.id}
                          <span class="auth-oauth__spinner" aria-hidden="true"></span>
                        {/if}
                      </button>
                    {/each}
                  </div>
                </div>

                <p class="auth-switch">
                  {#if isRegister}
                    Уже есть аккаунт?
                    <button type="button" class="auth-link" disabled={busy} onclick={openSignIn}>
                      Войти
                    </button>
                  {:else}
                    Нет аккаунта?
                    <button type="button" class="auth-link" disabled={busy} onclick={openRegister}>
                      Регистрация
                    </button>
                  {/if}
                </p>

                {#if !isRegister && allowGuest && onDismiss}
                  <div class="auth-form__guest-wrap">
                    <button
                      type="button"
                      class="uiv2-btn uiv2-btn--lg uiv2-btn--chrome uiv2-btn--block"
                      disabled={busy}
                      onclick={() => finishDismiss()}
                    >
                      <span class="uiv2-btn__label">Продолжить без входа</span>
                    </button>
                  </div>
                {/if}
              </form>

            {:else if panel === 'registerVerify'}
              <form class="auth-form" onsubmit={handleRegisterVerify}>
                {#if infoText}
                  <p class="auth-form__info" role="status">{infoText}</p>
                {/if}
                <UiV2OutlinedField
                  label="Код из письма"
                  bind:value={regCode}
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  required
                  disabled={busy}
                />
                {#if errorText}
                  <p class="auth-form__error" role="alert">{errorText}</p>
                {/if}
                <button
                  type="submit"
                  class="uiv2-btn uiv2-btn--lg uiv2-btn--primary uiv2-btn--block auth-form__submit"
                  disabled={busy}
                >
                  <span class="uiv2-btn__label">{isSubmitting ? 'Проверка…' : 'Подтвердить'}</span>
                </button>
                <div class="auth-form__guest-wrap">
                  <button
                    type="button"
                    class="uiv2-btn uiv2-btn--lg uiv2-btn--chrome uiv2-btn--block"
                    disabled={busy}
                    onclick={() => handleRegisterResend()}
                  >
                    <span class="uiv2-btn__label">Отправить код ещё раз</span>
                  </button>
                </div>
                <p class="auth-switch">
                  <button type="button" class="auth-link" disabled={busy} onclick={() => goPanel('register')}>
                    Назад
                  </button>
                </p>
              </form>

            {:else if panel === 'forgot'}
              <form class="auth-form" onsubmit={handleForgot}>
                <UiV2OutlinedField
                  label="Email или никнейм"
                  bind:value={restoreData}
                  autocomplete="username"
                  inputmode="email"
                  maxlength={255}
                  required
                  disabled={busy}
                />
                <UiV2OutlinedField
                  label="Новый пароль"
                  type="password"
                  bind:value={restorePassword}
                  autocomplete="new-password"
                  maxlength={32}
                  required
                  disabled={busy}
                  revealable
                />
                <UiV2OutlinedField
                  label="Повторите пароль"
                  type="password"
                  bind:value={restorePassword2}
                  autocomplete="new-password"
                  maxlength={32}
                  required
                  disabled={busy}
                  revealable
                />
                {#if errorText}
                  <p class="auth-form__error" role="alert">{errorText}</p>
                {/if}
                <button
                  type="submit"
                  class="uiv2-btn uiv2-btn--lg uiv2-btn--primary uiv2-btn--block auth-form__submit"
                  disabled={busy}
                >
                  <span class="uiv2-btn__label">{isSubmitting ? 'Отправка…' : 'Продолжить'}</span>
                </button>
                <p class="auth-switch">
                  Вспомнили пароль?
                  <button type="button" class="auth-link" disabled={busy} onclick={() => goPanel('signin')}>
                    Войти
                  </button>
                </p>
              </form>

            {:else if panel === 'forgotVerify'}
              <form class="auth-form" onsubmit={handleForgotVerify}>
                {#if infoText}
                  <p class="auth-form__info" role="status">{infoText}</p>
                {/if}
                <UiV2OutlinedField
                  label="Код из письма"
                  bind:value={restoreCode}
                  inputmode="numeric"
                  autocomplete="one-time-code"
                  required
                  disabled={busy}
                />
                {#if errorText}
                  <p class="auth-form__error" role="alert">{errorText}</p>
                {/if}
                <button
                  type="submit"
                  class="uiv2-btn uiv2-btn--lg uiv2-btn--primary uiv2-btn--block auth-form__submit"
                  disabled={busy}
                >
                  <span class="uiv2-btn__label">{isSubmitting ? 'Проверка…' : 'Подтвердить'}</span>
                </button>
                <div class="auth-form__guest-wrap">
                  <button
                    type="button"
                    class="uiv2-btn uiv2-btn--lg uiv2-btn--chrome uiv2-btn--block"
                    disabled={busy}
                    onclick={() => handleForgotResend()}
                  >
                    <span class="uiv2-btn__label">Отправить код ещё раз</span>
                  </button>
                </div>
                <p class="auth-switch">
                  <button type="button" class="auth-link" disabled={busy} onclick={() => goPanel('forgot')}>
                    Назад
                  </button>
                </p>
              </form>

            {:else if panel === 'oauthSignup'}
              <form class="auth-form" onsubmit={handleOAuthSignUp}>
                <UiV2OutlinedField
                  label="Никнейм"
                  bind:value={signupLogin}
                  autocomplete="username"
                  required
                  disabled={busy}
                />
                {#if suggestedLogins.length}
                  <div class="auth-oauth__suggestions" role="list">
                    {#each suggestedLogins as suggestion}
                      <button
                        type="button"
                        class="auth-oauth__chip"
                        disabled={busy}
                        onclick={() => { signupLogin = suggestion; }}
                      >
                        {suggestion}
                      </button>
                    {/each}
                  </div>
                {/if}
                <UiV2OutlinedField
                  label="Почта"
                  type="email"
                  bind:value={signupEmail}
                  autocomplete="email"
                  required
                  disabled={busy}
                />
                {#if errorText}
                  <p class="auth-form__error" role="alert">{errorText}</p>
                {/if}
                <button
                  type="submit"
                  class="uiv2-btn uiv2-btn--lg uiv2-btn--primary uiv2-btn--block auth-form__submit"
                  disabled={busy}
                >
                  <span class="uiv2-btn__label">{isSubmitting ? 'Регистрация…' : 'Создать аккаунт'}</span>
                </button>
                <div class="auth-form__guest-wrap">
                  <button
                    type="button"
                    class="uiv2-btn uiv2-btn--lg uiv2-btn--chrome uiv2-btn--block"
                    disabled={busy}
                    onclick={() => cancelOAuthSignup()}
                  >
                    <span class="uiv2-btn__label">Назад</span>
                  </button>
                </div>
              </form>
            {/if}
              </div>
            {/key}
          {/if}
        </div>
      </div>
    </div>
    </div>
  </div>
</div>
