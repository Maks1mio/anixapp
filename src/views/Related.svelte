<script lang="ts">
  import ReleaseCardV from "../components/ReleaseCardV.svelte";
  import { onMount } from 'svelte';
  import { buildPosterUrl } from '../utils/posterUrl';
  import type { ReleaseCardData } from '../types/release';

  interface Props {
    id: number;
  }

  let { id }: Props = $props();

  function mapReleaseToCardData(raw: Record<string, unknown>): ReleaseCardData {
    const p = raw.poster as Record<string, { url?: string }> | undefined;
    const posterRaw = p?.original?.url ?? p?.medium?.url ?? p?.small?.url
      ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
      ?? (typeof raw.image === 'string' ? raw.image : undefined);
    const poster = posterRaw ? buildPosterUrl(posterRaw) : undefined;
    const grade = typeof raw.grade === 'number' ? raw.grade : undefined;
    const statusObj = raw.status as { name?: string } | undefined;
    const categoryObj = raw.category as { name?: string } | undefined;
    return {
      id: raw.id as number | undefined,
      titleRu: (raw.title_ru ?? raw.titleRu) as string | undefined,
      titleEn: (raw.title_original ?? raw.titleEn) as string | undefined,
      titleAlt: (raw.title_alt as string) || undefined,
      description: (raw.description as string) || undefined,
      poster: poster || undefined,
      rating: grade,
      voteCount: typeof raw.vote_count === 'number' ? raw.vote_count : undefined,
      episodesReleased: typeof raw.episodes_released === 'number' ? raw.episodes_released : undefined,
      episodesTotal: typeof raw.episodes_total === 'number' ? raw.episodes_total : undefined,
      year: typeof raw.year === 'string' ? raw.year : (typeof raw.year === 'number' ? String(raw.year) : undefined),
      country: (raw.country as string) || undefined,
      genres: (raw.genres as string) || undefined,
      status: statusObj?.name,
      studio: (raw.studio as string) || undefined,
      category: categoryObj?.name,
      releaseDate: (raw.release_date as string) || undefined,
      isFavorite: !!(raw.is_favorite),
      listStatus: undefined,
    };
  }

  let items = $state<ReleaseCardData[]>([]);
  let page = $state(0);
  let loading = $state(false);
  let hasMore = $state(true);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let wrapEl: HTMLElement | undefined = $state();

  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;


  async function loadPage() {
    if (loading || !hasMore) return;
    loading = true;
    if (page === 0) loadState = 'loading';

    try {
      const data = await window.anixApi!.release.related(id, page) as any;
      const content = (data?.content ?? []) as any[];

      if (!content.length) {
        if (page === 0) loadState = 'empty';
        hasMore = false;
        loading = false;
        return;
      }

      items = [...items, ...content.map((raw: any) => mapReleaseToCardData(raw as Record<string, unknown>))];
      page += 1;
      hasMore = !!content.length;
      loadState = 'ready';
    } catch (err) {
      errorMsg = String(err);
      loadState = 'error';
    } finally {
      loading = false;
    }
  }

  function attachScroll() {
    const el = wrapEl?.closest('.page__scroll') as HTMLElement | null;
    if (!el) return;
    scrollEl = el;
    scrollListener = () => {
      if (!hasMore || loading) return;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance < 200) loadPage();
    };
    el.addEventListener('scroll', scrollListener);
  }

  onMount(() => {
    if (!window.anixApi) {
      errorMsg = 'API доступно только в приложении.';
      loadState = 'error';
      return;
    }
    loadPage();
    requestAnimationFrame(attachScroll);
  });
</script>

<div class="view view-related" bind:this={wrapEl}>
  <div class="view-header">
    <h1 class="view-header__title">Связанные релизы</h1>
    <p class="view-header__subtitle">Франшиза и спин-оффы</p>
  </div>

  <div class="related__content">
    <div class="related__list">
      {#if loadState === 'loading'}
        <div class="related__loading">Загрузка…</div>
      {:else if loadState === 'error'}
        <p class="related__error">Ошибка загрузки: {errorMsg}</p>
      {:else if loadState === 'empty'}
        <p class="related__empty">Связанных релизов не найдено.</p>
      {:else}
        {#each items as item (item.id)}
          <div class="related__item">
            <ReleaseCardV data={item} />
          </div>
        {/each}
        {#if loading}
          <div class="related__loading">Загрузка…</div>
        {/if}
      {/if}
    </div>
  </div>
</div>
