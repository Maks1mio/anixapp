<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { openFeedArticle, openFeedChannel } from '../stores/feed-focus';
  import { handleUserProfileClick } from '../stores/user-profile';
  import { fetchAllNotifications, markNotificationsRead } from '../stores/notifications';
  import { openSettingsModal } from '../stores/modals';
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
    iconListChecks,
  } from './icons';
  import type { AppUpdateProgress } from '../types/electron';
  import Page from './Page.svelte';
  import UiV2RoundButton from './uikit-v2/UiV2RoundButton.svelte';
  import UiV2Tabs, { type UiV2TabItem } from './uikit-v2/UiV2Tabs.svelte';
  import {
    parseNotification,
    notificationFilterId,
    type NotificationFilterId,
    type ParsedNotification,
  } from '../utils/notification-format';

  interface Props {
    onClose: () => void;
  }

  const { onClose }: Props = $props();

  type LoadState = 'loading' | 'no-api' | 'empty' | 'error' | 'loaded';

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
  let markBusy = $state(false);

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

  function openNotificationSettings() {
    close();
    openSettingsModal('notifications');
  }

  function handleKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') {
      close();
    }
  }

  function handleOverlayClick(e: MouseEvent) {
    if ((e.target as HTMLElement).classList.contains('notifications-modal-overlay')) close();
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
        <UiV2RoundButton label="Настройки уведомлений" size="sm" onclick={openNotificationSettings}>
          {@html iconSettings(16)}
        </UiV2RoundButton>
        <UiV2RoundButton label="Закрыть" size="sm" onclick={close}>
          {@html iconX(16)}
        </UiV2RoundButton>
      </div>
    </header>

    <Page noPadding={true} extraClass="notifications-modal__page">
      <div class="notifications-modal__body">
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
      </div>
    </Page>
  </div>
</div>
