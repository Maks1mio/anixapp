<script lang="ts">
  import { onMount } from 'svelte';
  import { getApiBase } from '../../../services/anixback-endpoint';

  interface KitsuEpisode {
    number: number;
    title_en: string | null;
    title_ru: string | null;
    thumbnail: string | null;
    length: number | null;
    aired_at: string | null;
  }

  interface KitsuTitleData {
    anixart_id: number;
    kitsu_id: string;
    poster_url: string | null;
    cover_url: string | null;
    episodes: KitsuEpisode[];
    episode_count: number | null;
    translations_available: boolean;
    fetched_at: string;
  }

  interface Props {
    releaseId: number;
    titleEn?: string;
  }

  let { releaseId, titleEn = '' }: Props = $props();

  type LoadState = 'idle' | 'loading' | 'queued' | 'ready' | 'not_found' | 'error';

  let state = $state<LoadState>('idle');
  let data = $state<KitsuTitleData | null>(null);
  let queueStatus = $state<string>('pending');
  let expanded = $state(false);
  let showAll = $state(false);

  const PREVIEW_COUNT = 12;
  const visibleEpisodes = $derived(
    showAll ? (data?.episodes ?? []) : (data?.episodes ?? []).slice(0, PREVIEW_COUNT)
  );
  const hasMore = $derived((data?.episodes.length ?? 0) > PREVIEW_COUNT);

  async function load(): Promise<void> {
    state = 'loading';
    try {
      const res = await fetch(`${getApiBase()}/kitsu/${releaseId}`, {
        signal: AbortSignal.timeout(8_000),
      });
      if (!res.ok) { state = 'error'; return; }

      const body = await res.json() as {
        data?: KitsuTitleData;
        queued?: boolean;
        status?: string;
        notFound?: boolean;
      };

      if (body.data) {
        data = body.data;
        state = 'ready';
        expanded = true;
      } else if (body.queued) {
        queueStatus = body.status ?? 'pending';
        state = 'queued';
        // Poll once after 8s if running
        if (body.status === 'running' || body.status === 'pending') {
          setTimeout(() => { void load(); }, 8_000);
        }
      } else if (body.notFound) {
        // Auto-enqueue if we know the English title
        if (titleEn.trim()) {
          await triggerEnqueue();
        } else {
          state = 'not_found';
        }
      }
    } catch {
      state = 'error';
    }
  }

  async function triggerEnqueue(): Promise<void> {
    try {
      const res = await fetch(`${getApiBase()}/kitsu/enqueue`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ anixartId: releaseId, titleEn: titleEn.trim() }),
        signal: AbortSignal.timeout(8_000),
      });
      if (res.ok) {
        queueStatus = 'pending';
        state = 'queued';
        // Poll after 5s for quick titles, again after 30s
        setTimeout(() => { void load(); }, 5_000);
        setTimeout(() => { if (state === 'queued') void load(); }, 30_000);
      } else {
        state = 'not_found';
      }
    } catch {
      state = 'not_found';
    }
  }

  function formatDuration(mins: number | null): string {
    if (mins == null) return '';
    return `${mins} мин`;
  }

  function formatAirDate(iso: string | null): string {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric' });
    } catch { return iso; }
  }

  onMount(() => { void load(); });
</script>

