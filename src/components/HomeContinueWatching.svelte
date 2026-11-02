<script lang="ts">
  /**
   * «Продолжить просмотр» на главной (как в Anixart 11): последний релиз из истории.
   * «Смотреть» берёт свежий релиз через release/{id}/continue и открывает плеер,
   * «Скрыть» прячет карточку до следующего просмотра.
   */
  import { onMount } from 'svelte';
  import UiV2Card from './uikit-v2/UiV2Card.svelte';
  import { iconX } from './icons';
  import { isAuthenticated } from '../stores/auth';
  import { navigate } from '../stores/navigation';
  import { openWatchModal } from '../stores/modals';
  import { mapHistoryRawToReleaseCard } from '../utils/historyCard';
  import { toPosterDisplayUrl } from '../utils/posterUrl';
  import type { ReleaseCardData } from '../types/release';

  const DISMISS_KEY = 'anix:continueWatchingDismissed';

  let item = $state<ReleaseCardData | null>(null);
  let opening = $state(false);

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
      if (!card.id || isDismissed(card)) return;
      item = card;
    } catch {
      // блок необязательный — без истории просто не показываем
    }
  }

  const title = $derived(item?.titleRu || item?.titleEn || 'Без названия');
  const subtitle = $derived(
    [item?.historyView?.episodeLabel, item?.historyView?.dubberLabel].filter(Boolean).join(' · '),
  );
  const poster = $derived(item?.poster ? toPosterDisplayUrl(item.poster, 'cardVertical') : '');

  async function watch() {
    const card = item;
    if (!card?.id || opening) return;
    opening = true;
    try {
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

  onMount(() => {
    if ($isAuthenticated) void load();
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
      </div>
      <div class="home-continue__actions">
        <button
          type="button"
          class="uiv2-btn uiv2-btn--md uiv2-btn--primary"
          disabled={opening}
          onclick={() => void watch()}
        >
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

  .home-continue__actions {
    display: flex;
    flex: 0 0 auto;
    align-items: center;
    gap: 0.35rem;
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
