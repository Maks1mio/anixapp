<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import UiV2RoundButton from './uikit-v2/UiV2RoundButton.svelte';
  import UiV2Toggle from './uikit-v2/UiV2Toggle.svelte';
  import NotificationCheckboxDialog from './NotificationCheckboxDialog.svelte';
  import ReleaseEpisodeNotifyModal from './ReleaseEpisodeNotifyModal.svelte';
  import {
    iconX,
    iconChevronLeft,
    iconChevronRight,
    iconList,
    iconListChecks,
    iconLayoutGrid,
  } from './icons';
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
    /** Без шапки модалки — только контент настроек (по умолчанию). */
    embedded?: boolean;
    onClose?: () => void;
  }

  const { embedded = true, onClose }: Props = $props();

  type PanelView = 'settings' | 'releasePrefs';

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

  let panelView = $state<PanelView>('settings');
  let prefBusy = $state(false);
  let prefs = $state<NotificationPrefsState>(emptyPrefs());
  let prefsError = $state('');
  let voiceoverCatalog = $state<VoiceoverTypeOption[]>([]);
  let listsDialogOpen = $state(false);
  let typesScopeOpen = $state(false);
  let typesDialogOpen = $state(false);
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

  function handleKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
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
    if (!embedded) {
      onClose?.();
    }
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

  async function toggleBoolPref(key: BoolPrefKey) {
    if (prefBusy) return;
    const edit = BOOL_PREF_EDITS[key];
    prefBusy = true;
    const prev = prefs[key];
    prefs = { ...prefs, [key]: !prev };
    try {
      await window.anixApi?.notification?.preference?.edit?.(edit);
      if (key === 'is_episode_notifications_enabled' && !prev) {
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
    void loadPrefs();
  });

  onDestroy(() => {
    document.removeEventListener('keydown', handleKeydown);
  });
</script>

{#if !embedded}
  <header class="notifications-modal__header">
    {#if panelView === 'releasePrefs'}
      <UiV2RoundButton label="Назад к настройкам" size="sm" onclick={() => { panelView = 'settings'; }}>
        {@html iconChevronLeft(16)}
      </UiV2RoundButton>
      <h2 class="notifications-modal__heading">Уведомления по релизам</h2>
    {:else}
      <h2 class="notifications-modal__heading">Настройки уведомлений</h2>
    {/if}
    {#if onClose}
      <UiV2RoundButton label="Закрыть" size="sm" onclick={onClose}>
        {@html iconX(16)}
      </UiV2RoundButton>
    {/if}
  </header>
{/if}

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
{:else}
  <div class="notifications-modal__release-prefs">
    {#if embedded}
      <button
        type="button"
        class="notifications-modal__pref-link"
        onclick={() => { panelView = 'settings'; }}
      >
        <span aria-hidden="true">{@html iconChevronLeft(16)}</span>
        Назад к настройкам
      </button>
    {/if}
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
{/if}

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
