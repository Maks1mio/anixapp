<script lang="ts">
  import { onMount } from 'svelte';
  import TvPage from '../components/tv/TvPage.svelte';
  import TvReleaseGrid from '../components/tv/TvReleaseGrid.svelte';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { iconBookmark, iconShuffle, iconUser } from '../components/icons';
  import { navigate } from '../stores/navigation';
  import { requireAuth } from '../stores/auth';
  import { showToast } from '../stores/toast';
  import { tvPosterThumbUrl } from '../platform/tv';
  import { buildPosterUrl } from '../utils/posterUrl';
  import { mapReleaseRawToCard } from '../utils/release-card';
  import { notifyBookmarksChanged } from '../utils/favorites-events';
  import { headlineFromLoadError } from '../utils/content-load-error';

  interface Props {
    id: number;
  }

  let { id }: Props = $props();

  let loadState = $state<'loading' | 'error' | 'ready'>('loading');
  let errorMsg = $state('');
  let title = $state('');
  let description = $state('');
  let image = $state('');
  let authorId = $state<number | null>(null);
  let authorName = $state('');
  let total = $state(0);
  let favoritesCount = $state(0);
  let isFavorite = $state(false);
  let favBusy = $state(false);
  let randomBusy = false;

  const cover = $derived(image ? tvPosterThumbUrl(buildPosterUrl(image) || image) ?? '' : '');
  const subtitle = $derived(
    [total > 0 ? `${total.toLocaleString('ru-RU')} тайтлов` : '', authorName ? `автор ${authorName}` : '']
      .filter(Boolean)
      .join(' · '),
  );

  async function loadInfo() {
    if (!window.anixApi) {
      errorMsg = 'API недоступно';
      loadState = 'error';
      return;
    }
    loadState = 'loading';
    try {
      const res = (await window.anixApi.collection.info(id)) as Record<string, any>;
      const info = res?.collection ?? res;
      if ((res?.code !== 0 && res?.code !== undefined) || !info) {
        errorMsg = 'Коллекция недоступна или удалена.';
        loadState = 'error';
        return;
      }
      const creator = info.creator || {};
      authorId = Number(creator.id ?? 0) || null;
      authorName = creator.login ?? creator.nickname ?? creator.username ?? '';
      title = info.title || 'Без названия';
      description = info.description || '';
      image = info.image || '';
      favoritesCount = Number(info.favorites_count ?? 0);
      isFavorite = !!(info.is_favorite ?? res?.is_favorite);
      loadState = 'ready';
    } catch (err) {
      errorMsg = headlineFromLoadError(err);
      loadState = 'error';
    }
  }

  async function fetchReleases(page: number) {
    const res = (await window.anixApi.collection.getReleases(id, page)) as Record<string, any>;
    if (page === 0 && typeof res?.total_count === 'number') total = res.total_count;
    let content = res?.content ?? res?.releases;
    if (content && !Array.isArray(content) && Array.isArray(content.releases)) content = content.releases;
    const list = (Array.isArray(content) ? content : []).filter(
      (raw: any) => raw && typeof raw.id === 'number' && (raw.title_ru != null || raw.title_original != null),
    );
    return { items: list.map((raw: any) => mapReleaseRawToCard(raw)), done: list.length === 0 };
  }

  async function toggleFavorite() {
    if (favBusy || !requireAuth()) return;
    favBusy = true;
    const next = !isFavorite;
    try {
      if (next) await window.anixApi.collection.addFavorite(id);
      else await window.anixApi.collection.removeFavorite(id);
      isFavorite = next;
      favoritesCount = Math.max(0, favoritesCount + (next ? 1 : -1));
      notifyBookmarksChanged({ kind: 'collections' });
    } catch {
      showToast('Не удалось обновить закладки', 'err');
    } finally {
      favBusy = false;
    }
  }

  async function openRandom() {
    if (randomBusy) return;
    randomBusy = true;
    try {
      const res = (await window.anixApi.collection.getRandomRelease(id)) as { release?: { id?: number } } | null;
      if (res?.release?.id) navigate(`/release/${res.release.id}`);
    } catch {
      showToast('Не удалось выбрать тайтл', 'err');
    } finally {
      randomBusy = false;
    }
  }

  onMount(() => void loadInfo());
</script>

<TvPage title={title || 'Коллекция'} hideHead>
  <div class="tv-detail">
    {#if loadState === 'error'}
      <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void loadInfo()} />
    {:else}
      <header class="tv-detail__hero" class:tv-detail__hero--loading={loadState === 'loading'}>
        {#if cover}
          <img class="tv-detail__cover" src={cover} alt="" decoding="async" />
        {/if}
        <div class="tv-detail__info">
          <p class="tv-detail__kicker">Коллекция</p>
          <h1 class="tv-detail__title">{title || ' '}</h1>
          {#if subtitle}<p class="tv-detail__sub">{subtitle}</p>{/if}
          {#if description}<p class="tv-detail__desc">{description}</p>{/if}
          <div class="tv-detail__actions">
            <button type="button" class="tv-action tv-action--primary" data-tv-autofocus onclick={() => void openRandom()} disabled={loadState !== 'ready'}>
              <span class="tv-action__icon" aria-hidden="true">{@html iconShuffle(26)}</span>
              Случайный тайтл
            </button>
            <button
              type="button"
              class="tv-action"
              class:tv-action--on={isFavorite}
              onclick={() => void toggleFavorite()}
              disabled={loadState !== 'ready' || favBusy}
            >
              <span class="tv-action__icon" aria-hidden="true">{@html iconBookmark(26)}</span>
              {isFavorite ? 'В закладках' : 'В закладки'}
              {#if favoritesCount > 0}<span class="tv-action__count">{favoritesCount.toLocaleString('ru-RU')}</span>{/if}
            </button>
            {#if authorId}
              <button type="button" class="tv-action" onclick={() => navigate(`/profile/${authorId}`)}>
                <span class="tv-action__icon" aria-hidden="true">{@html iconUser(26)}</span>
                Автор
              </button>
            {/if}
          </div>
        </div>
      </header>

      <TvReleaseGrid fetchPage={fetchReleases} emptyText="В коллекции пока нет тайтлов." />
    {/if}
  </div>
</TvPage>
