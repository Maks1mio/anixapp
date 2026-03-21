<script lang="ts">
  import ReleaseCardV from "../components/ReleaseCardV.svelte";
  import { onMount, onDestroy } from 'svelte';
  import type { ReleaseCardData } from '../types/release';

  const POSTER_BASE = 'https://s.anixmirai.com/posters';

  function buildPosterUrl(value: string | undefined): string | undefined {
    if (!value || typeof value !== 'string') return undefined;
    const v = value.trim();
    if (!v) return undefined;
    if (v.startsWith('http://') || v.startsWith('https://')) return v;
    const id = v.endsWith('.jpg') || v.endsWith('.jpeg') || v.endsWith('.png') ? v : `${v}.jpg`;
    return `${POSTER_BASE}/${id}`;
  }

  function mapReleaseToCardData(raw: Record<string, unknown>): ReleaseCardData {
    const p = raw.poster as Record<string, { url?: string }> | undefined;
    const posterRaw = p?.original?.url ?? p?.medium?.url ?? p?.small?.url
      ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
      ?? (typeof raw.image === 'string' ? raw.image : undefined);
    const poster = posterRaw ? buildPosterUrl(posterRaw) : undefined;
    const grade = typeof raw.grade === 'number' ? raw.grade : undefined;
    const statusObj = raw.status as { name?: string } | undefined;
    const categoryObj = raw.category as { name?: string } | undefined;
    const profileListStatus = typeof raw.profile_list_status === 'number' ? raw.profile_list_status : undefined;
    let listStatus: ReleaseCardData['listStatus'];
    switch (profileListStatus) {
      case 1: listStatus = 'watching'; break;
      case 2: listStatus = 'planned'; break;
      case 3: listStatus = 'completed'; break;
      case 4: listStatus = 'on_hold'; break;
      case 5: listStatus = 'dropped'; break;
      default: listStatus = undefined;
    }
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
      listStatus,
    };
  }

  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let errorMsg = $state('');
  let items = $state<ReleaseCardData[]>([]);


  onMount(async () => {
    if (!window.anixApi) {
      errorMsg = 'API доступно только в Electron.';
      loadState = 'error';
      return;
    }

    try {
      const data = await window.anixApi.discover.recommendations(0) as any;
      const content = (data?.content ?? []) as Record<string, unknown>[];
      if (content.length > 0) {
        items = content.map(mapReleaseToCardData);
        loadState = 'ready';
        return;
      }
      loadState = 'empty';
    } catch (err) {
      errorMsg = String(err);
      loadState = 'error';
    }
  });
</script>

<div class="view view-catalog">
  <div class="view-header">
    <h1 class="view-header__title">Каталог</h1>
    <p class="view-header__subtitle">Релизы с описанием и рейтингом</p>
  </div>

  <div class="catalog-list">
    {#if loadState === 'loading'}
      <div class="catalog-loading">Загрузка…</div>
    {:else if loadState === 'error'}
      <p class="feed-error">Ошибка: {errorMsg}</p>
    {:else if loadState === 'empty'}
      <p class="feed-empty">Нет записей в каталоге.</p>
    {:else}
      <div class="bookmarks__grid">
        {#each items as item (item.id)}
          <ReleaseCardV data={item} />
        {/each}
      </div>
    {/if}
  </div>
</div>
