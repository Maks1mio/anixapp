<script lang="ts">
  /**
   * «Продолжить просмотр» на главной (как в Anixart 11): последний релиз из истории.
   * Если серия брошена на середине, показывает таймкод и «Смотреть» открывает плеер прямо с него.
   * Иначе «Смотреть» берёт свежий релиз через release/{id}/continue и открывает окно серий,
   * «Скрыть» прячет карточку до следующего просмотра.
   */
  import { onDestroy, onMount, untrack } from 'svelte';
  import UiV2Card from './uikit-v2/UiV2Card.svelte';
  import { isMobileMode } from '../platform/mobile';
  import { iconPlay, iconX } from './icons';
  import { isAuthenticated } from '../stores/auth';
  import { navigate } from '../stores/navigation';
  import { isPlayerWindowOpen, openWatchModal } from '../stores/modals';
  import { mapHistoryRawToReleaseCard } from '../utils/historyCard';
  import { toPosterDisplayUrl } from '../utils/posterUrl';
  import { launchPlayer } from '../utils/watch-nav';
  import { getCurrentRoomId } from '../services/lobby-state';
  import { fetchWatchProgress, isResumable, type WatchProgress } from '../services/watch-progress';
  import { fmtTime } from '../views/Watch/_utils';
  import type { ReleaseCardData } from '../types/release';

  const DISMISS_KEY = 'anix:continueWatchingDismissed';
  const LIVE_REFRESH_MS = 15_000;

  let item = $state<ReleaseCardData | null>(null);
  let opening = $state(false);
  /** Брошенная на середине серия этого релиза. */
  let progress = $state<WatchProgress | null>(null);
  /** Подпись серии из истории Anixart и её позиция: таймкод может быть от другой серии. */
  let historyEpisodePosition: number | null = null;

  function dismissKeyOf(card: ReleaseCardData): string {
    return `${card.id}:${card.historyView?.viewedAt ?? ''}`;
  }

  function isDismissed(card: ReleaseCardData): boolean {
    try {
      return localStorage.getItem(DISMISS_KEY) === dismissKeyOf(card);
    } catch {
      return false;
    }
  }

  async function load() {
    const api = window.anixApi?.history?.all;
    if (!api) return;
    try {
      const data = await api(0) as { content?: Record<string, unknown>[] };
      const raw = data?.content?.[0];
      if (!raw) return;
      const card = mapHistoryRawToReleaseCard(raw);
      // На телефоне плашку не скрывают — прежнее «Скрыть» тоже не действует
      if (!card.id || (!isMobileMode() && isDismissed(card))) {
        item = null;
        return;
      }
      const lastEp = raw.last_view_episode as { position?: unknown } | undefined;
      historyEpisodePosition = typeof lastEp?.position === 'number' ? lastEp.position : null;
      const latest = (await fetchWatchProgress(card.id))?.[0];
      progress = latest && isResumable(latest) ? latest : null;
      item = card;
    } catch {
      // блок необязательный — без истории просто не показываем
    }
  }

  const title = $derived(item?.titleRu || item?.titleEn || 'Без названия');
  const subtitle = $derived.by(() => {
    const p = progress;
    if (!p) return [item?.historyView?.episodeLabel, item?.historyView?.dubberLabel].filter(Boolean).join(' · ');
    const sameEpisode = historyEpisodePosition === p.episode_position;
    return [
      sameEpisode ? item?.historyView?.episodeLabel : `${p.episode_position} серия`,
      p.dubber_name || (sameEpisode ? item?.historyView?.dubberLabel : ''),
    ].filter(Boolean).join(' · ');
  });
  /** Таймкод у полосы прогресса, как в плеере */
  const timecode = $derived(progress ? `${fmtTime(progress.position_sec)} / ${fmtTime(progress.duration_sec)}` : '');
  const poster = $derived(item?.poster ? toPosterDisplayUrl(item.poster, 'cardVertical') : '');

  async function watch() {
    const card = item;
    if (!card?.id || opening) return;
    opening = true;
    try {
      // В комнате выбор серии идёт через окно серий: там голосование и права хоста.
      if (progress?.source_id && !getCurrentRoomId()) {
        await launchPlayer({
          releaseId: card.id,
          sourceId: progress.source_id,
          ep: progress.episode_position,
          title,
          sourceName: progress.source_name ?? '',
          dubberId: progress.dubber_id ?? undefined,
          dubberName: progress.dubber_name ?? undefined,
          resume: true,
        });
        return;
      }
      const res = await window.anixApi?.release?.continueWatching?.(card.id);
      if (res && res.code != null && res.code !== 0 && !res.release) {
        navigate(`/release/${card.id}`);
        return;
      }
      openWatchModal(card.id, title);
    } catch {
      openWatchModal(card.id, title);
    } finally {
      opening = false;
    }
  }

  function dismiss() {
    if (!item) return;
    try {
      localStorage.setItem(DISMISS_KEY, dismissKeyOf(item));
    } catch {
      // ignore
    }
    item = null;
  }

  /**
   * Плеер закрылся: его последний таймкод ещё в пути. Первый раз — чтобы обновить быстро,
   * второй — на случай, если запись дошла позже (первая проверка токена на сервере бывает долгой).
   */
  let reloadTimer: ReturnType<typeof setTimeout> | undefined;
  let reloadRetryTimer: ReturnType<typeof setTimeout> | undefined;
  function reloadAfterPlayer() {
    clearTimeout(reloadTimer);
    clearTimeout(reloadRetryTimer);
    reloadTimer = setTimeout(() => void load(), 800);
    reloadRetryTimer = setTimeout(() => void load(), 3500);
  }

  /** Пока плеер открыт в своём окне, таймкод на карточке идёт вслед за просмотром. */
  $effect(() => {
    const releaseId = item?.id;
    if (!$isPlayerWindowOpen || !releaseId) return;
    const timer = setInterval(() => {
      void fetchWatchProgress(releaseId).then((items) => {
        if (!items || item?.id !== releaseId) return;
        progress = items[0] && isResumable(items[0]) ? items[0] : null;
      });
    }, LIVE_REFRESH_MS);
    return () => clearInterval(timer);
  });

  // При холодном старте главная появляется раньше, чем подтверждён вход, — грузим, как только он есть
  $effect(() => {
    if ($isAuthenticated) untrack(() => void load());
  });

  onMount(() => {
    window.addEventListener('player:windowClosed', reloadAfterPlayer);
  });

  onDestroy(() => {
    clearTimeout(reloadTimer);
    clearTimeout(reloadRetryTimer);
    window.removeEventListener('player:windowClosed', reloadAfterPlayer);
  });
