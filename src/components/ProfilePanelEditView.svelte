<script lang="ts">
  import { onMount } from 'svelte';
  import { iconPencil, iconShare } from './icons';
  import OAuthBrandIcon from './OAuthBrandIcon.svelte';
  import { showToast } from '../stores/toast';
  import { toCdnProxyUrl } from '../utils/posterUrl';
  import { formatHistoryViewTime } from '../utils/historyFormat';
  import UiV2BackBar from './uikit-v2/UiV2BackBar.svelte';
  import UiV2ChoiceSheet from './uikit-v2/UiV2ChoiceSheet.svelte';
  import UiV2OutlinedField from './uikit-v2/UiV2OutlinedField.svelte';

  type EditScreen = 'menu' | 'status' | 'nickname' | 'social';

  interface LoginHistoryItem {
    id: number;
    login: string;
    timestamp: number;
  }

  interface Props {
    profileId: number;
    login: string;
    status?: string;
    badgeName?: string | null;
    badgeUrl?: string | null;
    startScreen?: EditScreen;
    onBack: () => void;
    onProfilePatched?: (patch: Record<string, unknown>) => void;
  }

  let {
    profileId,
    login,
    status = '',
    badgeName = null,
    badgeUrl = null,
    startScreen = 'menu',
    onBack,
    onProfilePatched,
  }: Props = $props();

  type PrivacyVal = 0 | 1 | 2;
  type PrivacyKind = 'stats' | 'counts' | 'social' | 'friends';

  const PRIVACY_LABELS: Record<number, string> = {
    0: 'Все пользователи',
    1: 'Только друзья',
    2: 'Только я',
  };
  const PRIVACY_FR_LABELS: Record<number, string> = {
    0: 'Все пользователи',
    1: 'Только я',
  };

  const PRIVACY_ROWS: { kind: PrivacyKind; title: string }[] = [
    {
      kind: 'stats',
      title: 'Кто видит мою статистику, оценки и историю просмотра',
    },
    {
      kind: 'counts',
      title: 'Кто видит в профиле мои комментарии, коллекции, видео и друзей',
    },
    {
      kind: 'social',
      title: 'Кто видит мои социальные сети',
    },
    {
      kind: 'friends',
      title: 'Кто может отправлять мне заявки в друзья',
    },
  ];

  let screen = $state<EditScreen>(startScreen);
  let loadState = $state<'loading' | 'ready' | 'error'>('loading');

  let statusValue = $state('');
  let statusSaving = $state(false);

  /** Как в Anixart: dialog_change_login maxLength=20, сервер code=2 при коротком/невалидном. */
  const LOGIN_MIN = 3;
  const LOGIN_MAX = 20;
  const LOGIN_RE = /^[A-Za-z0-9_]+$/;

  type LoginCheckStatus = 'idle' | 'same' | 'short' | 'invalid' | 'checking' | 'available' | 'taken';

  let loginValue = $state('');
  let loginSaving = $state(false);
  let canChangeLogin = $state(true);
  let nextChangeAt = $state<number | null>(null);
  let loginHistory = $state<LoginHistoryItem[]>([]);
  let loginHistoryState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let loginCheckStatus = $state<LoginCheckStatus>('idle');
  let loginCheckMsg = $state('');
  let loginCheckSeq = 0;

  let socialValues = $state({
    vk_page: '',
    tg_page: '',
    inst_page: '',
    tt_page: '',
    discord_page: '',
  });
  let socialSaving = $state(false);

  let privacyStats = $state<PrivacyVal>(0);
  let privacyCounts = $state<PrivacyVal>(0);
  let privacySocial = $state<PrivacyVal>(0);
  let privacyFriendRequests = $state<0 | 1>(0);
  let privacySaving = $state(false);
  let privacyPicker = $state<{ kind: PrivacyKind; title: string } | null>(null);

  let logoutBusy = $state(false);

  type OAuthService = 'vk' | 'google' | 'telegram' | 'yandex';
  const OAUTH_SERVICES: {
    id: OAuthService;
    title: string;
    unlinkConfirm: string;
    linkedMsg: string;
    unlinkedMsg: string;
  }[] = [
    {
      id: 'vk',
      title: 'ВКонтакте',
      unlinkConfirm:
        'Учётная запись ВКонтакте будет отвязана от этого аккаунта. Вход будет возможен только по логину и паролю, если больше нет привязки к другим сервисам. Вы действительно хотите продолжить?',
      linkedMsg: 'Учётная запись ВКонтакте была успешно привязана к Вашему аккаунту.',
      unlinkedMsg: 'Учётная запись ВКонтакте была успешно отвязана от Вашего аккаунта.',
    },
    {
      id: 'google',
      title: 'Google',
      unlinkConfirm:
        'Учётная запись Google будет отвязана от этого аккаунта. Вход будет возможен только по логину и паролю, если больше нет привязки к другим сервисам. Вы действительно хотите продолжить?',
      linkedMsg: 'Учётная запись Google была успешно привязана к Вашему аккаунту.',
      unlinkedMsg: 'Учётная запись Google была успешно отвязана от Вашего аккаунта.',
    },
    {
      id: 'telegram',
      title: 'Telegram',
      unlinkConfirm:
        'Учётная запись Telegram будет отвязана от этого аккаунта. Вход будет возможен только по логину и паролю, если больше нет привязки к другим сервисам. Вы действительно хотите продолжить?',
      linkedMsg: 'Учётная запись Telegram была успешно привязана к Вашему аккаунту.',
      unlinkedMsg: 'Учётная запись Telegram была успешно отвязана от Вашего аккаунта.',
    },
    {
      id: 'yandex',
      title: 'Яндекс',
      unlinkConfirm:
        'Учётная запись Яндекс будет отвязана от этого аккаунта. Вход будет возможен только по логину и паролю, если больше нет привязки к другим сервисам. Вы действительно хотите продолжить?',
      linkedMsg: 'Учётная запись Яндекс была успешно привязана к Вашему аккаунту.',
      unlinkedMsg: 'Учётная запись Яндекс была успешно отвязана от Вашего аккаунта.',
    },
  ];

  let boundVk = $state(false);
  let boundGoogle = $state(false);
  let boundTelegram = $state(false);
  let boundYandex = $state(false);
  let oauthBusy = $state<OAuthService | null>(null);

  function isServiceBound(id: OAuthService): boolean {
    if (id === 'vk') return boundVk;
    if (id === 'google') return boundGoogle;
    if (id === 'telegram') return boundTelegram;
    return boundYandex;
  }

  function setServiceBound(id: OAuthService, value: boolean) {
    if (id === 'vk') boundVk = value;
    else if (id === 'google') boundGoogle = value;
    else if (id === 'telegram') boundTelegram = value;
    else boundYandex = value;
  }

  function applyBoundFlags(settings: Record<string, unknown>) {
    boundVk = !!(settings.is_vk_bound ?? settings.isVkBound);
    boundGoogle = !!(
      settings.is_google_bound
      ?? settings.is_goolge_bound
      ?? settings.isGoogleBound
    );
    boundTelegram = !!(settings.is_telegram_bound ?? settings.isTelegramBound);
    boundYandex = !!(settings.is_yandex_bound ?? settings.isYandexBound);
  }

  function bindErrorMessage(service: (typeof OAUTH_SERVICES)[number], code?: number, error?: string): string {
    if (error === 'cancelled') return '';
    if (error === 'oauth_electron_only') return 'Привязка доступна только в приложении (Electron).';
    if (error === 'timeout') return 'Время ожидания авторизации истекло.';
    if (error) return `Ошибка: ${error}`;
    if (code === 2) return 'Не удалось привязать аккаунт. Попробуйте ещё раз.';
    if (code === 3) return `Этот аккаунт ${service.title} уже привязан к другой учётной записи`;
    return `Не удалось привязать ${service.title}`;
  }

  function unbindErrorMessage(service: (typeof OAUTH_SERVICES)[number], code?: number, error?: string): string {
    if (error) return `Ошибка: ${error}`;
    if (code === 2) return `К этой учётной записи не привязан аккаунт ${service.title}`;
    return `Не удалось отвязать ${service.title}`;
  }

  async function toggleOAuthService(id: OAuthService) {
    const service = OAUTH_SERVICES.find((s) => s.id === id);
    const api = window.anixApi?.auth;
    if (!service || !api || oauthBusy) return;

    if (isServiceBound(id)) {
      if (!api.unbindOAuthService) return;
      if (!confirm(service.unlinkConfirm)) return;
      oauthBusy = id;
      try {
        const res = await api.unbindOAuthService(id);
        if (res?.success) {
          setServiceBound(id, false);
          showToast(service.unlinkedMsg);
        } else if (!res?.cancelled) {
          showToast(unbindErrorMessage(service, res?.code, res?.error), 'err');
        }
      } catch {
        showToast(`Не удалось отвязать ${service.title}`, 'err');
      } finally {
        oauthBusy = null;
      }
      return;
    }

    if (!api.bindOAuthService) return;
    oauthBusy = id;
    try {
      const res = await api.bindOAuthService(id);
      if (res?.success) {
        setServiceBound(id, true);
        showToast(service.linkedMsg);
      } else if (!res?.cancelled) {
        const msg = bindErrorMessage(service, res?.code, res?.error);
        if (msg) showToast(msg, 'err');
      }
    } catch {
      showToast(`Не удалось привязать ${service.title}`, 'err');
    } finally {
      oauthBusy = null;
    }
  }

  const headTitle = $derived.by(() => {
    switch (screen) {
      case 'status': return 'Изменить статус';
      case 'nickname': return 'Изменить никнейм';
      case 'social': return 'Социальные сети';
      default: return 'Редактирование';
    }
  });

  const backSegments = $derived(
    screen === 'menu'
      ? [
          { label: headTitle, active: true },
          { label: login },
        ]
      : [{ label: headTitle, active: true }],
  );

  const statusPreview = $derived(statusValue.trim() || status.trim() || 'Не указан');

  function goMenu() {
    screen = 'menu';
  }

  function onHeadBack() {
    if (screen === 'menu') onBack();
    else goMenu();
  }

  function soon() {
    showToast('Скоро', 'err');
  }

  async function loadSettings() {
    const api = window.anixApi?.settings;
    if (!api?.getProfileSettings) {
      loadState = 'error';
      return;
    }
    loadState = 'loading';
    try {
      const [settings, social, loginInfo] = await Promise.all([
        api.getProfileSettings(),
        api.getSocial(),
        api.getLoginInfo(),
      ]);
      statusValue = String(settings.status ?? status ?? '');
      const s = social as Record<string, unknown>;
      socialValues = {
        vk_page: String(s.vk_page ?? s.vkPage ?? ''),
        tg_page: String(s.tg_page ?? s.tgPage ?? ''),
        inst_page: String(s.inst_page ?? s.instPage ?? ''),
        tt_page: String(s.tt_page ?? s.ttPage ?? ''),
        discord_page: String(s.discord_page ?? s.discordPage ?? ''),
      };
      loginValue = String(loginInfo.login ?? login);
      const info = loginInfo as {
        is_change_avaliable?: boolean;
        is_change_available?: boolean;
        next_change_avaliable_at?: number;
        next_change_available_at?: number;
      };
      canChangeLogin = info.is_change_avaliable ?? info.is_change_available ?? true;
      nextChangeAt = info.next_change_avaliable_at ?? info.next_change_available_at ?? null;
      privacyStats = Number(settings.privacy_stats ?? 0) as PrivacyVal;
      privacyCounts = Number(settings.privacy_counts ?? 0) as PrivacyVal;
      privacySocial = Number(settings.privacy_social ?? 0) as PrivacyVal;
      privacyFriendRequests = Number(settings.privacy_friend_requests ?? 0) as 0 | 1;
      applyBoundFlags(settings as Record<string, unknown>);
      loadState = 'ready';
    } catch {
      loadState = 'error';
    }
  }

  async function saveStatus() {
    if (statusSaving || !window.anixApi?.settings?.setStatus) return;
    statusSaving = true;
    try {
      const next = statusValue.trim();
      await window.anixApi.settings.setStatus(next);
      showToast('Статус обновлён');
      onProfilePatched?.({ status: next });
      goMenu();
    } catch {
      showToast('Ошибка при сохранении', 'err');
    } finally {
      statusSaving = false;
    }
  }

  async function loadLoginHistory() {
    if (!profileId || !window.anixApi?.profile?.getLoginHistory) {
      loginHistory = [];
      loginHistoryState = 'error';
      return;
    }
    loginHistoryState = 'loading';
    try {
      const res = await window.anixApi.profile.getLoginHistory(profileId, 0);
      const rows = Array.isArray(res?.content) ? res.content : [];
      loginHistory = rows.map((row, i) => {
        const r = row as Record<string, unknown>;
        return {
          id: Number(r.id ?? i),
          login: String(r.newLogin ?? r.new_login ?? ''),
          timestamp: Number(r.timestamp ?? 0),
        };
      }).filter((row) => row.login);
      loginHistoryState = 'ready';
    } catch {
      loginHistory = [];
      loginHistoryState = 'error';
    }
  }

  function fmtHistoryTime(ts: number): string {
    if (!ts) return 'при регистрации';
    return formatHistoryViewTime(ts);
  }

  async function shareProfileLink() {
    const link = `https://anixart-app.com/profile/${profileId}`;
    try {
      await navigator.clipboard.writeText(link);
      showToast('Ссылка скопирована');
    } catch {
      showToast('Не удалось скопировать ссылку', 'err');
    }
  }

  function sanitizeLoginInput(raw: string): string {
    return raw.replace(/[^A-Za-z0-9_]/g, '').slice(0, LOGIN_MAX);
  }

  function onLoginInput(e: Event) {
    const el = e.currentTarget as HTMLInputElement;
    const next = sanitizeLoginInput(el.value);
    if (el.value !== next) el.value = next;
    loginValue = next;
  }

  const canSubmitLogin = $derived(
    canChangeLogin
    && !loginSaving
    && loginCheckStatus === 'available'
    && loginValue.trim().length >= LOGIN_MIN
    && loginValue.trim() !== login,
  );

  async function saveNickname() {
    if (loginSaving || !window.anixApi?.settings?.changeLogin) return;
    const val = loginValue.trim();
    if (!canChangeLogin) {
      showToast('Смена никнейма пока недоступна', 'err');
      return;
    }
    if (val.length < LOGIN_MIN) {
      loginCheckStatus = 'short';
      loginCheckMsg = 'Никнейм слишком короткий';
      showToast('Никнейм слишком короткий', 'err');
      return;
    }
    if (!LOGIN_RE.test(val)) {
      loginCheckStatus = 'invalid';
      loginCheckMsg = 'Никнейм содержит недопустимые символы';
      showToast('Никнейм слишком короткий или содержит недопустимые символы', 'err');
      return;
    }
    if (val === login || loginCheckStatus === 'taken') {
      if (loginCheckStatus === 'taken') showToast('Никнейм уже занят', 'err');
      return;
    }
    if (!confirm('Никнейм можно менять раз в 30 дней. Продолжить?')) return;
    loginSaving = true;
    try {
      const res = await window.anixApi.settings.changeLogin(val);
      if (res.code === 0) {
        showToast('Никнейм изменён');
        canChangeLogin = false;
        loginCheckStatus = 'same';
        loginCheckMsg = '';
        onProfilePatched?.({ login: val });
        void loadLoginHistory();
      } else {
        const m: Record<number, string> = {
          2: 'Никнейм слишком короткий или содержит недопустимые символы',
          3: 'Никнейм уже занят',
          4: 'Смена ещё недоступна',
        };
        if (res.code === 3) {
          loginCheckStatus = 'taken';
          loginCheckMsg = 'Никнейм уже занят';
        } else if (res.code === 2) {
          loginCheckStatus = 'invalid';
          loginCheckMsg = 'Никнейм слишком короткий или содержит недопустимые символы';
        }
        showToast(m[res.code ?? -1] ?? 'Ошибка', 'err');
      }
    } catch {
      showToast('Ошибка при сохранении', 'err');
    } finally {
      loginSaving = false;
    }
  }

  function cleanSocialHandle(raw: string, kind: 'vk' | 'tg' | 'inst' | 'tt' | 'discord'): string {
    let v = raw.trim();
    if (!v) return '';
    v = v.replace(/^https?:\/\/(www\.)?/i, '');
    if (kind === 'vk') v = v.replace(/^vk\.com\//i, '');
    if (kind === 'tg') v = v.replace(/^(t\.me\/|telegram\.me\/)/i, '');
    if (kind === 'inst') v = v.replace(/^(instagram\.com\/|instagr\.am\/)/i, '');
    if (kind === 'tt') v = v.replace(/^tiktok\.com\/@?/i, '');
    if (kind === 'discord') {
      v = v.replace(/^(discord\.com\/users\/|discordapp\.com\/users\/)/i, '');
    } else {
      v = v.replace(/^@/, '');
    }
    return v.split(/[/?#]/)[0]?.trim() ?? '';
  }

  async function saveSocial() {
    if (socialSaving || !window.anixApi?.settings?.setSocial) return;
    socialSaving = true;
    try {
      const payload = {
        vk_page: cleanSocialHandle(socialValues.vk_page, 'vk'),
        tg_page: cleanSocialHandle(socialValues.tg_page, 'tg'),
        inst_page: cleanSocialHandle(socialValues.inst_page, 'inst'),
        tt_page: cleanSocialHandle(socialValues.tt_page, 'tt'),
        discord_page: cleanSocialHandle(socialValues.discord_page, 'discord'),
      };
      socialValues = { ...payload };
      const res = await window.anixApi.settings.setSocial(payload);
      if (!res || res.code === 0 || res.code === undefined) {
        showToast('Социальные сети сохранены');
        onProfilePatched?.(payload);
        goMenu();
      } else {
        const m: Record<number, string> = {
          2: 'Некорректный VK',
          3: 'Некорректный Telegram',
          4: 'Некорректный Instagram',
          5: 'Некорректный TikTok',
          6: 'Некорректный Discord',
        };
        showToast(m[res.code] ?? `Ошибка (${res.code})`, 'err');
      }
    } catch (err) {
      showToast(String(err || 'Ошибка при сохранении'), 'err');
    } finally {
      socialSaving = false;
    }
  }

  function privacyValue(kind: PrivacyKind): number {
    if (kind === 'stats') return privacyStats;
    if (kind === 'counts') return privacyCounts;
    if (kind === 'social') return privacySocial;
    return privacyFriendRequests;
  }

  function privacyValueLabel(kind: PrivacyKind): string {
    const v = privacyValue(kind);
    if (kind === 'friends') return PRIVACY_FR_LABELS[v] ?? '—';
    return PRIVACY_LABELS[v] ?? '—';
  }

  function privacyOptions(kind: PrivacyKind): { value: number; label: string }[] {
    if (kind === 'friends') {
      return [0, 1].map((value) => ({ value, label: PRIVACY_FR_LABELS[value] }));
    }
    return [0, 1, 2].map((value) => ({ value, label: PRIVACY_LABELS[value] }));
  }

  function openPrivacyPicker(kind: PrivacyKind, title: string) {
    if (privacySaving) return;
    privacyPicker = { kind, title };
  }

  function closePrivacyPicker() {
    privacyPicker = null;
  }

  async function setPrivacy(kind: PrivacyKind, value: number) {
    const api = window.anixApi?.settings;
    if (!api || privacySaving) return;
    if (privacyValue(kind) === value) {
      closePrivacyPicker();
      return;
    }
    privacySaving = true;
    try {
      if (kind === 'stats') {
        await api.setPrivacyStats(value);
        privacyStats = value as PrivacyVal;
      } else if (kind === 'counts') {
        await api.setPrivacyCounts(value);
        privacyCounts = value as PrivacyVal;
      } else if (kind === 'social') {
        await api.setPrivacySocial(value);
        privacySocial = value as PrivacyVal;
      } else {
        await api.setPrivacyFriendRequests(value);
        privacyFriendRequests = value as 0 | 1;
      }
      showToast('Сохранено');
      closePrivacyPicker();
    } catch {
      showToast('Ошибка', 'err');
    } finally {
      privacySaving = false;
    }
  }

  async function logout() {
    if (logoutBusy) return;
    if (!confirm('Вы уверены, что хотите выйти из своей учетной записи?')) return;
    logoutBusy = true;
    try {
      await window.anixApi?.auth?.logout?.();
      const { syncAuthStatus, notifyAuthChanged } = await import('../stores/auth');
      await syncAuthStatus();
      notifyAuthChanged();
      onBack();
      const { navigate } = await import('../stores/navigation');
      navigate('/');
    } catch {
      showToast('Не удалось выйти', 'err');
      logoutBusy = false;
    }
  }

  function fmtNextChange(ts: number | null): string {
    if (!ts) return '';
    try {
      return new Date(ts).toLocaleString('ru-RU', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  }

  $effect(() => {
    if (screen === 'nickname') void loadLoginHistory();
  });

  $effect(() => {
    if (screen !== 'nickname') return;

    const val = loginValue.trim();
    const currentLogin = login;
    const id = profileId;

    if (!val) {
      loginCheckStatus = 'idle';
      loginCheckMsg = '';
      return;
    }
    if (val === currentLogin) {
      loginCheckStatus = 'same';
      loginCheckMsg = '';
      return;
    }
    if (val.length < LOGIN_MIN) {
      loginCheckStatus = 'short';
      loginCheckMsg = `Минимум ${LOGIN_MIN} символа`;
      return;
    }
    if (!LOGIN_RE.test(val)) {
      loginCheckStatus = 'invalid';
      loginCheckMsg = 'Никнейм содержит недопустимые символы';
      return;
    }

    loginCheckStatus = 'checking';
    loginCheckMsg = 'Проверка…';
    const seq = ++loginCheckSeq;
    const timer = setTimeout(() => {
      void (async () => {
        try {
          const res = await window.anixApi?.search?.profiles?.(val, 0);
          if (seq !== loginCheckSeq) return;
          const rows = Array.isArray(res?.content) ? res.content : [];
          const taken = rows.some((row) => {
            const p = row as { id?: number; login?: string };
            return String(p.login ?? '').toLowerCase() === val.toLowerCase()
              && Number(p.id) !== id;
          });
          loginCheckStatus = taken ? 'taken' : 'available';
          loginCheckMsg = taken ? 'Никнейм уже занят' : 'Никнейм свободен';
        } catch {
          if (seq !== loginCheckSeq) return;
          loginCheckStatus = 'idle';
          loginCheckMsg = '';
        }
      })();
    }, 400);

    return () => {
      clearTimeout(timer);
    };
  });

  onMount(() => {
    void loadSettings();
  });
</script>

<div class="profile-panel__edit-view">
  <header class="profile-panel__friends-head">
    <UiV2BackBar segments={backSegments} onBack={onHeadBack} />
  </header>

  {#if loadState === 'loading'}
    <p class="profile-panel__state">Загрузка…</p>
  {:else if loadState === 'error'}
    <div class="profile-panel__state">
      <p>Не удалось загрузить настройки</p>
      <button type="button" class="profile-panel__retry" onclick={() => void loadSettings()}>Повторить</button>
    </div>
  {:else if screen === 'menu'}
    <div class="profile-panel__edit-menu">
      <button type="button" class="profile-panel__edit-row" onclick={() => void logout()} disabled={logoutBusy}>
        <span class="profile-panel__edit-row-title">Выйти из учетной записи</span>
      </button>

      <div class="profile-panel__edit-divider" aria-hidden="true"></div>

      <h3 class="profile-panel__edit-section">Персонализация</h3>

      <button type="button" class="profile-panel__edit-row" onclick={soon}>
        <span class="profile-panel__edit-row-title">Изменить фото профиля</span>
        <span class="profile-panel__edit-row-sub">Загрузить с устройства</span>
      </button>
      <button type="button" class="profile-panel__edit-row" onclick={soon}>
        <span class="profile-panel__edit-row-title">Изменить обложку</span>
        <span class="profile-panel__edit-row-sub">Загрузить с устройства</span>
      </button>
      <button type="button" class="profile-panel__edit-row" onclick={() => { screen = 'status'; }}>
        <span class="profile-panel__edit-row-title">Изменить статус</span>
        <span class="profile-panel__edit-row-sub">{statusPreview}</span>
      </button>
      <button type="button" class="profile-panel__edit-row" onclick={() => { screen = 'nickname'; }}>
        <span class="profile-panel__edit-row-title">Изменить никнейм</span>
        <span class="profile-panel__edit-row-sub">{loginValue || login}</span>
      </button>
      <button type="button" class="profile-panel__edit-row" onclick={soon}>
        <span class="profile-panel__edit-row-title">Изменить значок</span>
        {#if badgeName || badgeUrl}
          <span class="profile-panel__edit-row-sub profile-panel__edit-row-sub--badge">
            {#if badgeUrl}
              <img class="profile-panel__edit-badge" src={toCdnProxyUrl(badgeUrl)} alt="" />
            {/if}
            {badgeName || 'Значок'}
          </span>
        {/if}
      </button>
      <button type="button" class="profile-panel__edit-row" onclick={soon}>
        <span class="profile-panel__edit-row-title">Изменить витрину</span>
      </button>

      <div class="profile-panel__edit-divider" aria-hidden="true"></div>

      <h3 class="profile-panel__edit-section">Мои социальные сети</h3>
      <button type="button" class="profile-panel__edit-row" onclick={() => { screen = 'social'; }}>
        <span class="profile-panel__edit-row-title">Укажите ссылки на свои страницы в соц. сетях</span>
      </button>

      <div class="profile-panel__edit-divider" aria-hidden="true"></div>

      <button type="button" class="profile-panel__edit-row" onclick={soon}>
        <span class="profile-panel__edit-row-title">Лента</span>
      </button>
      <button type="button" class="profile-panel__edit-row" onclick={soon}>
        <span class="profile-panel__edit-row-title">Скрытые каналы</span>
      </button>

      <div class="profile-panel__edit-divider" aria-hidden="true"></div>

      <h3 class="profile-panel__edit-section">Приватность</h3>
      {#each PRIVACY_ROWS as row (row.kind)}
        <button
          type="button"
          class="profile-panel__edit-row"
          disabled={privacySaving}
          onclick={() => openPrivacyPicker(row.kind, row.title)}
        >
          <span class="profile-panel__edit-row-title">{row.title}</span>
          <span class="profile-panel__edit-row-sub">{privacyValueLabel(row.kind)}</span>
        </button>
      {/each}
      <button type="button" class="profile-panel__edit-row" onclick={soon}>
        <span class="profile-panel__edit-row-title">Блоклист</span>
        <span class="profile-panel__edit-row-sub">Список пользователей, которым запрещен доступ к Вашей странице</span>
      </button>

      <div class="profile-panel__edit-divider" aria-hidden="true"></div>

      <h3 class="profile-panel__edit-section">Безопасность</h3>
      <button type="button" class="profile-panel__edit-row" onclick={soon}>
        <span class="profile-panel__edit-row-title">Здоровье аккаунта</span>
        <span class="profile-panel__edit-row-sub">История нарушений и ограничений</span>
      </button>
      <button type="button" class="profile-panel__edit-row" onclick={soon}>
        <span class="profile-panel__edit-row-title">Изменить Email</span>
        <span class="profile-panel__edit-row-sub">Изменить Email учетной записи</span>
      </button>
      <button type="button" class="profile-panel__edit-row" onclick={soon}>
        <span class="profile-panel__edit-row-title">Изменить пароль</span>
        <span class="profile-panel__edit-row-sub">Изменить пароль учетной записи</span>
      </button>

      <div class="profile-panel__edit-divider" aria-hidden="true"></div>

      <h3 class="profile-panel__edit-section">Привязка к сервисам</h3>
      {#each OAUTH_SERVICES as service (service.id)}
        <button
          type="button"
          class="profile-panel__edit-row profile-panel__edit-row--oauth profile-panel__edit-row--oauth-{service.id}"
          disabled={oauthBusy !== null}
          onclick={() => void toggleOAuthService(service.id)}
        >
          <span class="profile-panel__oauth-icon" aria-hidden="true">
            <OAuthBrandIcon provider={service.id} size={18} />
          </span>
          <span class="profile-panel__oauth-text">
            <span class="profile-panel__edit-row-title">{service.title}</span>
            <span class="profile-panel__edit-row-sub">
              {#if oauthBusy === service.id}
                {isServiceBound(service.id) ? 'Отвязка…' : 'Привязка…'}
              {:else if isServiceBound(service.id)}
                Привязано
              {:else}
                Не привязано
              {/if}
            </span>
          </span>
          <span
            class="profile-panel__oauth-dot"
            class:profile-panel__oauth-dot--on={isServiceBound(service.id) && oauthBusy !== service.id}
            class:profile-panel__oauth-dot--busy={oauthBusy === service.id}
            class:profile-panel__oauth-dot--off={!isServiceBound(service.id) && oauthBusy !== service.id}
            aria-hidden="true"
          ></span>
        </button>
      {/each}

      <div class="profile-panel__edit-divider" aria-hidden="true"></div>

      <h3 class="profile-panel__edit-section">Аккаунт</h3>
      <button type="button" class="profile-panel__edit-row" onclick={soon}>
        <span class="profile-panel__edit-row-title">Удаление аккаунта</span>
        <span class="profile-panel__edit-row-sub">Запросить удаление аккаунта или отменить ранее созданный запрос</span>
      </button>
    </div>
  {:else if screen === 'status'}
    <div class="profile-panel__edit-form">
      <UiV2OutlinedField
        label="Статус"
        bind:value={statusValue}
        multiline
        rows={4}
        maxlength={150}
      />
      <button
        type="button"
        class="profile-panel__edit-save"
        disabled={statusSaving}
        onclick={() => void saveStatus()}
      >
        {statusSaving ? 'Сохранение…' : 'Сохранить'}
      </button>
    </div>
  {:else if screen === 'nickname'}
    <div class="profile-panel__edit-form">
      <UiV2OutlinedField
        label="Новый никнейм"
        bind:value={loginValue}
        maxlength={LOGIN_MAX}
        autocomplete="username"
        spellcheck={false}
        disabled={!canChangeLogin || loginSaving}
        error={loginCheckStatus === 'short' || loginCheckStatus === 'invalid' || loginCheckStatus === 'taken'}
        hint={loginCheckMsg
          || (!canChangeLogin && nextChangeAt
            ? `Следующая смена: ${fmtNextChange(nextChangeAt)}`
            : `Никнейм можно менять раз в 30 дней · от ${LOGIN_MIN} до ${LOGIN_MAX} символов`)}
        hintTone={loginCheckStatus === 'short' || loginCheckStatus === 'invalid' || loginCheckStatus === 'taken'
          ? 'error'
          : loginCheckStatus === 'available'
            ? 'ok'
            : 'default'}
        oninput={onLoginInput}
      />
      <div class="profile-panel__edit-actions">
        <button
          type="button"
          class="profile-panel__edit-action"
          disabled={!canSubmitLogin}
          onclick={() => void saveNickname()}
        >
          <span class="profile-panel__edit-action-icon" aria-hidden="true">{@html iconPencil(16)}</span>
          {loginSaving ? 'Сохранение…' : 'Изменить'}
        </button>
        <button
          type="button"
          class="profile-panel__edit-action"
          onclick={() => void shareProfileLink()}
        >
          <span class="profile-panel__edit-action-icon" aria-hidden="true">{@html iconShare(16)}</span>
          Поделиться
        </button>
      </div>
      <section class="profile-panel__login-history" aria-labelledby="login-history-title">
        <h3 id="login-history-title" class="profile-panel__login-history-title">История изменений</h3>
        {#if loginHistoryState === 'loading'}
          <p class="profile-panel__edit-hint">Загрузка…</p>
        {:else if loginHistoryState === 'error'}
          <p class="profile-panel__edit-hint">Не удалось загрузить историю</p>
        {:else if loginHistory.length === 0}
          <p class="profile-panel__edit-hint">История изменений отсутствует</p>
        {:else}
          <ul class="profile-panel__login-history-list">
            {#each loginHistory as item (item.id)}
              <li class="profile-panel__login-history-item">
                <span class="profile-panel__login-history-name">{item.login}</span>
                <span class="profile-panel__login-history-date">{fmtHistoryTime(item.timestamp)}</span>
              </li>
            {/each}
          </ul>
        {/if}
      </section>
    </div>
  {:else if screen === 'social'}
    <div class="profile-panel__edit-form">
      <label class="profile-panel__edit-field">
        <span class="profile-panel__edit-field-label">ВКонтакте</span>
        <input class="profile-panel__edit-input" bind:value={socialValues.vk_page} placeholder="ВКонтакте" />
      </label>
      <label class="profile-panel__edit-field">
        <span class="profile-panel__edit-field-label">Telegram</span>
        <input class="profile-panel__edit-input" bind:value={socialValues.tg_page} placeholder="Telegram" />
      </label>
      <label class="profile-panel__edit-field">
        <span class="profile-panel__edit-field-label">Instagram</span>
        <input class="profile-panel__edit-input" bind:value={socialValues.inst_page} placeholder="Instagram" />
      </label>
      <label class="profile-panel__edit-field">
        <span class="profile-panel__edit-field-label">TikTok</span>
        <input class="profile-panel__edit-input" bind:value={socialValues.tt_page} placeholder="TikTok" />
      </label>
      <label class="profile-panel__edit-field">
        <span class="profile-panel__edit-field-label">Discord</span>
        <input class="profile-panel__edit-input" bind:value={socialValues.discord_page} placeholder="Discord" />
      </label>
      <button
        type="button"
        class="profile-panel__edit-save"
        disabled={socialSaving}
        onclick={() => void saveSocial()}
      >
        {socialSaving ? 'Сохранение…' : 'Сохранить'}
      </button>
    </div>
  {/if}

  {#if privacyPicker}
    {@const picker = privacyPicker}
    <UiV2ChoiceSheet
      title={picker.title}
      options={privacyOptions(picker.kind)}
      value={privacyValue(picker.kind)}
      disabled={privacySaving}
      onClose={closePrivacyPicker}
      onSelect={(v) => void setPrivacy(picker.kind, Number(v))}
    />
  {/if}
</div>
