<script lang="ts">
  import { onMount } from 'svelte';
  import TvPage from '../components/tv/TvPage.svelte';
  import TvHomeRow from '../components/tv/TvHomeRow.svelte';
  import TvRow from '../components/tv/TvRow.svelte';
  import TvCollectionTile from '../components/tv/TvCollectionTile.svelte';
  import TvShortcutTile from '../components/tv/TvShortcutTile.svelte';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { iconCalendar, iconFolder, iconShuffle } from '../components/icons';
  import { navigate } from '../stores/navigation';
  import { attachTvHomeCarouselScroll } from '../tv/carouselScroll';
  import { tvPosterThumbUrl } from '../platform/tv';
  import { loadOverviewData, type OverviewCacheData } from '../utils/overviewCache';
  import type { OverviewBanner } from '../utils/overview';
  import { headlineFromLoadError } from '../utils/content-load-error';
  import { showToast } from '../stores/toast';

  let data = $state<OverviewCacheData | null>(null);
  let loadState = $state<'loading' | 'error' | 'ready'>('loading');
  let errorMsg = $state('');
  let randomBusy = false;

  /** Внешние ссылки на TV открыть нечем — только в Big Picture (Electron). */
  const banners = $derived(
    (data?.banners ?? []).filter((b) => b.action.trim() && (b.type !== 2 || !!window.electron?.openExternal)),
  );

  async function load(force = false) {
    if (!data) loadState = 'loading';
    try {
      data = await loadOverviewData(force);
      loadState = 'ready';
    } catch (err) {
      errorMsg = headlineFromLoadError(err);
      loadState = 'error';
    }
  }

  function openBanner(banner: OverviewBanner) {
    const action = banner.action.trim();
    const id = parseInt(action, 10);
    if (banner.type === 2) {
      window.electron?.openExternal?.(action);
      return;
    }
    if (!id) return;
    navigate(banner.type === 3 ? `/collection/${id}` : `/release/${id}`);
  }

  async function openRandom() {
    if (!window.anixApi || randomBusy) return;
    randomBusy = true;
    try {
      const res = (await window.anixApi.release.random(true)) as { release?: { id?: number } } | null;
      if (res?.release?.id) navigate(`/release/${res.release.id}`);
      else showToast('Не удалось подобрать тайтл', 'err');
    } catch {
      showToast('Не удалось подобрать тайтл', 'err');
    } finally {
      randomBusy = false;
    }
  }

  onMount(() => {
    const detachCarouselScroll = attachTvHomeCarouselScroll();
    void load();
    return detachCarouselScroll;
  });
</script>

<TvPage title="Обзор" hideHead>
  <div class="tv-home tv-overview">
    <section class="tv-home__stage" aria-label="Обзор">
      <div class="tv-home__rails" data-tv-home-rails>
        {#if loadState === 'error'}
          <div class="tv-overview__error">
            <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void load(true)} />
          </div>
        {:else}
          <div class="tv-home__rows">
            {#if loadState === 'loading' || banners.length > 0}
              <TvRow id="overview-banners" label="Интересное" status={loadState === 'loading' ? 'loading' : 'ready'} count={banners.length}>
                {#each banners as banner (banner.id)}
                  <div class="uiv2-carousel__item">
                    <button type="button" class="tv-collection-tile tv-collection-tile--banner" onclick={() => openBanner(banner)}>
                      <span class="tv-collection-tile__cover">
                        {#if banner.image}
                          <img src={tvPosterThumbUrl(banner.image) ?? banner.image} alt="" loading="lazy" decoding="async" />
                        {/if}
                      </span>
                      <span class="tv-collection-tile__title">{banner.title || 'Подробнее'}</span>
                      {#if banner.description}
                        <span class="tv-collection-tile__desc">{banner.description}</span>
                      {/if}
                    </button>
                  </div>
                {/each}
              </TvRow>
            {/if}

            <TvRow id="overview-sections" label="Разделы" size="compact" count={3}>
              <div class="uiv2-carousel__item">
                <TvShortcutTile title="Расписание" sub="Выход серий по дням" icon={iconCalendar(40)} onclick={() => navigate('/schedule')} />
              </div>
              <div class="uiv2-carousel__item">
                <TvShortcutTile title="Коллекции" sub="Подборки от зрителей" icon={iconFolder(40)} onclick={() => navigate('/collections')} />
              </div>
              <div class="uiv2-carousel__item">
                <TvShortcutTile title="Случайное аниме" sub="Испытать удачу" icon={iconShuffle(40)} onclick={() => void openRandom()} />
              </div>
            </TvRow>

            <TvHomeRow
              label="Рекомендации"
              tabId="overview-recommendations"
              items={data?.recommendations ?? []}
              status={loadState === 'loading' ? 'loading' : (data?.recommendations.length ? 'ready' : 'empty')}
              showSeeAll={false}
            />
            <TvHomeRow
              label="Сейчас смотрят"
              tabId="overview-watching"
              items={data?.watching ?? []}
              status={loadState === 'loading' ? 'loading' : (data?.watching.length ? 'ready' : 'empty')}
              showSeeAll={false}
            />
            {#if loadState === 'loading' || (data?.discussing.length ?? 0) > 0}
              <TvHomeRow
                label="Обсуждают сегодня"
                tabId="overview-discussing"
                items={data?.discussing ?? []}
                status={loadState === 'loading' ? 'loading' : 'ready'}
                showSeeAll={false}
              />
            {/if}
            {#if loadState === 'loading' || (data?.collectionsWeek.length ?? 0) > 0}
              <TvRow
                id="overview-collections"
                label="Коллекции недели"
                status={loadState === 'loading' ? 'loading' : 'ready'}
                count={data?.collectionsWeek.length ?? 0}
              >
                {#each data?.collectionsWeek ?? [] as collection (collection.id)}
                  <div class="uiv2-carousel__item">
                    <TvCollectionTile data={collection} />
                  </div>
                {/each}
                <div class="uiv2-carousel__item">
                  <TvShortcutTile title="Все коллекции" icon={iconFolder(40)} onclick={() => navigate('/collections')} />
                </div>
              </TvRow>
            {/if}
          </div>
        {/if}
      </div>
    </section>
  </div>
</TvPage>
