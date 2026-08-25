<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { handleUserProfileClick } from '../stores/user-profile';
  import {
    fetchAllNotifications,
    markNotificationsRead,
  } from '../stores/notifications';
  import {
    iconPlay,
    iconBookmark,
    iconDownload,
    iconCheck,
    iconUser,
    iconClipboardList,
    iconMessageCircle,
  } from './icons';
  import type { AppUpdateProgress } from '../types/electron';
  import Page from './Page.svelte';
  import {
    parseNotification,
    type ParsedNotification,
  } from '../utils/notification-format';

  interface Props {
    onClose: () => void;
  }

  const { onClose }: Props = $props();

  type LoadState = 'loading' | 'no-api' | 'empty' | 'error' | 'loaded';

  let loadState = $state<LoadState>('loading');
  let errorMsg = $state('');
  let notifications = $state<unknown[]>([]);
  let updateCard = $state<AppUpdateProgress | null>(null);

  function markerHtml(kind: ParsedNotification['markerKind']): string {
    switch (kind) {
      case 'episode':
        return `<span class="notifications-modal__marker notifications-modal__marker--episode">${iconPlay(12)}</span>`;
      case 'article':
        return `<span class="notifications-modal__marker notifications-modal__marker--article">${iconClipboardList(11)}</span>`;
      case 'related':
        return `<span class="notifications-modal__marker notifications-modal__marker--related">${iconBookmark(12)}</span>`;
      case 'friend':
        return `<span class="notifications-modal__marker notifications-modal__marker--friend">${iconUser(11, true)}</span>`;
      case 'friend-accept':
        return `<span class="notifications-modal__marker notifications-modal__marker--friend-accept">${iconCheck(11)}</span>`;
      case 'comment':
        return `<span class="notifications-modal__marker notifications-modal__marker--comment">${iconMessageCircle(11)}</span>`;
      default:
        return '';
    }
  }

  function handleItemClick(n: ParsedNotification, event: MouseEvent) {
    if (n.releaseId) {
      close();
      navigate(`/release/${n.releaseId}`);
      return;
    }
    // Channel pages are not routed yet; blog channel id matches profile id.
    if (n.channelId || n.profileId) {
      const profileId = n.profileId ?? n.channelId;
      if (profileId) handleUserProfileClick(profileId, event);
    }
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
    if (e.key === 'Escape') close();
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
        void markNotificationsRead();

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
  <div class="notifications-modal-panel">
    <div class="notifications-modal__header">
      <h2 class="notifications-modal__heading">Уведомления</h2>
      <button type="button" class="notifications-modal__close" aria-label="Закрыть" onclick={close}></button>
    </div>

    <Page noPadding={true} extraClass="notifications-modal__page">
    <div class="notifications-modal__body">
      {#if updateCard}
        {#if updateCard.state === 'downloading'}
          {@const percent = updateCard.total > 0
            ? Math.round((updateCard.received / updateCard.total) * 100)
            : (updateCard.percent || 0)}
          <div class="notifications-modal__item notifications-modal__item--app-update">
            <div class="notifications-modal__thumb notifications-modal__thumb--placeholder">
              <span class="notifications-modal__marker notifications-modal__marker--update">{@html iconDownload(12)}</span>
            </div>
            <div class="notifications-modal__content">
              <div class="notifications-modal__text">Скачивание обновления AnixApp</div>
              <div class="notifications-modal__time">Пожалуйста, подождите…</div>
              <div class="notifications-modal__progress">
                <div class="notifications-modal__progress-bar" style="width:{percent}%"></div>
              </div>
            </div>
          </div>
        {:else if updateCard.state === 'ready'}
          <button
            type="button"
            class="notifications-modal__item notifications-modal__item--app-update"
            onclick={handleInstallUpdate}
          >
            <div class="notifications-modal__thumb notifications-modal__thumb--placeholder">
              <span class="notifications-modal__marker notifications-modal__marker--update-ready">{@html iconCheck(12)}</span>
            </div>
            <div class="notifications-modal__content">
              <div class="notifications-modal__text">Обновление скачано</div>
              <div class="notifications-modal__time">
                Закройте приложение или нажмите, чтобы установить.
              </div>
            </div>
          </button>
        {:else if updateCard.state === 'error'}
          <div class="notifications-modal__item notifications-modal__item--app-update">
            <div class="notifications-modal__thumb notifications-modal__thumb--placeholder">
              <span class="notifications-modal__marker notifications-modal__marker--update"></span>
            </div>
            <div class="notifications-modal__content">
              <div class="notifications-modal__text">Ошибка при скачивании обновления</div>
              <div class="notifications-modal__time">
                Попробуйте ещё раз позже.{updateCard.errorMessage ? ` (${updateCard.errorMessage})` : ''}
              </div>
            </div>
          </div>
        {:else if updateCard.state === 'installing'}
          <div class="notifications-modal__item notifications-modal__item--app-update">
            <div class="notifications-modal__thumb notifications-modal__thumb--placeholder">
              <span class="notifications-modal__marker notifications-modal__marker--update-ready">{@html iconDownload(12)}</span>
            </div>
            <div class="notifications-modal__content">
              <div class="notifications-modal__text">Установка обновления…</div>
              <div class="notifications-modal__time">
                Введите пароль в диалоге авторизации для завершения установки.
              </div>
            </div>
          </div>
        {:else if updateCard.state === 'install-error'}
          <div class="notifications-modal__item notifications-modal__item--app-update">
            <div class="notifications-modal__thumb notifications-modal__thumb--placeholder">
              <span class="notifications-modal__marker notifications-modal__marker--update"></span>
            </div>
            <div class="notifications-modal__content">
              <div class="notifications-modal__text">Установка отменена</div>
              <div class="notifications-modal__time">
                Нажмите «Установить», чтобы повторить.
                {updateCard.errorMessage ? ` (${updateCard.errorMessage})` : ''}
              </div>
            </div>
          </div>
        {/if}
      {/if}

      {#if loadState === 'loading'}
        <div class="notifications-modal__loading">Загрузка…</div>
      {:else if loadState === 'no-api'}
        <p class="notifications-modal__error">API недоступно (только в Electron).</p>
      {:else if loadState === 'empty'}
        <p class="notifications-modal__empty">Уведомлений пока нет.</p>
      {:else if loadState === 'error'}
        <p class="notifications-modal__error">Ошибка: {errorMsg}</p>
      {:else if loadState === 'loaded'}
        <div class="notifications-modal__list">
          {#each notifications as raw}
            {@const n = parseNotification(raw)}
            <button
              type="button"
              class="notifications-modal__item"
              class:notifications-modal__item--new={n.isNew}
              onclick={(event) => handleItemClick(n, event)}
            >
              {#if n.image}
                <div
                  class="notifications-modal__thumb"
                  style="background-image:url('{n.image}');"
                >
                  {@html markerHtml(n.markerKind)}
                </div>
              {:else}
                <div class="notifications-modal__thumb notifications-modal__thumb--placeholder">
                  {@html markerHtml(n.markerKind)}
                </div>
              {/if}
              <div class="notifications-modal__content">
                <div class="notifications-modal__text">{@html n.bodyHtml}</div>
                {#if n.timeStr}
                  <div class="notifications-modal__time">{n.timeStr}</div>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    </Page>
  </div>
</div>