{#if state === 'loading'}
  <!-- silent loading, no UI clutter -->

{:else if state === 'queued'}
  <div class="ke-queued">
    <span class="ke-queued__dot"></span>
    <span class="ke-queued__text">
      {queueStatus === 'running' ? 'Загружаем данные о сериях…' : 'Серии поставлены в очередь загрузки'}
    </span>
  </div>

{:else if state === 'ready' && data}
  <section class="ke-section">
    <button
      type="button"
      class="ke-section__head"
      onclick={() => { expanded = !expanded; }}
      aria-expanded={expanded}
    >
      <span class="ke-section__title">
        Серии
        {#if data.episode_count}
          <span class="ke-section__count">{data.episode_count}</span>
        {/if}
      </span>
      {#if data.translations_available}
        <span class="ke-badge ke-badge--ru">RU</span>
      {/if}
      <span class="ke-section__chevron" class:ke-section__chevron--up={expanded}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none">
          <path d="M6 9l6 6 6-6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
        </svg>
      </span>
    </button>

    {#if expanded && data.episodes.length > 0}
      <div class="ke-list">
        {#each visibleEpisodes as ep (ep.number)}
          <div class="ke-ep">
            {#if ep.thumbnail}
              <div class="ke-ep__thumb">
                <img src={ep.thumbnail} alt="Серия {ep.number}" loading="lazy" />
              </div>
            {:else}
              <div class="ke-ep__thumb ke-ep__thumb--empty">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                  <rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" stroke-width="1.5"/>
                  <path d="M10 9.5l5 3-5 3V9.5z" fill="currentColor"/>
                </svg>
              </div>
            {/if}
            <div class="ke-ep__info">
              <span class="ke-ep__num">Серия {ep.number}</span>
              {#if ep.title_ru}
                <span class="ke-ep__title">{ep.title_ru}</span>
              {:else if ep.title_en}
                <span class="ke-ep__title ke-ep__title--en">{ep.title_en}</span>
              {/if}
              <div class="ke-ep__meta">
                {#if ep.length}<span>{formatDuration(ep.length)}</span>{/if}
                {#if ep.aired_at}<span>{formatAirDate(ep.aired_at)}</span>{/if}
              </div>
            </div>
          </div>
        {/each}

        {#if hasMore && !showAll}
          <button
            type="button"
            class="ke-show-more"
            onclick={() => { showAll = true; }}
          >
            Показать все {data.episodes.length} серий
          </button>
        {/if}
      </div>
    {:else if expanded && data.episodes.length === 0}
      <p class="ke-empty">Данные о сериях недоступны</p>
    {/if}
  </section>
{/if}

<style lang="scss">
/* ── Queued indicator ── */
.ke-queued {
  display: inline-flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.45rem 0.85rem;
  border-radius: 999px;
  background: color-mix(in srgb, var(--uikit-v2-accent, #60a5fa) 10%, transparent);
  font-size: 0.8rem;
  color: var(--uikit-v2-accent, #60a5fa);
  margin: 0.5rem 0;
}

.ke-queued__dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: currentColor;
  flex-shrink: 0;
  animation: ke-pulse 1.4s ease-in-out infinite;
}

@keyframes ke-pulse {
  0%, 100% { opacity: 1; }
  50%       { opacity: 0.3; }
}

/* ── Section ── */
.ke-section {
  margin-top: 1.5rem;
  border-radius: 14px;
  border: 1px solid rgba(255,255,255,0.08);
  overflow: hidden;
  background: rgba(255,255,255,0.03);
}

.ke-section__head {
  display: flex;
  align-items: center;
  gap: 0.6rem;
  width: 100%;
  padding: 0.85rem 1.1rem;
  border: 0;
  background: transparent;
  color: inherit;
  font: inherit;
  cursor: pointer;
  text-align: left;
  transition: background 0.12s ease;

  &:hover { background: rgba(255,255,255,0.04); }
}

.ke-section__title {
  font-size: 1rem;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 0.45rem;
  flex: 1;
}

.ke-section__count {
  font-size: 0.78rem;
  font-weight: 500;
  color: rgba(255,255,255,0.5);
  background: rgba(255,255,255,0.08);
  padding: 0.1rem 0.45rem;
  border-radius: 999px;
}

.ke-badge {
  font-size: 0.65rem;
  font-weight: 700;
  letter-spacing: 0.05em;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;

  &--ru {
    background: rgba(96, 165, 250, 0.15);
    color: #60a5fa;
    border: 1px solid rgba(96, 165, 250, 0.25);
  }
}

.ke-section__chevron {
  color: rgba(255,255,255,0.4);
  flex-shrink: 0;
  transition: transform 0.2s ease;
  display: flex;

  &--up { transform: rotate(180deg); }
}

/* ── Episode list ── */
.ke-list {
  border-top: 1px solid rgba(255,255,255,0.06);
  max-height: 60vh;
  overflow-y: auto;
}

.ke-ep {
  display: flex;
  align-items: flex-start;
  gap: 0.85rem;
  padding: 0.65rem 1.1rem;
  border-bottom: 1px solid rgba(255,255,255,0.05);
  transition: background 0.1s ease;

  &:last-child { border-bottom: none; }
  &:hover { background: rgba(255,255,255,0.04); }
}

.ke-ep__thumb {
  width: 6.5rem;
  aspect-ratio: 16/9;
  border-radius: 8px;
  overflow: hidden;
  background: rgba(255,255,255,0.06);
  flex-shrink: 0;

  img {
    width: 100%;
    height: 100%;
    object-fit: cover;
  }

  &--empty {
    display: flex;
    align-items: center;
    justify-content: center;
    color: rgba(255,255,255,0.2);
  }
}

.ke-ep__info {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  min-width: 0;
  padding-top: 0.1rem;
}

.ke-ep__num {
  font-size: 0.72rem;
  font-weight: 700;
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(255,255,255,0.45);
}

.ke-ep__title {
  font-size: 0.875rem;
  font-weight: 500;
  line-height: 1.4;
  color: rgba(255,255,255,0.9);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;

  &--en { color: rgba(255,255,255,0.6); font-style: italic; }
}

.ke-ep__meta {
  display: flex;
  gap: 0.75rem;
  font-size: 0.72rem;
  color: rgba(255,255,255,0.35);
  margin-top: 0.1rem;
}

/* ── Show more ── */
.ke-show-more {
  display: flex;
  width: 100%;
  align-items: center;
  justify-content: center;
  padding: 0.75rem;
  border: 0;
  background: transparent;
  color: rgba(255,255,255,0.5);
  font: inherit;
  font-size: 0.8rem;
  cursor: pointer;
  transition: color 0.12s ease;

  &:hover { color: rgba(255,255,255,0.85); }
}

/* ── Empty ── */
.ke-empty {
  margin: 0;
  padding: 1rem 1.1rem;
  font-size: 0.875rem;
  color: rgba(255,255,255,0.4);
}
</style>
