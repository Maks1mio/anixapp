<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { openFeedArticle, openFeedChannel } from '../stores/feed-focus';
  import { handleUserProfileClick } from '../stores/user-profile';
  import { fetchAllNotifications, markNotificationsRead } from '../stores/notifications';
  import {
    iconPlay,
    iconBookmark,
    iconDownload,
    iconCheck,
    iconUser,
    iconClipboardList,
    iconMessageCircle,
    iconX,
    iconSettings,
    iconChevronLeft,
    iconChevronRight,
    iconList,
    iconListChecks,
    iconLayoutGrid,
  } from './icons';
  import type { AppUpdateProgress } from '../types/electron';
  import Page from './Page.svelte';
  import UiV2RoundButton from './uikit-v2/UiV2RoundButton.svelte';
  import UiV2Tabs, { type UiV2TabItem } from './uikit-v2/UiV2Tabs.svelte';
  import UiV2Toggle from './uikit-v2/UiV2Toggle.svelte';
  import NotificationCheckboxDialog from './NotificationCheckboxDialog.svelte';
  import ReleaseEpisodeNotifyModal from './ReleaseEpisodeNotifyModal.svelte';
  import {
    parseNotification,
    notificationFilterId,
    type NotificationFilterId,
    type ParsedNotification,
  } from '../utils/notification-format';
  import {
    NOTIFICATION_LIST_STATUSES,
    episodeScopeMode,
    parseNotificationPrefs,
    parseReleasePrefPage,
    parseReleaseTypeIds,
    parseVoiceoverCatalog,
    statusLabels,
    typeLabels,
    type NotificationPrefsState,
    type ReleasePrefItem,
    type VoiceoverTypeOption,
  } from '../utils/notification-preferences';
  import { toPosterDisplayUrl } from '../utils/posterUrl';

  interface Props {
    onClose: () => void;
  }

  const { onClose }: Props = $props();

  type LoadState = 'loading' | 'no-api' | 'empty' | 'error' | 'loaded';
  type PanelView = 'list' | 'settings' | 'releasePrefs';

  type BoolPrefKey =
    | 'is_episode_notifications_enabled'
    | 'is_first_episode_notification_enabled'
    | 'is_related_release_notifications_enabled'
    | 'is_article_notifications_enabled'
    | 'is_comment_notifications_enabled'
    | 'is_my_collection_comment_notifications_enabled'
    | 'is_my_article_comment_notifications_enabled'
    | 'is_report_process_notifications_enabled';

  const BOOL_PREF_EDITS: Record<BoolPrefKey, string> = {
    is_episode_notifications_enabled: 'episode',
    is_first_episode_notification_enabled: 'episode/first',
    is_related_release_notifications_enabled: 'related/release',
    is_article_notifications_enabled: 'article',
    is_comment_notifications_enabled: 'comment',
    is_my_collection_comment_notifications_enabled: 'my/collection/comment',
    is_my_article_comment_notifications_enabled: 'my/article/comment',
    is_report_process_notifications_enabled: 'report/process',
  };

  const emptyPrefs = (): NotificationPrefsState => ({
    is_episode_notifications_enabled: false,
    is_first_episode_notification_enabled: false,
    is_related_release_notifications_enabled: false,
    is_report_process_notifications_enabled: false,
    is_comment_notifications_enabled: false,
    is_my_collection_comment_notifications_enabled: false,
    is_article_notifications_enabled: false,
    is_my_article_comment_notifications_enabled: false,
    is_release_type_notifications_enabled: false,
    statusIds: [],
    typeIds: [],
  });

  const FILTERS: { id: NotificationFilterId; label: string }[] = [
    { id: 'all', label: 'Все' },
    { id: 'episode', label: 'Серии' },
    { id: 'article', label: 'Записи' },
    { id: 'friend', label: 'Друзья' },
    { id: 'comment', label: 'Комменты' },
    { id: 'release', label: 'Релизы' },
  ];

  let loadState = $state<LoadState>('loading');
  let errorMsg = $state('');
  let notifications = $state<unknown[]>([]);
  let updateCard = $state<AppUpdateProgress | null>(null);
  let revealedSpoilers = $state<Record<string, boolean>>({});
  let filter = $state<NotificationFilterId>('all');
  let panelView = $state<PanelView>('list');
  let prefBusy = $state(false);
  let prefs = $state<NotificationPrefsState>(emptyPrefs());
  let prefsError = $state('');
  let markBusy = $state(false);
  let voiceoverCatalog = $state<VoiceoverTypeOption[]>([]);
  let listsDialogOpen = $state(false);
  let typesScopeOpen = $state(false);
  let typesDialogOpen = $state(false);
  /** Seeds for checkbox pickers — empty when choosing «selected» so nothing is pre-checked. */
  let listsPickerIds = $state<number[]>([]);
  let typesPickerIds = $state<number[]>([]);
  let releasePrefItems = $state<ReleasePrefItem[]>([]);
  let releasePrefPage = $state(0);
  let releasePrefLast = $state(false);
  let releasePrefLoading = $state(false);
  let releaseNotifyOpen = $state(false);
  let releaseNotifyId = $state(0);
  let releaseNotifySelected = $state<number[]>([]);
  let releaseNotifyCatalog = $state<VoiceoverTypeOption[]>([]);

  const scopeMode = $derived(episodeScopeMode(prefs));
  const typeSummary = $derived(typeLabels(prefs.typeIds, voiceoverCatalog));
  const statusSummary = $derived(statusLabels(prefs.statusIds));
  const typesAllSelected = $derived(
    voiceoverCatalog.length > 0 && prefs.typeIds.length >= voiceoverCatalog.length,
  );
  const typesScopeMode = $derived.by((): 'all' | 'selected' => {
    if (typesAllSelected || prefs.typeIds.length === 0) return 'all';
    return 'selected';
  });

  const filterCounts = $derived.by(() => {
    const counts: Record<NotificationFilterId, number> = {
      all: notifications.length,
      episode: 0,
      article: 0,
      release: 0,
      friend: 0,
      comment: 0,
    };
    for (const raw of notifications) {
      const id = notificationFilterId(raw);
      if (id !== 'other') counts[id] += 1;
    }
    return counts;
  });

  const filteredNotifications = $derived.by(() => {
    if (filter === 'all') return notifications;
    return notifications.filter((raw) => notificationFilterId(raw) === filter);
  });

  const filterTabs = $derived.by((): UiV2TabItem[] =>
    FILTERS.map((f) => ({
      id: f.id,
      label: f.label,
      badge: filterCounts[f.id],
    })),
  );

  const hasUnread = $derived(
    notifications.some((raw) => !!(raw as { is_new?: boolean })?.is_new),
  );

  async function handleMarkRead() {
    if (markBusy || !hasUnread) return;
    markBusy = true;
    try {
      await markNotificationsRead();
      notifications = notifications.map((raw) => {
        if (raw && typeof raw === 'object') return { ...(raw as object), is_new: false };
        return raw;
      });
    } finally {
      markBusy = false;
    }
  }

  function itemKey(raw: unknown, index: number): string {
    const rec = raw as { id?: number | string; type?: string; timestamp?: number };
    if (rec?.id != null) return String(rec.id);
    return `${rec?.type ?? 'n'}-${rec?.timestamp ?? index}`;
  }

  function markerHtml(kind: ParsedNotification['markerKind']): string {
    switch (kind) {
      case 'episode':
        return `<span class="notifications-modal__marker notifications-modal__marker--episode">${iconPlay(14)}</span>`;
      case 'article':
        return `<span class="notifications-modal__marker notifications-modal__marker--article">${iconClipboardList(13)}</span>`;
      case 'related':
        return `<span class="notifications-modal__marker notifications-modal__marker--related">${iconBookmark(14)}</span>`;
      case 'friend':
        return `<span class="notifications-modal__marker notifications-modal__marker--friend">${iconUser(13, true)}</span>`;
      case 'friend-accept':
        return `<span class="notifications-modal__marker notifications-modal__marker--friend-accept">${iconCheck(13)}</span>`;
      case 'comment':
        return `<span class="notifications-modal__marker notifications-modal__marker--comment">${iconMessageCircle(13)}</span>`;
      default:
        return '';
    }
  }

  function handleItemClick(n: ParsedNotification, event: MouseEvent) {
    if (n.articleId) {
      close();
      openFeedArticle(n.articleId);
      return;
    }
    if (n.releaseId) {
      close();
      navigate(`/release/${n.releaseId}`);
      return;
    }
    if (n.channelId) {
      close();
      openFeedChannel(n.channelId);
      return;
    }
    if (n.profileId) {
      handleUserProfileClick(n.profileId, event);
    }
  }

  function toggleSpoiler(key: string, event: MouseEvent) {
    event.stopPropagation();
    event.preventDefault();
    revealedSpoilers = { ...revealedSpoilers, [key]: !revealedSpoilers[key] };
  }

  function onUpdateProgress(e: Event) {
    const data = (e as CustomEvent<AppUpdateProgress>).detail;
    if (data) updateCard = data;
  }

  function handleInstallUpdate() {
    window.electron?.installUpdate?.();
  }

  function close() {
    onClose();
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      if (releaseNotifyOpen) {
        releaseNotifyOpen = false;
        return;
      }
      if (typesScopeOpen) {
        typesScopeOpen = false;
        return;
      }
      if (listsDialogOpen) {
        listsDialogOpen = false;
        return;
      }
      if (typesDialogOpen) {
        typesDialogOpen = false;
        return;
      }
      if (panelView === 'releasePrefs') {
        panelView = 'settings';
        return;
      }
      if (panelView === 'settings') {
        panelView = 'list';
        return;
      }
      close();
    }
  }

  function handleOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('notifications-modal-overlay')) close();
  }

  async function loadPrefs() {
    prefsError = '';
    try {
      const [data, typesRaw] = await Promise.all([
        window.anixApi?.notification?.preference?.my?.(),
        window.anixApi?.type?.all?.(),
      ]);
      prefs = parseNotificationPrefs(data);
      voiceoverCatalog = parseVoiceoverCatalog(typesRaw);
    } catch (err) {
      prefsError = String(err);
    }
  }

  async function openSettings() {
    panelView = 'settings';
    await loadPrefs();
  }

  async function toggleBoolPref(key: BoolPrefKey) {
    if (prefBusy) return;
    const edit = BOOL_PREF_EDITS[key];
    prefBusy = true;
    const prev = prefs[key];
    prefs = { ...prefs, [key]: !prev };
    try {
      await window.anixApi?.notification?.preference?.edit?.(edit);
      if (key === 'is_episode_notifications_enabled' && !prev) {
        // Android: when enabling with empty statuses, select all lists + all types
        if (prefs.statusIds.length === 0) {
          const allStatuses = NOTIFICATION_LIST_STATUSES.map((s) => s.id);
          await window.anixApi?.notification?.preference?.editStatus?.(allStatuses);
        }
        if (prefs.typeIds.length === 0 && voiceoverCatalog.length > 0) {
          await window.anixApi?.notification?.preference?.editType?.(
            voiceoverCatalog.map((t) => t.id),
          );
        }
      }
      await loadPrefs();
    } catch (err) {
      prefs = { ...prefs, [key]: prev };
      prefsError = String(err);
    } finally {
      prefBusy = false;
    }
  }

  async function selectAllListsMode() {
    if (prefBusy) return;
    prefBusy = true;
    try {
      const allStatuses = NOTIFICATION_LIST_STATUSES.map((s) => s.id);
      if (prefs.is_release_type_notifications_enabled) {
        await window.anixApi?.notification?.preference?.edit?.('selected/releases');
      }
      await window.anixApi?.notification?.preference?.editStatus?.(allStatuses);
      await loadPrefs();
    } catch (err) {
      prefsError = String(err);
    } finally {
      prefBusy = false;
    }
  }

  async function selectSelectedListsMode() {
    // Fresh pick: nothing pre-checked (Android «выберите списки» after choosing selected).
    listsPickerIds = [];
    listsDialogOpen = true;
  }

  function openTypesScope() {
    typesScopeOpen = true;
  }

  async function chooseAllVoiceovers() {
    if (prefBusy || voiceoverCatalog.length === 0) return;
    typesScopeOpen = false;
    prefBusy = true;
    try {
      await window.anixApi?.notification?.preference?.editType?.(
        voiceoverCatalog.map((t) => t.id),
      );
      await loadPrefs();
    } catch (err) {
      prefsError = String(err);
    } finally {
      prefBusy = false;
    }
  }

  function chooseSelectedVoiceovers() {
    typesScopeOpen = false;
    // Start unchecked so user picks explicitly.
    typesPickerIds = [];
    typesDialogOpen = true;
  }

  async function selectSelectedReleasesMode() {
    if (prefBusy) return;
    if (prefs.is_release_type_notifications_enabled) {
      panelView = 'releasePrefs';
      await loadReleasePrefs(true);
      return;
    }
    prefBusy = true;
    try {
      await window.anixApi?.notification?.preference?.edit?.('selected/releases');
      await loadPrefs();
    } catch (err) {
      prefsError = String(err);
    } finally {
      prefBusy = false;
    }
  }

  async function confirmLists(ids: number[]) {
    listsDialogOpen = false;
    if (prefBusy) return;
    prefBusy = true;
    try {
      if (prefs.is_release_type_notifications_enabled) {
        await window.anixApi?.notification?.preference?.edit?.('selected/releases');
      }
      await window.anixApi?.notification?.preference?.editStatus?.(ids);
      await loadPrefs();
    } catch (err) {
      prefsError = String(err);
    } finally {
      prefBusy = false;
    }
  }

  async function confirmTypes(ids: number[]) {
    typesDialogOpen = false;
    if (prefBusy) return;
    prefBusy = true;
    try {
      await window.anixApi?.notification?.preference?.editType?.(ids);
      await loadPrefs();
    } catch (err) {
      prefsError = String(err);
    } finally {
      prefBusy = false;
    }
  }

  async function loadReleasePrefs(reset: boolean) {
    if (releasePrefLoading) return;
    releasePrefLoading = true;
    try {
      const page = reset ? 0 : releasePrefPage;
      const raw = await window.anixApi?.notification?.preference?.releases?.(page);
      const parsed = parseReleasePrefPage(raw);
      releasePrefItems = reset ? parsed.items : [...releasePrefItems, ...parsed.items];
      releasePrefPage = page + 1;
      releasePrefLast = parsed.lastPage || parsed.items.length === 0;
    } catch (err) {
      prefsError = String(err);
    } finally {
      releasePrefLoading = false;
    }
  }

  async function openReleaseNotify(item: ReleasePrefItem) {
    releaseNotifyId = item.id;
    releaseNotifySelected = [];
    releaseNotifyCatalog = voiceoverCatalog;
    releaseNotifyOpen = true;
    try {
      const raw = await window.anixApi?.notification?.preference?.releaseTypes?.(item.id);
      releaseNotifySelected = parseReleaseTypeIds(raw);
      // Prefer names from response when present
      const data = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
      const list = data.profile_release_type_notification_preferences;
      if (Array.isArray(list) && list.length) {
        const fromResp: VoiceoverTypeOption[] = [];
        for (const entry of list) {
          if (!entry || typeof entry !== 'object') continue;
          const type = (entry as { type?: { id?: number; name?: string } }).type;
          if (type?.id != null) {
            fromResp.push({ id: Number(type.id), name: type.name || `Озвучка ${type.id}` });
          }
        }
        if (fromResp.length) {
          const map = new Map(voiceoverCatalog.map((t) => [t.id, t]));
          for (const t of fromResp) map.set(t.id, t);
          releaseNotifyCatalog = Array.from(map.values());
        }
      }
    } catch (err) {
      prefsError = String(err);
    }
  }

  async function saveReleaseNotify(typeIds: number[]) {
    if (prefBusy || !releaseNotifyId) return;
    prefBusy = true;
    try {
      await window.anixApi?.notification?.preference?.editReleaseTypes?.(releaseNotifyId, typeIds);
      releaseNotifySelected = typeIds;
      releasePrefItems = releasePrefItems.map((item) =>
        item.id === releaseNotifyId ? { ...item, preferenceCount: typeIds.length } : item,
      );
      if (typeIds.length === 0) {
        releaseNotifyOpen = false;
      }
    } catch (err) {
      prefsError = String(err);
    } finally {
      prefBusy = false;
    }
  }

  function releasePrefMeta(item: ReleasePrefItem): string {
    const parts: string[] = [];
    if (item.episodesReleased != null && item.episodesTotal != null) {
      parts.push(`${item.episodesReleased} из ${item.episodesTotal} эп`);
    } else if (item.episodesReleased != null) {
      parts.push(`${item.episodesReleased} эп`);
    }
    if (item.grade != null && item.grade > 0) {
      parts.push(`${item.grade.toFixed(1)} ★`);
    }
    return parts.join('  •  ');
  }

  function releasePrefVoiceLabel(item: ReleasePrefItem): string {
    if (item.preferenceCount <= 0) return 'Уведомления выключены';
    if (voiceoverCatalog.length > 0 && item.preferenceCount >= voiceoverCatalog.length) {
      return 'Выбраны все озвучки';
    }
    return `Выбрано озвучек: ${item.preferenceCount}`;
  }

  onMount(() => {
    document.addEventListener('keydown', handleKeydown);
    window.addEventListener('app-update-progress', onUpdateProgress);

    if (!window.anixApi) {
      loadState = 'no-api';
      return;
    }

    void (async () => {
      try {
        const content = await fetchAllNotifications();

        if (content.length === 0) {
          loadState = 'empty';
          return;
        }

        const byId = new Map<number | string, unknown>();
        for (const item of content) {
          const rec = item as { id?: number | string; type?: string; timestamp?: number };
          const key = rec?.id ?? `${rec?.type}-${rec?.timestamp}-${Math.random()}`;
          if (!byId.has(key)) byId.set(key, item);
        }
        const unique = Array.from(byId.values());
        unique.sort((a, b) => {
          const ta = typeof (a as { timestamp?: number }).timestamp === 'number'
            ? (a as { timestamp: number }).timestamp
            : 0;
          const tb = typeof (b as { timestamp?: number }).timestamp === 'number'
            ? (b as { timestamp: number }).timestamp
            : 0;
          return tb - ta;
        });
        notifications = unique;
        loadState = 'loaded';
      } catch (err: unknown) {
        errorMsg = String(err);
        loadState = 'error';
      }
    })();
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
    window.removeEventListener('app-update-progress', onUpdateProgress);
  });
