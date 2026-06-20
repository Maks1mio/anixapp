<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../stores/navigation';
  import {
    iconPlay,
    iconBookmark,
    iconDownload,
    iconCheck,
    iconUser,
  } from './icons';
  import type { AppUpdateProgress } from '../types/electron';
  import { resolveCdnAssetUrl } from '../utils/posterUrl';
  import Page from './Page.svelte';

  interface Props {
    onClose: () => void;
  }

  const { onClose }: Props = $props();

  // ── types ─────────────────────────────────────────────────────────────────────
  interface EpisodeNotification {
    type: 'episode';
    id: number;
    timestamp: number;
    is_new: boolean;
    is_pushed: boolean;
    episode?: {
      name?: string;
      position?: number;
      release?: { id?: number; title_ru?: string; image?: string };
      source?: { name?: string; type?: { name?: string } };
    };
  }

  interface RelatedReleaseNotification {
    type: 'relatedRelease';
    id: number;
    timestamp: number;
    is_new: boolean;
    is_pushed: boolean;
    release?: { id?: number; title_ru?: string; image?: string };
  }

  type AnyNotification = EpisodeNotification | RelatedReleaseNotification | any;

  // ── state ─────────────────────────────────────────────────────────────────────
  type LoadState = 'loading' | 'no-api' | 'empty' | 'error' | 'loaded';

  let loadState = $state<LoadState>('loading');
  let errorMsg = $state('');
  let notifications = $state<AnyNotification[]>([]);

  // update card state
  let updateCard = $state<AppUpdateProgress | null>(null);

  // ── helpers ───────────────────────────────────────────────────────────────────
  function cdnImage(raw: unknown): string {
    if (typeof raw !== 'string') return '';
    return resolveCdnAssetUrl(raw);
  }

  function formatTime(ts: number | undefined): string {
    if (!ts) return '';
    try {
      const now = new Date();
      const d = new Date(ts * 1000);
      const diffMs = now.getTime() - d.getTime();
      const diffSec = Math.max(0, Math.floor(diffMs / 1000));
      const diffMin = Math.floor(diffSec / 60);
      const diffHour = Math.floor(diffMin / 60);

      const plural = (n: number, one: string, few: string, many: string) => {
        const nAbs = Math.abs(n) % 100;
        const n1 = nAbs % 10;
        if (nAbs > 10 && nAbs < 20) return many;
        if (n1 === 1) return one;
        if (n1 >= 2 && n1 <= 4) return few;
        return many;
      };

      if (diffSec < 60) {
        const s = Math.max(1, diffSec);
        return `${s} ${plural(s, 'секунду', 'секунды', 'секунд')} назад`;
      }
      if (diffMin < 60) {
        const m = Math.max(1, diffMin);
        return `${m} ${plural(m, 'минуту', 'минуты', 'минут')} назад`;
      }
      if (diffHour < 24 && d.getDate() === now.getDate()) {
        const h = Math.max(1, diffHour);
        return `${h} ${plural(h, 'час', 'часа', 'часов')} назад`;
      }

      const months = ['января','февраля','марта','апреля','мая','июня','июля','августа','сентября','октября','ноября','декабря'];
      const dd = d.getDate();
      const mm = months[d.getMonth()];
      const hh = d.getHours().toString().padStart(2, '0');
      const mi = d.getMinutes().toString().padStart(2, '0');
      const isSameYear = d.getFullYear() === now.getFullYear();
      const yesterday = new Date(now);
      yesterday.setDate(now.getDate() - 1);
      const dayBeforeYesterday = new Date(now);
      dayBeforeYesterday.setDate(now.getDate() - 2);
      const isSameDay = (a: Date, b: Date) =>
        a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();

      if (isSameDay(d, yesterday)) return `Вчера в ${hh}:${mi}`;
      if (isSameDay(d, dayBeforeYesterday)) return `Позавчера в ${hh}:${mi}`;
      if (isSameYear) return `${dd} ${mm} в ${hh}:${mi}`;
      return `${dd} ${mm} ${d.getFullYear()} в ${hh}:${mi}`;
    } catch {
      return '';
    }
  }

  interface ParsedNotification {
    title: string;
    subtitle: string;
    metaLeft: string;
    image: string;
    timeStr: string;
    isNew: boolean;
    markerHtml: string;
    releaseId?: number;
    profileId?: number;
  }

  function parseNotification(raw: AnyNotification): ParsedNotification {
    const type = raw.type as string;
    let title = 'Уведомление';
    let subtitle = '';
    let metaLeft = '';
    let image = '';
    let markerHtml = '';
    let releaseId: number | undefined;
    let profileId: number | undefined;

    if (type === 'episode') {
      const n = raw as EpisodeNotification;
      const episode = n.episode;
      const release = episode?.release;
      releaseId = release?.id;
      image = cdnImage(release?.image);
      const pos = episode?.position;
      const epName = episode?.name || '';
      const posStr = typeof pos === 'number' ? `${pos} серия` : epName;
      title = release?.title_ru || posStr || 'Новый эпизод';
      subtitle = posStr ? `Новая серия · ${posStr}` : 'Новый эпизод';
      const sourceName = episode?.source?.name;
      const sourceType = episode?.source?.type?.name;
      metaLeft = [sourceName, sourceType].filter(Boolean).join(' · ');
      markerHtml = `<span class="notifications-modal__marker notifications-modal__marker--episode">${iconPlay(14)}</span>`;
    } else if (type === 'relatedRelease') {
      const n = raw as RelatedReleaseNotification;
      const rel = n.release;
      releaseId = rel?.id;
      image = cdnImage(rel?.image);
      title = rel?.title_ru || 'Релиз';
      subtitle = 'Связанный релиз';
      markerHtml = `<span class="notifications-modal__marker notifications-modal__marker--related">${iconBookmark(13)}</span>`;
    } else if (type === 'friend') {
      const p = raw.by_profile;
      profileId = p?.id != null ? Number(p.id) : undefined;
      image = cdnImage(p?.avatar);
      const login = String(p?.login || 'Пользователь');
      title = login;
      const status = String(raw.status || '');
      if (status === 'REQUEST') {
        subtitle = 'Заявка в друзья';
        markerHtml = `<span class="notifications-modal__marker notifications-modal__marker--friend">${iconUser(12)}</span>`;
      } else if (status === 'ACCEPT') {
        subtitle = 'Принял(а) вашу заявку';
        markerHtml = `<span class="notifications-modal__marker notifications-modal__marker--friend-accept">${iconCheck(12)}</span>`;
      } else {
        subtitle = 'Уведомление о друзьях';
        markerHtml = `<span class="notifications-modal__marker notifications-modal__marker--friend">${iconUser(12)}</span>`;
      }
      metaLeft = 'Друзья';
    } else if (raw.release) {
      const rel = raw.release;
      releaseId = rel?.id;
      image = cdnImage(rel?.image);
      title = rel?.title_ru || 'Релиз';
      subtitle = 'Уведомление о релизе';
    } else {
      title = String(raw.title || 'Уведомление');
    }

    return {
      title,
      subtitle,
      metaLeft,
      image,
      timeStr: formatTime(raw.timestamp),
      isNew: !!raw.is_new,
      markerHtml,
      releaseId,
      profileId,
    };
  }

  function handleItemClick(n: ParsedNotification) {
    if (n.releaseId) {
      close();
      navigate(`/release/${n.releaseId}`);
    } else if (n.profileId) {
      close();
      navigate(`/profile/${n.profileId}`);
    }
  }

  // ── update progress ───────────────────────────────────────────────────────────
  function onUpdateProgress(e: Event) {
    const data = (e as CustomEvent<AppUpdateProgress>).detail;
    if (data) updateCard = data;
  }

  function handleInstallUpdate() {
    window.electron?.installUpdate?.();
  }

  // ── close / keyboard ──────────────────────────────────────────────────────────
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

    window.anixApi.notification
      .all(0)
      .then((data: any) => {
        const content = (data?.content ?? []) as AnyNotification[];
        if (content.length === 0) {
          loadState = 'empty';
          return;
        }
        content.sort((a: any, b: any) => {
          const ta = typeof a.timestamp === 'number' ? a.timestamp : 0;
          const tb = typeof b.timestamp === 'number' ? b.timestamp : 0;
          return tb - ta;
        });
        notifications = content;
        loadState = 'loaded';
      })
      .catch((err: unknown) => {
        errorMsg = String(err);
        loadState = 'error';
      });
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
      <h2 class="notifications-modal__title">Уведомления</h2>
      <button type="button" class="notifications-modal__close" aria-label="Закрыть" onclick={close}></button>
    </div>

    <Page noPadding={true}>
    <div class="notifications-modal__body">
      <!-- App update card slot -->
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
              <div class="notifications-modal__row">
                <span class="notifications-modal__title">Скачивание обновления AnixApp</span>
              </div>
              <div class="notifications-modal__subtitle">Пожалуйста, подождите…</div>
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
              <div class="notifications-modal__row">
                <span class="notifications-modal__title">Обновление скачано</span>
                <span class="notifications-modal__badge">Готово</span>
              </div>
              <div class="notifications-modal__subtitle">
                Закройте приложение или нажмите на уведомление, чтобы начать установку.
              </div>
            </div>
          </button>
        {:else if updateCard.state === 'error'}
          <div class="notifications-modal__item notifications-modal__item--app-update">
            <div class="notifications-modal__thumb notifications-modal__thumb--placeholder">
              <span class="notifications-modal__marker notifications-modal__marker--update"></span>
            </div>
            <div class="notifications-modal__content">
              <div class="notifications-modal__row">
                <span class="notifications-modal__title">Ошибка при скачивании обновления</span>
              </div>
              <div class="notifications-modal__subtitle">
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
              <div class="notifications-modal__row">
                <span class="notifications-modal__title">Установка обновления…</span>
                <span class="notifications-modal__badge">Ожидание</span>
              </div>
              <div class="notifications-modal__subtitle">
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
              <div class="notifications-modal__row">
                <span class="notifications-modal__title">Установка отменена</span>
              </div>
              <div class="notifications-modal__subtitle">
                Вы отменили ввод пароля или произошла ошибка. Нажмите «Установить» чтобы повторить.
                {updateCard.errorMessage ? ` (${updateCard.errorMessage})` : ''}
              </div>
            </div>
          </div>
        {/if}
      {/if}

      <!-- Notification list -->
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
              onclick={() => handleItemClick(n)}
            >
              {#if n.image}
                <div
                  class="notifications-modal__thumb"
                  style="background-image:url('{n.image}');"
                >
                  {@html n.markerHtml}
                </div>
              {:else}
                <div class="notifications-modal__thumb notifications-modal__thumb--placeholder">
                  {@html n.markerHtml}
                </div>
              {/if}
              <div class="notifications-modal__content">
                <div class="notifications-modal__row">
                  <span class="notifications-modal__title">{n.title}</span>
                  {#if n.isNew}
                    <span class="notifications-modal__badge">Новое</span>
                  {/if}
                </div>
                {#if n.subtitle}
                  <div class="notifications-modal__subtitle">{n.subtitle}</div>
                {/if}
                <div class="notifications-modal__meta">
                  {#if n.metaLeft}
                    <span class="notifications-modal__meta-left">{n.metaLeft}</span>
                  {/if}
                  {#if n.timeStr}
                    <span class="notifications-modal__meta-time">{n.timeStr}</span>
                  {/if}
                </div>
              </div>
            </button>
          {/each}
        </div>
      {/if}
    </div>
    </Page>
  </div>
</div>