</script>

{#if item}
  <UiV2Card label="Продолжить просмотр" class="home-continue">
    <div class="home-continue__row">
      <button
        type="button"
        class="home-continue__poster"
        style={poster ? `background-image:url('${poster}')` : undefined}
        aria-label={title}
        onclick={() => navigate(`/release/${item!.id}`)}
      ></button>
      <div class="home-continue__meta">
        <span class="home-continue__kicker">Продолжить просмотр</span>
        <button type="button" class="home-continue__title" onclick={() => navigate(`/release/${item!.id}`)}>
          {title}
        </button>
        {#if subtitle}
          <span class="home-continue__sub">{subtitle}</span>
        {/if}
        {#if progress}
          <span class="home-continue__track">
            <span class="home-continue__bar" aria-hidden="true">
              <span style:width="{(progress.position_sec / progress.duration_sec) * 100}%"></span>
            </span>
            <span class="home-continue__time">{timecode}</span>
          </span>
        {/if}
      </div>
      <div class="home-continue__actions">
        <button
          type="button"
          class="uiv2-btn uiv2-btn--md uiv2-btn--primary"
          disabled={opening}
          onclick={() => void watch()}
          aria-label="Смотреть"
        >
          <span class="home-continue__play-icon" aria-hidden="true">{@html iconPlay(20)}</span>
          <span class="uiv2-btn__label">{opening ? 'Открываю…' : 'Смотреть'}</span>
        </button>
        <button type="button" class="home-continue__dismiss" aria-label="Скрыть" onclick={dismiss}>
          {@html iconX(16)}
        </button>
      </div>
    </div>
  </UiV2Card>
{/if}

<style lang="scss">
  :global(.home-continue) {
    margin: 0 0 1rem;
  }

  .home-continue__row {
    display: flex;
    align-items: center;
    gap: 0.9rem;
  }

  .home-continue__poster {
    flex: 0 0 auto;
    width: 3.25rem;
    aspect-ratio: 2 / 3;
    padding: 0;
    border: 0;
    border-radius: 8px;
    background: var(--uiv2-hover-bg) center / cover no-repeat;
    cursor: pointer;
  }

  .home-continue__meta {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .home-continue__kicker {
    font-size: 0.75rem;
    color: var(--uiv2-fg-muted);
  }

  .home-continue__title {
    overflow: hidden;
    padding: 0;
    border: 0;
    background: none;
    color: var(--uiv2-fg-strong);
    font: inherit;
    font-weight: 600;
    text-align: left;
    text-overflow: ellipsis;
    white-space: nowrap;
    cursor: pointer;

    &:hover {
      text-decoration: underline;
    }
  }

  .home-continue__sub {
    overflow: hidden;
    font-size: 0.82rem;
    color: var(--uiv2-fg-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .home-continue__track {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: min(100%, 22rem);
    margin-top: 0.3rem;
  }

  .home-continue__time {
    flex: none;
    font-size: 0.75rem;
    font-variant-numeric: tabular-nums;
    color: var(--uiv2-fg-muted);
  }

  .home-continue__bar {
    overflow: hidden;
    flex: 1 1 auto;
    height: 3px;
    border-radius: 999px;
    background: var(--uiv2-hover-bg);

    > span {
      display: block;
      height: 100%;
      border-radius: inherit;
      background: var(--uikit-v2-accent, #e65454);
    }
  }

  .home-continue__actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.35rem;
  }

  .home-continue__play-icon {
    display: none;
  }

  .home-continue__dismiss {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 2rem;
    height: 2rem;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: transparent;
    color: var(--uiv2-fg-muted);
    cursor: pointer;

    &:hover {
      background: var(--uiv2-hover-bg);
      color: var(--uiv2-fg-strong);
    }
  }
</style>