</script>

<!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
<div
  class="notifications-modal-overlay notifications-modal-overlay--open"
  role="dialog"
  aria-label="Уведомления"
  tabindex="-1"
  onclick={handleOverlayClick}
>
  <div class="notifications-modal-panel uikit-v2">
    <header class="notifications-modal__header">
      {#if panelView === 'settings'}
        <UiV2RoundButton label="Назад к списку" size="sm" onclick={() => { panelView = 'list'; }}>
          {@html iconChevronLeft(16)}
        </UiV2RoundButton>
        <h2 class="notifications-modal__heading">Настройки уведомлений</h2>
        <UiV2RoundButton label="Закрыть" size="sm" onclick={close}>
          {@html iconX(16)}
        </UiV2RoundButton>
      {:else if panelView === 'releasePrefs'}
        <UiV2RoundButton label="Назад к настройкам" size="sm" onclick={() => { panelView = 'settings'; }}>
          {@html iconChevronLeft(16)}
        </UiV2RoundButton>
        <h2 class="notifications-modal__heading">Уведомления по релизам</h2>
        <UiV2RoundButton label="Закрыть" size="sm" onclick={close}>
          {@html iconX(16)}
        </UiV2RoundButton>
      {:else}
        <h2 class="notifications-modal__heading">Уведомления</h2>
        <div class="notifications-modal__header-actions">
          <UiV2RoundButton
            label="Пометить как прочитанное"
            size="sm"
            disabled={markBusy || !hasUnread}
            onclick={() => { void handleMarkRead(); }}
          >
            {@html iconListChecks(16)}
          </UiV2RoundButton>
          <UiV2RoundButton label="Настройки уведомлений" size="sm" onclick={() => { void openSettings(); }}>
            {@html iconSettings(16)}
          </UiV2RoundButton>
          <UiV2RoundButton label="Закрыть" size="sm" onclick={close}>
            {@html iconX(16)}
          </UiV2RoundButton>
        </div>
      {/if}
    </header>

    <Page noPadding={true} extraClass="notifications-modal__page">
      <div class="notifications-modal__body">
        {#if panelView === 'settings'}
          <div class="notifications-modal__settings">
            {#if prefsError}
              <p class="notifications-modal__state notifications-modal__state--error">{prefsError}</p>
            {/if}

            <section class="notifications-modal__pref-section">
              <h3 class="notifications-modal__pref-section-title">Уведомления о сериях</h3>
              <div class="notifications-modal__pref-row">
                <div class="notifications-modal__pref-text">
                  <span class="notifications-modal__pref-label">Получать уведомления</span>
                  <span class="notifications-modal__pref-hint">О выходе новых серий</span>
                </div>
                <UiV2Toggle
                  label="Получать уведомления о сериях"
                  checked={prefs.is_episode_notifications_enabled}
                  disabled={prefBusy}
                  onChange={() => { void toggleBoolPref('is_episode_notifications_enabled'); }}
                />
              </div>

              {#if prefs.is_episode_notifications_enabled}
                <div class="notifications-modal__scope-cards" role="radiogroup" aria-label="Источник уведомлений о сериях">
                  <button
                    type="button"
                    class="notifications-modal__scope-card"
                    class:notifications-modal__scope-card--on={scopeMode === 'allLists'}
                    role="radio"
                    aria-checked={scopeMode === 'allLists'}
                    disabled={prefBusy}
                    onclick={() => { void selectAllListsMode(); }}
                  >
                    <span class="notifications-modal__scope-icon">{@html iconList(28)}</span>
                    <span class="notifications-modal__scope-label">Из всех моих списков</span>
                  </button>
                  <button
                    type="button"
                    class="notifications-modal__scope-card"
                    class:notifications-modal__scope-card--on={scopeMode === 'selectedLists'}
                    role="radio"
                    aria-checked={scopeMode === 'selectedLists'}
                    disabled={prefBusy}
                    onclick={() => { void selectSelectedListsMode(); }}
                  >
                    <span class="notifications-modal__scope-icon">{@html iconList(28)}</span>
                    <span class="notifications-modal__scope-label">Из выбранных списков</span>
                  </button>
                  <button
                    type="button"
                    class="notifications-modal__scope-card"
                    class:notifications-modal__scope-card--on={scopeMode === 'selectedReleases'}
                    role="radio"
                    aria-checked={scopeMode === 'selectedReleases'}
                    disabled={prefBusy}
                    onclick={() => { void selectSelectedReleasesMode(); }}
                  >
                    <span class="notifications-modal__scope-icon">{@html iconLayoutGrid(28)}</span>
                    <span class="notifications-modal__scope-label">По выбранным релизам</span>
                  </button>
                </div>

                {#if scopeMode === 'selectedReleases'}
                  <button
                    type="button"
                    class="notifications-modal__pref-link"
                    disabled={prefBusy}
                    onclick={() => {
                      panelView = 'releasePrefs';
                      void loadReleasePrefs(true);
                    }}
                  >
                    Настроить уведомления по отдельным релизам
                    <span aria-hidden="true">{@html iconChevronRight(16)}</span>
                  </button>
                {:else}
                  {#if scopeMode === 'selectedLists'}
                      <button
                      type="button"
                      class="notifications-modal__pref-row notifications-modal__pref-row--click"
                      disabled={prefBusy}
                      onclick={() => {
                        listsPickerIds = [];
                        listsDialogOpen = true;
                      }}
                    >
                      <div class="notifications-modal__pref-text">
                        <span class="notifications-modal__pref-label">Уведомления из списков</span>
                        <span class="notifications-modal__pref-hint">{statusSummary}</span>
                      </div>
                      <span class="notifications-modal__pref-chevron">{@html iconChevronRight(16)}</span>
                    </button>
                  {/if}
                  <button
                    type="button"
                    class="notifications-modal__pref-row notifications-modal__pref-row--click"
                    disabled={prefBusy}
                    onclick={openTypesScope}
                  >
                    <div class="notifications-modal__pref-text">
                      <span class="notifications-modal__pref-label">Уведомления от озвучек</span>
                      <span class="notifications-modal__pref-hint">{typeSummary}</span>
                    </div>
                    <span class="notifications-modal__pref-chevron">{@html iconChevronRight(16)}</span>
                  </button>
                  <div class="notifications-modal__pref-row">
                    <div class="notifications-modal__pref-text">
                      <span class="notifications-modal__pref-label">Первая серия</span>
                      <span class="notifications-modal__pref-hint">Отдельно о старте тайтла</span>
                    </div>
                    <UiV2Toggle
                      label="Первая серия"
                      checked={prefs.is_first_episode_notification_enabled}
                      disabled={prefBusy}
                      onChange={() => { void toggleBoolPref('is_first_episode_notification_enabled'); }}
                    />
                  </div>
                {/if}
              {/if}
            </section>

            <section class="notifications-modal__pref-section">
              <h3 class="notifications-modal__pref-section-title">Уведомления о новых релизах</h3>
              <div class="notifications-modal__pref-row">
                <div class="notifications-modal__pref-text">
                  <span class="notifications-modal__pref-label">Получать уведомления</span>
                  <span class="notifications-modal__pref-hint">Если в приложении был добавлен связанный релиз, который находится у вас в закладках</span>
                </div>
                <UiV2Toggle
                  label="Связанные релизы"
                  checked={prefs.is_related_release_notifications_enabled}
                  disabled={prefBusy}
                  onChange={() => { void toggleBoolPref('is_related_release_notifications_enabled'); }}
                />
              </div>
            </section>

            <section class="notifications-modal__pref-section">
              <h3 class="notifications-modal__pref-section-title">Уведомления о новых записях</h3>
              <div class="notifications-modal__pref-row">
                <div class="notifications-modal__pref-text">
                  <span class="notifications-modal__pref-label">Получать уведомления</span>
                  <span class="notifications-modal__pref-hint">Если в блоге или канале, на который Вы подписаны, опубликовали новую запись</span>
                </div>
                <UiV2Toggle
                  label="Записи каналов"
                  checked={prefs.is_article_notifications_enabled}
                  disabled={prefBusy}
                  onChange={() => { void toggleBoolPref('is_article_notifications_enabled'); }}
                />
              </div>
            </section>

            <section class="notifications-modal__pref-section">
              <h3 class="notifications-modal__pref-section-title">Уведомления о комментариях</h3>
              <div class="notifications-modal__pref-row">
                <div class="notifications-modal__pref-text">
                  <span class="notifications-modal__pref-label">Уведомления об ответах</span>
                  <span class="notifications-modal__pref-hint">Если кто-то отвечает на Ваши комментарии</span>
                </div>
                <UiV2Toggle
                  label="Ответы на комментарии"
                  checked={prefs.is_comment_notifications_enabled}
                  disabled={prefBusy}
                  onChange={() => { void toggleBoolPref('is_comment_notifications_enabled'); }}
                />
              </div>
              <div class="notifications-modal__pref-row">
                <div class="notifications-modal__pref-text">
                  <span class="notifications-modal__pref-label">Уведомления о комментариях своих коллекций</span>
                  <span class="notifications-modal__pref-hint">Если кто-то комментирует Ваши коллекции</span>
                </div>
                <UiV2Toggle
                  label="Комментарии коллекций"
                  checked={prefs.is_my_collection_comment_notifications_enabled}
                  disabled={prefBusy}
                  onChange={() => { void toggleBoolPref('is_my_collection_comment_notifications_enabled'); }}
                />
              </div>
              <div class="notifications-modal__pref-row">
                <div class="notifications-modal__pref-text">
                  <span class="notifications-modal__pref-label">Уведомления о комментариях своих записей в блоге</span>
                  <span class="notifications-modal__pref-hint">Если кто-то комментирует записи в Вашем блоге</span>
                </div>
                <UiV2Toggle
                  label="Комментарии записей"
                  checked={prefs.is_my_article_comment_notifications_enabled}
                  disabled={prefBusy}
                  onChange={() => { void toggleBoolPref('is_my_article_comment_notifications_enabled'); }}
                />
              </div>
            </section>

            <section class="notifications-modal__pref-section">
              <h3 class="notifications-modal__pref-section-title">Уведомления о жалобах</h3>
              <div class="notifications-modal__pref-row">
                <div class="notifications-modal__pref-text">
                  <span class="notifications-modal__pref-label">Получать Push-уведомления</span>
                  <span class="notifications-modal__pref-hint">Если отправленная вами жалоба была обработана модератором</span>
                </div>
                <UiV2Toggle
                  label="Жалобы"
                  checked={prefs.is_report_process_notifications_enabled}
                  disabled={prefBusy}
                  onChange={() => { void toggleBoolPref('is_report_process_notifications_enabled'); }}
                />
              </div>
            </section>
          </div>
        {:else if panelView === 'releasePrefs'}
          <div class="notifications-modal__release-prefs">
            {#if prefsError}
              <p class="notifications-modal__state notifications-modal__state--error">{prefsError}</p>
            {/if}
            {#if releasePrefLoading && releasePrefItems.length === 0}
              <div class="notifications-modal__state">Загрузка…</div>
            {:else if releasePrefItems.length === 0}
              <div class="notifications-modal__state notifications-modal__state--empty">
                <p class="notifications-modal__state-title">Ой, а тут ничего нет!</p>
                <p class="notifications-modal__state-desc">Настроить уведомления можно на странице конкретного релиза</p>
              </div>
            {:else}
              <div class="notifications-modal__release-list">
                {#each releasePrefItems as item (item.id)}
                  <div class="notifications-modal__release-item">
                    <div
                      class="notifications-modal__release-poster"
                      style={item.image ? `background-image:url('${toPosterDisplayUrl(item.image, 'cardVertical')}')` : ''}
                    ></div>
                    <div class="notifications-modal__release-body">
                      <div class="notifications-modal__release-title">{item.title}</div>
                      {#if releasePrefMeta(item)}
                        <div class="notifications-modal__release-meta">{releasePrefMeta(item)}</div>
                      {/if}
                      <div class="notifications-modal__release-voice">{releasePrefVoiceLabel(item)}</div>
                      <button
                        type="button"
                        class="notifications-modal__release-btn"
                        disabled={prefBusy}
                        onclick={() => { void openReleaseNotify(item); }}
                      >
                        Выбрать озвучки
                      </button>
                    </div>
                  </div>
                {/each}
              </div>
              {#if !releasePrefLast}
                <button
                  type="button"
                  class="notifications-modal__pref-link"
                  disabled={releasePrefLoading}
                  onclick={() => { void loadReleasePrefs(false); }}
                >
                  {releasePrefLoading ? 'Загрузка…' : 'Показать ещё'}
                </button>
              {/if}
            {/if}
          </div>
        {:else}
          {#if updateCard}
            {#if updateCard.state === 'downloading'}
              {@const percent = updateCard.total > 0
                ? Math.round((updateCard.received / updateCard.total) * 100)
                : (updateCard.percent || 0)}
              <div class="notifications-modal__item notifications-modal__item--app-update" role="status">
                <div class="notifications-modal__avatar-wrap">
                  <div class="notifications-modal__thumb notifications-modal__thumb--placeholder">
                    {@html iconDownload(22)}
                  </div>
                  <span class="notifications-modal__marker notifications-modal__marker--update">{@html iconDownload(12)}</span>
                </div>
                <div class="notifications-modal__main">
                  <div class="notifications-modal__content">
                    <div class="notifications-modal__text">Скачивание обновления AnixApp</div>
                    <div class="notifications-modal__time">Пожалуйста, подождите…</div>
                    <div class="notifications-modal__progress">
                      <div class="notifications-modal__progress-bar" style="width:{percent}%"></div>
                    </div>
                  </div>
                </div>
              </div>
            {:else if updateCard.state === 'ready'}
              <button
                type="button"
                class="notifications-modal__item notifications-modal__item--app-update"
                onclick={handleInstallUpdate}
              >
                <div class="notifications-modal__avatar-wrap">
                  <div class="notifications-modal__thumb notifications-modal__thumb--placeholder">
                    {@html iconCheck(22)}
                  </div>
                  <span class="notifications-modal__marker notifications-modal__marker--update-ready">{@html iconCheck(12)}</span>
                </div>
                <div class="notifications-modal__main">
                  <div class="notifications-modal__content">
                    <div class="notifications-modal__text">Обновление скачано</div>
                    <div class="notifications-modal__time">
                      Закройте приложение или нажмите, чтобы установить.
                    </div>
                  </div>
                </div>
              </button>
            {:else if updateCard.state === 'error'}
              <div class="notifications-modal__item notifications-modal__item--app-update" role="status">
                <div class="notifications-modal__avatar-wrap">
                  <div class="notifications-modal__thumb notifications-modal__thumb--placeholder"></div>
                  <span class="notifications-modal__marker notifications-modal__marker--update"></span>
                </div>
                <div class="notifications-modal__main">
                  <div class="notifications-modal__content">
                    <div class="notifications-modal__text">Ошибка при скачивании обновления</div>
                    <div class="notifications-modal__time">
                      Попробуйте ещё раз позже.{updateCard.errorMessage ? ` (${updateCard.errorMessage})` : ''}
                    </div>
                  </div>
                </div>
              </div>
            {:else if updateCard.state === 'installing'}
              <div class="notifications-modal__item notifications-modal__item--app-update" role="status">
                <div class="notifications-modal__avatar-wrap">
                  <div class="notifications-modal__thumb notifications-modal__thumb--placeholder">
                    {@html iconDownload(22)}
                  </div>
                  <span class="notifications-modal__marker notifications-modal__marker--update-ready">{@html iconDownload(12)}</span>
                </div>
                <div class="notifications-modal__main">
                  <div class="notifications-modal__content">
                    <div class="notifications-modal__text">Установка обновления…</div>
                    <div class="notifications-modal__time">
                      Введите пароль в диалоге авторизации для завершения установки.
                    </div>
                  </div>
                </div>
              </div>
            {:else if updateCard.state === 'install-error'}
              <div class="notifications-modal__item notifications-modal__item--app-update" role="status">
                <div class="notifications-modal__avatar-wrap">
                  <div class="notifications-modal__thumb notifications-modal__thumb--placeholder"></div>
                  <span class="notifications-modal__marker notifications-modal__marker--update"></span>
                </div>
                <div class="notifications-modal__main">
                  <div class="notifications-modal__content">
                    <div class="notifications-modal__text">Установка отменена</div>
                    <div class="notifications-modal__time">
                      Нажмите «Установить», чтобы повторить.
                      {updateCard.errorMessage ? ` (${updateCard.errorMessage})` : ''}
                    </div>
                  </div>
                </div>
              </div>
            {/if}
          {/if}

          {#if loadState === 'loading'}
            <div class="notifications-modal__list notifications-modal__list--skeleton" aria-busy="true" aria-label="Загрузка уведомлений">
              {#each Array(6) as _, i (i)}
                <div class="notifications-modal__skel" aria-hidden="true">
                  <span class="notifications-modal__skel-avatar uiv2-skeleton uiv2-skeleton--full"></span>
                  <div class="notifications-modal__skel-main">
                    <span class="notifications-modal__skel-line uiv2-skeleton uiv2-skeleton--sm" style="width:{i % 2 === 0 ? '92%' : '78%'}"></span>
                    <span class="notifications-modal__skel-line uiv2-skeleton uiv2-skeleton--sm" style="width:{i % 3 === 0 ? '64%' : '54%'}"></span>
                    <span class="notifications-modal__skel-time uiv2-skeleton uiv2-skeleton--sm"></span>
                  </div>
                </div>
              {/each}
            </div>
          {:else if loadState === 'no-api'}
            <p class="notifications-modal__state notifications-modal__state--error">API недоступно (только в Electron).</p>
          {:else if loadState === 'empty'}
            <div class="notifications-modal__state notifications-modal__state--empty">
              <p class="notifications-modal__state-title">Пока тихо</p>
              <p class="notifications-modal__state-desc">Новые серии, записи и заявки в друзья появятся здесь</p>
            </div>
          {:else if loadState === 'error'}
            <p class="notifications-modal__state notifications-modal__state--error">Ошибка: {errorMsg}</p>
          {:else if loadState === 'loaded'}
            <UiV2Tabs
              class="uiv2-tabs--static notifications-modal__tabs"
              tabs={filterTabs}
              activeId={filter}
              onChange={(id) => { filter = id as NotificationFilterId; }}
            />

            {#if filteredNotifications.length === 0}
              <div class="notifications-modal__state">В этой категории пусто</div>
            {:else}
              <div class="notifications-modal__list">
                {#each filteredNotifications as raw, i (itemKey(raw, i))}
                  {@const n = parseNotification(raw)}
                  {@const key = itemKey(raw, i)}
                  {@const spoilerOpen = !!revealedSpoilers[key]}
                  <button
                    type="button"
                    class="notifications-modal__item"
                    class:notifications-modal__item--new={n.isNew}
                    onclick={(event) => handleItemClick(n, event)}
                  >
                    <div class="notifications-modal__avatar-wrap">
                      {#if n.image}
                        <div
                          class="notifications-modal__thumb"
                          style="background-image:url('{n.image}');"
                        ></div>
                      {:else}
                        <div class="notifications-modal__thumb notifications-modal__thumb--placeholder"></div>
                      {/if}
                      {@html markerHtml(n.markerKind)}
                    </div>

                    <div class="notifications-modal__main">
                      <div class="notifications-modal__content">
                        {#if n.spoilerText && !spoilerOpen}
                          <div class="notifications-modal__text notifications-modal__text--muted">
                            {@html n.bodyLeadHtml || n.bodyHtml}
                          </div>
                          <div
                            class="notifications-modal__spoiler"
                            role="button"
                            tabindex="0"
                            onclick={(e) => toggleSpoiler(key, e)}
                            onkeydown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') toggleSpoiler(key, e as unknown as MouseEvent);
                            }}
                          >
                            <span class="notifications-modal__spoiler-hint">Скрытый комментарий</span>
                            <span class="notifications-modal__spoiler-action">Показать</span>
                          </div>
                        {:else}
                          <div class="notifications-modal__text">{@html n.bodyHtml}</div>
                          {#if n.spoilerText && spoilerOpen}
                            <div class="notifications-modal__spoiler-body">{n.spoilerText}</div>
                            <span
                              class="notifications-modal__spoiler-hide"
                              role="button"
                              tabindex="0"
                              onclick={(e) => toggleSpoiler(key, e)}
                              onkeydown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') toggleSpoiler(key, e as unknown as MouseEvent);
                              }}
                            >Скрыть</span>
                          {/if}
                        {/if}
                        {#if n.timeStr}
                          <div class="notifications-modal__time">{n.timeStr}</div>
                        {/if}
                      </div>
                      {#if n.isNew}
                        <span class="notifications-modal__dot" aria-label="Новое"></span>
                      {/if}
                    </div>
                  </button>
                {/each}
              </div>
            {/if}
          {/if}
        {/if}
      </div>
    </Page>
  </div>
</div>

<NotificationCheckboxDialog
  open={listsDialogOpen}
  title="Выберите списки"
  options={NOTIFICATION_LIST_STATUSES.map((s) => ({ id: s.id, label: s.label }))}
  selectedIds={listsPickerIds}
  busy={prefBusy}
  onClose={() => { listsDialogOpen = false; }}
  onConfirm={(ids) => { void confirmLists(ids); }}
/>

{#if typesScopeOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="release-notify-modal-overlay"
    role="presentation"
    onclick={(e) => {
      if (e.target === e.currentTarget && !prefBusy) typesScopeOpen = false;
    }}
  >
    <div
      class="release-notify-modal uikit-v2"
      role="dialog"
      aria-modal="true"
      aria-label="Уведомления о новых сериях"
    >
      <h3 class="release-notify-modal__title">Уведомления о новых сериях</h3>
      <div class="release-notify-modal__options">
        <button
          type="button"
          class="release-notify-modal__option"
          class:release-notify-modal__option--on={typesScopeMode === 'all'}
          disabled={prefBusy || voiceoverCatalog.length === 0}
          onclick={() => { void chooseAllVoiceovers(); }}
        >
          <span class="release-notify-modal__option-icon">{@html iconList(20)}</span>
          <span class="release-notify-modal__option-label">От всех озвучек</span>
        </button>
        <button
          type="button"
          class="release-notify-modal__option"
          class:release-notify-modal__option--on={typesScopeMode === 'selected'}
          disabled={prefBusy || voiceoverCatalog.length === 0}
          onclick={chooseSelectedVoiceovers}
        >
          <span class="release-notify-modal__option-icon">{@html iconListChecks(20)}</span>
          <span class="release-notify-modal__option-label">От выбранных</span>
          <span class="release-notify-modal__option-chevron">{@html iconChevronRight(18)}</span>
        </button>
      </div>
    </div>
  </div>
{/if}

<NotificationCheckboxDialog
  open={typesDialogOpen}
  title="Выберите озвучки"
  options={voiceoverCatalog.map((t) => ({ id: t.id, label: t.name }))}
  selectedIds={typesPickerIds}
  busy={prefBusy}
  onClose={() => { typesDialogOpen = false; }}
  onConfirm={(ids) => { void confirmTypes(ids); }}
/>

<ReleaseEpisodeNotifyModal
  open={releaseNotifyOpen}
  releaseId={releaseNotifyId}
  catalog={releaseNotifyCatalog}
  selectedIds={releaseNotifySelected}
  busy={prefBusy}
  onClose={() => { releaseNotifyOpen = false; }}
  onSave={(ids) => saveReleaseNotify(ids)}
/>
