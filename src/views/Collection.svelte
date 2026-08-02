<script lang="ts">
  import ReleaseCardsGrid from '../components/ReleaseCardsGrid.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { iconPencil, iconLock, iconTrash2 } from '../components/icons';
  import { navigate } from '../stores/navigation';
  import { requireAuth } from '../stores/auth';
  import { handleUserProfileClick } from '../stores/user-profile';
  import { showToast } from '../stores/toast';
  import { COLLECTION_DELETE_ERROR_MESSAGES } from '../utils/collection';
  import { setDiscordContext, refreshDiscordPresence } from '../services/discord-presence';
  import { ensureProfileId } from '../utils/profile';
  import type { ReleaseCardData } from '../types/release';
  import { buildPosterUrl } from '../utils/posterUrl';
  import { notifyBookmarksChanged } from '../utils/favorites-events';

  interface Props {
    id: number;
  }

  let { id }: Props = $props();

  function formatDate(ts: number): string {
    const date = new Date(ts * 1000);
    const day = date.getDate();
    const months = 'янв. февр. мар. апр. май июн. июл. авг. сен. окт. нояб. дек.'.split(' ');
    const month = months[date.getMonth()];
    const h = date.getHours();
    const m = date.getMinutes();
    return `${day} ${month} в ${h.toString().padStart(2,'0')}:${m.toString().padStart(2,'0')}`;
  }

  function mapReleaseToCardData(raw: Record<string, unknown>): ReleaseCardData {
    const p = raw.poster as Record<string, { url?: string }> | undefined;
    const posterRaw = p?.original?.url ?? p?.medium?.url ?? p?.small?.url
      ?? (typeof raw.poster === 'string' ? raw.poster : undefined)
      ?? (typeof raw.image === 'string' ? raw.image : undefined);
    const poster = posterRaw ? buildPosterUrl(posterRaw) || undefined : undefined;
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

  const STATUS_COLORS = {
    watching: '#22c55e',
    planned: '#a855f7',
    completed: '#3b82f6',
    on_hold: '#eab308',
    dropped: '#ef4444',
  };

  // State
  let loadState = $state<'loading' | 'error' | 'ready'>('loading');
  let errorMsg = $state('');

  // Collection info
  let collectionTitle = $state('');
  let collectionDesc = $state('');
  let collectionImage = $state('');
  let lastUpdateDate = $state(0);
  let totalReleases = $state(0);
  let isFavorite = $state(false);
  let favoritesCount = $state(0);

  let authorId = $state<number | null>(null);
  let authorName = $state('');
  let authorAvatar = $state('');
  let isOwner = $state(false);
  let isPrivate = $state(false);
  let isDeleting = $state(false);

  let watchingCount = $state(0);
  let planCount = $state(0);
  let completedCount = $state(0);
  let holdOnCount = $state(0);
  let droppedCount = $state(0);
  let statusSum = $derived(watchingCount + planCount + completedCount + holdOnCount + droppedCount);

  // Releases
  let releaseItems = $state<ReleaseCardData[]>([]);
  let nextPage = $state(1);
  let hasMore = $state(false);
  let isLoadingMore = $state(false);
  let showEnd = $state(false);
  let wrapEl: HTMLElement | undefined = $state();


  async function loadMore() {
    if (!hasMore || isLoadingMore || !window.anixApi) return;
    isLoadingMore = true;
    try {
      const res = await window.anixApi.collection.getReleases(id, nextPage) as any;
      let content = res?.content ?? res?.releases;
      if (content && !Array.isArray(content) && Array.isArray((content as any).releases)) content = (content as any).releases;
      const rawList = Array.isArray(content) ? content : [];
      const list = rawList.filter((item: any) => {
        if (!item || typeof item.id !== 'number') return false;
        if (item.release_count != null && !item.title_ru && !item.title_original) return false;
        return item.title_ru != null || item.title_original != null;
      });
      releaseItems = [...releaseItems, ...list.map((raw: any) => mapReleaseToCardData(raw as Record<string, unknown>))];
      nextPage += 1;
      hasMore = list.length > 0 && releaseItems.length < totalReleases;
      showEnd = !hasMore;
    } catch { /* ignore */ } finally {
      isLoadingMore = false;
    }
  }

  function attachScroll() {
    const scrollEl = wrapEl?.closest('.page__scroll') as HTMLElement | null;
    if (!scrollEl) return;
    scrollEl.addEventListener('scroll', () => {
      if (!hasMore || isLoadingMore) return;
      const distance = scrollEl.scrollHeight - scrollEl.scrollTop - scrollEl.clientHeight;
      if (distance < 300) loadMore();
    });
    requestAnimationFrame(() => {
      if (!hasMore || isLoadingMore) return;
      if (scrollEl.scrollHeight <= scrollEl.clientHeight + 50) loadMore();
    });
  }

  function onLayoutChanged() {
    releaseItems = [...releaseItems];
  }

  async function toggleBookmark() {
    if (!requireAuth()) return;
    if (!window.anixApi) return;
    try {
      if (isFavorite) {
        await window.anixApi.collection.removeFavorite(id);
      } else {
        await window.anixApi.collection.addFavorite(id);
      }
      isFavorite = !isFavorite;
      notifyBookmarksChanged({ kind: 'collections' });
    } catch { /* ignore */ }
  }

  async function openRandom() {
    if (!window.anixApi) return;
    try {
      const res = await window.anixApi.collection.getRandomRelease(id) as any;
      const rid = res?.release?.id;
      if (rid) navigate(`/release/${rid}`);
    } catch { /* ignore */ }
  }

  async function deleteCollection() {
    if (!window.anixApi || isDeleting) return;
    if (!window.confirm('Удалить коллекцию? Это действие нельзя отменить.')) return;
    isDeleting = true;
    try {
      const res = await window.anixApi.collectionMy.delete(id) as { code?: number };
      const code = res?.code ?? -1;
      if (code !== 0 && code !== 4) {
        showToast(COLLECTION_DELETE_ERROR_MESSAGES[code] ?? 'Не удалось удалить коллекцию', 'err');
        return;
      }
      showToast('Коллекция удалена');
      navigate('/collections/my');
    } catch (err) {
      showToast(String(err), 'err');
    } finally {
      isDeleting = false;
    }
  }

  onMount(async () => {
    if (!window.anixApi) {
      errorMsg = 'API недоступно.';
      loadState = 'error';
      return;
    }

    try {
      const [infoRes, releasesRes] = await Promise.all([
        window.anixApi.collection.info(id),
        window.anixApi.collection.getReleases(id, 0),
      ]) as any[];

      const info = infoRes?.collection ?? infoRes;
      const code = infoRes?.code;
      if ((code !== 0 && code !== undefined) || !info) {
        errorMsg = code !== 0 ? 'Коллекция недоступна или удалена.' : 'Коллекция не найдена.';
        loadState = 'error';
        return;
      }

      const creator = info.creator || {};
      authorId = creator.id ?? creator['@id'] ?? null;
      authorName = creator.nickname ?? creator.username ?? creator.login ?? (creator as any).name ?? 'Пользователь';
      authorAvatar = creator.avatar ?? '';
      const selfId = await ensureProfileId();
      isOwner = selfId != null && authorId === selfId;

      collectionTitle = info.title || 'Без названия';
      collectionDesc = info.description || '';
      collectionImage = info.image || '';
      isPrivate = !!(info.is_private ?? info.isPrivate);
      lastUpdateDate = info.last_update_date ?? info.creation_date ?? 0;
      favoritesCount = info.favorites_count ?? 0;
      isFavorite = !!(info.is_favorite ?? infoRes?.is_favorite);

      watchingCount = infoRes?.watching_count ?? 0;
      planCount = infoRes?.plan_count ?? 0;
      completedCount = infoRes?.completed_count ?? 0;
      holdOnCount = infoRes?.hold_on_count ?? 0;
      droppedCount = infoRes?.dropped_count ?? 0;

      const totalFromApi = releasesRes?.total_count;
      totalReleases = typeof totalFromApi === 'number' && totalFromApi >= 0
        ? totalFromApi
        : statusSum || (info.releases?.length ?? 0);

      let content = releasesRes?.content ?? releasesRes?.releases;
      if (content && !Array.isArray(content) && Array.isArray((content as any).releases)) content = (content as any).releases;
      const rawList = Array.isArray(content) ? content : [];
      const list = rawList.filter((item: any) => {
        if (!item || typeof item.id !== 'number') return false;
        if (item.release_count != null && !item.title_ru && !item.title_original) return false;
        return item.title_ru != null || item.title_original != null;
      });
      releaseItems = list.map((raw: any) => mapReleaseToCardData(raw as Record<string, unknown>));
      hasMore = (typeof totalFromApi === 'number' ? totalFromApi : totalReleases) > list.length;

      setDiscordContext({
        collectionTitle: collectionTitle,
        collectionImage: collectionImage ? buildPosterUrl(collectionImage) : undefined,
      });
      refreshDiscordPresence();

      loadState = 'ready';
      requestAnimationFrame(attachScroll);
    } catch {
      errorMsg = 'Ошибка загрузки.';
      loadState = 'error';
    }

    window.addEventListener('anix:cardLayoutChanged', onLayoutChanged);
  });

  onDestroy(() => {
    window.removeEventListener('anix:cardLayoutChanged', onLayoutChanged);
  });
</script>

<div class="view view-collection" bind:this={wrapEl}>
  <div class="collection-page">
    {#if loadState === 'loading'}
      <div class="collection-page__head">
        <div class="collection-page__loading">Загрузка…</div>
      </div>
    {:else if loadState === 'error'}
      <div class="collection-page__head">
        <div class="collection-page__loading">{errorMsg}</div>
      </div>
    {:else}
      <div class="collection-page__body">
        <!-- Banner -->
        <div class="collection-banner">
          {#if collectionImage}
            <img src={buildPosterUrl(collectionImage)} alt="" loading="eager" />
          {:else}
            <div class="collection-banner__placeholder"></div>
          {/if}
        </div>

        <!-- Info -->
        <div class="collection-info">
          <div class="collection-info__title-row">
            <h1 class="collection-info__title">{collectionTitle}</h1>
            <div class="collection-header__author">
              <span class="collection-header__author-label">Автор коллекции</span>
              <button
                type="button"
                class="collection-header__author-link"
                onclick={(event) => { if (authorId) handleUserProfileClick(authorId, event); }}
              >
                <span
                  class="collection-header__author-avatar{authorAvatar ? ' collection-header__author-avatar--img' : ''}"
                  style={authorAvatar ? `background-image:url('${buildPosterUrl(authorAvatar)}')` : ''}
                ></span>
                <span class="collection-header__author-name">{authorName}</span>
              </button>
            </div>
          </div>
          <p class="collection-info__date">{lastUpdateDate ? formatDate(lastUpdateDate) : ''}</p>
          <div class="collection-info__actions">
            <button
              type="button"
              class="collection-info__action collection-info__action--bookmark{isFavorite ? ' collection-info__action--active' : ''}"
              onclick={toggleBookmark}
            >
              <span class="collection-info__action-count">{favoritesCount}</span>
              <span class="collection-info__action-icon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill={isFavorite ? 'currentColor' : 'none'} stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z"/><line x1="4" y1="22" x2="4" y2="15"/></svg>
              </span>
              <span class="collection-info__action-label">{isFavorite ? 'В закладках' : 'Добавить в закладки'}</span>
            </button>
          </div>
        </div>

        <!-- Description -->
        {#if collectionDesc}
          <div class="collection-desc">
            <div class="collection-desc__text">{collectionDesc}</div>
          </div>
        {/if}

        {#if isOwner && isPrivate}
          <div class="collection-private-notice" role="status">
            <span class="collection-private-notice__icon" aria-hidden="true">{@html iconLock(18)}</span>
            <p class="collection-private-notice__text">
              Это закрытая коллекция, доступ к ней имеете только Вы.
            </p>
          </div>
        {/if}

        {#if isOwner}
          <div class="collection-owner-actions">
            <button
              type="button"
              class="collection-owner-actions__btn"
              onclick={() => navigate(`/collections/edit/${id}`)}
            >
              <span class="collection-owner-actions__icon">{@html iconPencil(18)}</span>
              <span>Редактировать</span>
            </button>
            <button
              type="button"
              class="collection-owner-actions__btn collection-owner-actions__btn--danger"
              disabled={isDeleting}
              onclick={deleteCollection}
            >
              <span class="collection-owner-actions__icon">{@html iconTrash2(18)}</span>
              <span>{isDeleting ? 'Удаление…' : 'Удалить'}</span>
            </button>
          </div>
        {/if}

        <!-- Stats -->
        <section class="collection-stats">
          <h2 class="collection-stats__title">{totalReleases} релизов в коллекции</h2>
          {#if statusSum > 0}
            <div class="collection-stats__bar-wrap">
              <div class="collection-stats__bar">
                {#each [
                  { v: watchingCount, c: STATUS_COLORS.watching },
                  { v: planCount, c: STATUS_COLORS.planned },
                  { v: completedCount, c: STATUS_COLORS.completed },
                  { v: holdOnCount, c: STATUS_COLORS.on_hold },
                  { v: droppedCount, c: STATUS_COLORS.dropped },
                ] as part}
                  {#if part.v > 0}
                    <span style="width:{(100 * part.v) / statusSum}%;background:{part.c}"></span>
                  {/if}
                {/each}
              </div>
            </div>
            <div class="collection-stats__legend">
              {#each [
                { label: 'Смотрю', count: watchingCount, c: STATUS_COLORS.watching },
                { label: 'В планах', count: planCount, c: STATUS_COLORS.planned },
                { label: 'Просмотрено', count: completedCount, c: STATUS_COLORS.completed },
                { label: 'Отложено', count: holdOnCount, c: STATUS_COLORS.on_hold },
                { label: 'Брошено', count: droppedCount, c: STATUS_COLORS.dropped },
              ] as leg}
                <span class="collection-stats__legend-item"><i style="background:{leg.c}"></i>{leg.label} {leg.count}</span>
              {/each}
            </div>
          {/if}
          <button type="button" class="collection-stats__random" onclick={openRandom}>
            <span class="collection-stats__random-icon">↻</span>
            Открыть случайный
          </button>
        </section>

        <!-- Releases -->
        <div class="collection-releases">
          {#if releaseItems.length === 0 && !hasMore}
            <div class="collection-releases__loading">Нет релизов в коллекции.</div>
          {:else}
            <ReleaseCardsGrid items={releaseItems} className="collection-releases__grid" />
            {#if isLoadingMore}
              <div class="collection-releases__more">Загрузка…</div>
            {:else if showEnd}
              <div class="collection-releases__more">это всё :)</div>
            {/if}
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>
