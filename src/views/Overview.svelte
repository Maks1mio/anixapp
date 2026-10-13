<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { navigate } from '../stores/navigation';
  import { isMobileMode } from '../platform/mobile';
  import { iconFolder, iconFlame, iconCalendar, iconSlidersHorizontal, iconShuffle } from '../components/icons';
  import OverviewSteamCarousel from '../components/overview/OverviewSteamCarousel.svelte';
  import OverviewSectionHeader from '../components/overview/OverviewSectionHeader.svelte';
  import OverviewReleaseCarousel from '../components/overview/OverviewReleaseCarousel.svelte';
  import OverviewDiscussList from '../components/overview/OverviewDiscussList.svelte';
  import OverviewCollectionsWeek from '../components/overview/OverviewCollectionsWeek.svelte';
  import OverviewCommentsWeek from '../components/overview/OverviewCommentsWeek.svelte';
  import OverviewSkeleton from '../components/overview/OverviewSkeleton.svelte';
  import UiV2ContentRetryOverlay from '../components/uikit-v2/UiV2ContentRetryOverlay.svelte';
  import { headlineFromLoadError } from '../utils/content-load-error';
  import { mapCardData } from './Release/_utils';
  import {
    mapOverviewBanner,
    mapOverviewCollection,
    mapOverviewCommentWeek,
    mapOverviewDiscuss,
    type OverviewBanner,
    type OverviewCommentWeekItem,
    type OverviewDiscussItem,
  } from '../utils/overview';
  import {
    getOverviewCache,
    getOverviewInflight,
    setOverviewCache,
    setOverviewInflight,
    type OverviewCacheData,
    type OverviewCachePayload,
  } from '../utils/overviewCache';
  import {
    fetchOverviewOverrides,
    pruneOverviewStaleOverrides,
    type OverviewOverride,
  } from '../services/overview-overrides';
  import type { ReleaseCardData } from '../types/release';
  import type { CollectionCardData } from '../components/CollectionCard.svelte';
  import {
    buildViewStateKey,
    getViewState,
    saveViewStateWithScroll,
    restoreScrollTop,
    registerActiveScrollKey,
    flushActiveViewState,
    saveViewStateData,
    beginScrollRestore,
    logViewStateRestore,
  } from '../stores/view-state';

  type LoadState = 'loading' | 'ready' | 'error';

  interface OverviewUiState {
    steamActiveIndex: number;
    carouselScroll: Partial<Record<'recommendations' | 'watching', number>>;
  }

  const OVERVIEW_UI_KEY = () => buildViewStateKey('/overview');

  const DISCOVER_TIMEOUT_MS = 8_000;

  let loadState = $state<LoadState>('loading');
  let errorMsg = $state('');

  let banners = $state<OverviewBanner[]>([]);
  let recommendations = $state<ReleaseCardData[]>([]);
  let watching = $state<ReleaseCardData[]>([]);
  let discussing = $state<OverviewDiscussItem[]>([]);
  let collectionsWeek = $state<CollectionCardData[]>([]);
  let commentsWeek = $state<OverviewCommentWeekItem[]>([]);
  let heroOverrides = $state<OverviewOverride[]>([]);
  let steamActiveIndex = $state(0);
  let carouselScroll = $state<Partial<Record<'recommendations' | 'watching', number>>>({});
  let pendingScrollTop = $state(0);
  let unregisterScrollKey: (() => void) | null = null;

  function overviewUiSnapshot(): OverviewUiState {
    return { steamActiveIndex, carouselScroll };
  }

  function onBeforeNavigate() {
    if (loadState === 'ready') flushActiveViewState(overviewUiSnapshot());
  }

  function applyCache(data: OverviewCacheData) {
    banners = data.banners;
    recommendations = data.recommendations;
    watching = data.watching;
    discussing = data.discussing;
    collectionsWeek = data.collectionsWeek;
    commentsWeek = data.commentsWeek;
    loadState = 'ready';
    errorMsg = '';
    if (pendingScrollTop > 0) {
      const top = pendingScrollTop;
      pendingScrollTop = 0;
      beginScrollRestore();
      requestAnimationFrame(() => {
        void restoreScrollTop(top, { maxWaitMs: 8000 });
      });
    }
  }

  function mapReleaseList(data: { content?: unknown[] } | null | undefined): ReleaseCardData[] {
    return (data?.content ?? [])
      .filter((raw): raw is Record<string, unknown> => !!raw && typeof raw === 'object')
      .map((raw) => mapCardData(raw));
  }

  function withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    return Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        setTimeout(() => reject(new Error(`${label}: timeout`)), DISCOVER_TIMEOUT_MS);
      }),
    ]);
  }

  async function fetchOverviewPayload(): Promise<OverviewCachePayload> {
    if (!window.anixApi?.discover) {
      throw new Error('API недоступен');
    }

    const api = window.anixApi.discover;
    const results = await Promise.allSettled([
      withTimeout(api.interesting(), 'interesting'),
      withTimeout(api.recommendations(-1, -1), 'recommendations'),
      withTimeout(api.watching(0), 'watching'),
      withTimeout(api.discussing(), 'discussing'),
      withTimeout(api.collectionsWeek(-1, -1), 'collectionsWeek'),
      withTimeout(api.commentsWeek(), 'commentsWeek'),
    ]);

    return {
      banners: results[0].status === 'fulfilled'
        ? (results[0].value.content ?? [])
            .map((raw) => mapOverviewBanner(raw as Record<string, unknown>))
            .filter((b): b is OverviewBanner => b != null)
        : [],
      recommendations: results[1].status === 'fulfilled' ? mapReleaseList(results[1].value) : [],
      watching: results[2].status === 'fulfilled' ? mapReleaseList(results[2].value) : [],
      discussing: results[3].status === 'fulfilled'
        ? (results[3].value.content ?? []).map((raw) => mapOverviewDiscuss(raw as Record<string, unknown>))
        : [],
      collectionsWeek: results[4].status === 'fulfilled'
        ? (results[4].value.content ?? []).map((raw) => mapOverviewCollection(raw as Record<string, unknown>))
        : [],
      commentsWeek: results[5].status === 'fulfilled'
        ? (results[5].value.content ?? [])
            .map((raw) =>
              mapOverviewCommentWeek(raw as Record<string, unknown>, results[5].value),
            )
            .filter((c): c is OverviewCommentWeekItem => c != null)
        : [],
    };
  }

  async function loadHeroOverrides(bannerList: OverviewBanner[] = banners) {
    try {
      const bannerIds = bannerList.map((b) => b.id).filter((id) => id > 0);
      if (bannerIds.length > 0) {
        await pruneOverviewStaleOverrides(bannerIds);
      }
      const keep = new Set(bannerIds);
      const rows = await fetchOverviewOverrides();
      heroOverrides = rows.filter((o) => keep.has(o.bannerId));
    } catch {
      heroOverrides = [];
    }
  }

  async function loadOverview(force = false) {
    if (!force) {
      const cached = getOverviewCache();
      if (cached) {
        applyCache(cached);
        void loadHeroOverrides(cached.banners);
        return;
      }

      const pending = getOverviewInflight();
      if (pending) {
        try {
          applyCache(await pending);
          void loadHeroOverrides();
        } catch (err) {
          errorMsg = headlineFromLoadError(err);
          loadState = 'error';
        }
        return;
      }
    }

    if (loadState !== 'error') loadState = 'loading';

    const request = fetchOverviewPayload()
      .then((payload) => setOverviewCache(payload))
      .finally(() => setOverviewInflight(null));

    setOverviewInflight(request);

    try {
      const data = await request;
      applyCache(data);
      void loadHeroOverrides(data.banners);
    } catch (err) {
      errorMsg = headlineFromLoadError(err);
      loadState = 'error';
    }
  }

  const mobile = isMobileMode();
  let randomBusy = false;
  async function openRandom() {
    if (!window.anixApi || randomBusy) return;
    randomBusy = true;
    try {
      const data = (await window.anixApi.release.random(true)) as { release?: { id?: number } } | null;
      if (data?.release?.id) navigate(`/release/${data.release.id}`);
    } catch { /* ignore */ } finally { randomBusy = false; }
  }
  function openBanner(b: OverviewBanner) {
    const m = /(\d+)/.exec(b.action || '');
    if (m && b.type === 1) navigate(`/release/${m[1]}`);
    else if (m) navigate(`/release/${m[1]}`);
  }
  const QUICK = [
    { label: 'Популярное', icon: iconFlame, go: () => navigate('/overview/popular') },
    { label: 'Расписание', icon: iconCalendar, go: () => navigate('/schedule') },
    { label: 'Коллекции', icon: iconFolder, go: () => navigate('/collections'), dot: true },
    { label: 'Фильтр', icon: iconSlidersHorizontal, go: () => navigate('/catalog') },
    { label: 'Рандом', icon: iconShuffle, go: () => void openRandom() },
  ];

  onMount(() => {
    unregisterScrollKey = registerActiveScrollKey(() => OVERVIEW_UI_KEY());
    window.addEventListener('anix:beforeNavigate', onBeforeNavigate);
    const cached = getViewState<OverviewUiState>(OVERVIEW_UI_KEY());
    if (cached?.data) {
      steamActiveIndex = cached.data.steamActiveIndex ?? 0;
      carouselScroll = { ...cached.data.carouselScroll };
      pendingScrollTop = cached.scrollTop;
      logViewStateRestore(OVERVIEW_UI_KEY(), cached.scrollTop, cached.data);
      if (cached.scrollTop > 0) beginScrollRestore();
    }
    void loadOverview();
  });

  onDestroy(() => {
    window.removeEventListener('anix:beforeNavigate', onBeforeNavigate);
    unregisterScrollKey?.();
    unregisterScrollKey = null;
    saveViewStateData(OVERVIEW_UI_KEY(), {
      steamActiveIndex,
      carouselScroll,
    });
  });
</script>

{#if mobile}
<div class="view view-overview view-overview--mobile">
  {#if loadState === 'loading'}
    <div class="m-banner-track"><div class="m-banner"><div class="m-banner__img m-skeleton"></div></div></div>
  {:else if loadState === 'error'}
    <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void loadOverview(true)} />
  {:else}
    {#if banners.length > 0}
      <div class="m-banner-track">
        {#each banners as b (b.id)}
          <button type="button" class="m-banner m-btn-reset" onclick={() => openBanner(b)}>
            <div class="m-banner__img">{#if b.image}<img src={b.image} alt="" loading="lazy" />{/if}</div>
            <p class="m-banner__title">{b.title}</p>
            {#if b.description}<p class="m-banner__sub">{b.description}</p>{/if}
          </button>
        {/each}
      </div>
    {/if}

    <div class="m-quick">
      {#each QUICK as q (q.label)}
        <button type="button" class="m-quick__item" onclick={q.go}>
          {@html q.icon(24)}
          <span>{q.label}</span>
          {#if q.dot}<i class="m-quick__dot"></i>{/if}
        </button>
      {/each}
    </div>

    {#each [
      { id: 'rec', title: 'Рекомендации', sub: 'На основе ваших оценок', items: recommendations },
      { id: 'watch', title: 'Смотрят сейчас', sub: '', items: watching },
      { id: 'disc', title: 'Обсуждают сегодня', sub: '', items: discussing },
    ] as sec (sec.id)}
      {#if sec.items.length > 0}
        <div class="m-section-head">
          <div><h2>{sec.title}</h2>{#if sec.sub}<p>{sec.sub}</p>{/if}</div>
          <button type="button" onclick={() => navigate('/catalog')}>Показать все</button>
        </div>
        <div class="m-hscroll m-hscroll--posters">
          {#each sec.items as r (r.id)}
            <button type="button" class="m-poster-tile m-btn-reset" onclick={() => navigate(`/release/${r.id}`)}>
              <span class="m-poster">{#if r.poster}<img src={r.poster} alt="" loading="lazy" />{/if}</span>
              <span class="m-poster-tile__title">{r.titleRu || r.titleEn}</span>
            </button>
          {/each}
        </div>
      {/if}
    {/each}

    {#if recommendations.length === 0 && watching.length === 0 && discussing.length === 0}
      <div class="overview-page__empty">Пока нечего показать в обзоре</div>
    {/if}
  {/if}
</div>
{:else}
<div class="view view-overview">
  <div class="overview-page">
    {#if loadState === 'loading'}
      <OverviewSkeleton />
    {:else if loadState === 'error'}
      <UiV2ContentRetryOverlay message={errorMsg} onRetry={() => void loadOverview(true)} />
    {:else}
      <OverviewSteamCarousel
        items={banners}
        overrides={heroOverrides}
        initialActiveIndex={steamActiveIndex}
        onActiveIndexChange={(index) => { steamActiveIndex = index; }}
      />

      <div class="overview-page__content">
        {#if recommendations.length > 0}
          <section class="overview-section">
            <OverviewSectionHeader
              title="Рекомендации"
              subtitle="На основе ваших оценок"
              onShowAll={() => navigate('/catalog')}
            />
            <OverviewReleaseCarousel
              items={recommendations}
              sectionId="recommendations"
              initialScrollLeft={carouselScroll.recommendations ?? 0}
              onScrollLeftChange={(left) => { carouselScroll = { ...carouselScroll, recommendations: left }; }}
            />
          </section>
        {/if}

        {#if discussing.length > 0}
          <section class="overview-section">
            <OverviewSectionHeader title="Обсуждают сегодня" />
            <OverviewDiscussList items={discussing} />
          </section>
        {/if}

        {#if watching.length > 0}
          <section class="overview-section">
            <OverviewSectionHeader
              title="Смотрят сейчас"
              onShowAll={() => navigate('/catalog')}
            />
            <OverviewReleaseCarousel
              items={watching}
              sectionId="watching"
              initialScrollLeft={carouselScroll.watching ?? 0}
              onScrollLeftChange={(left) => { carouselScroll = { ...carouselScroll, watching: left }; }}
            />
          </section>
        {/if}

        {#if collectionsWeek.length > 0}
          <section class="overview-section">
            <OverviewSectionHeader
              title="Коллекции недели"
              onShowAll={() => navigate('/collections?week=1')}
            />
            <OverviewCollectionsWeek items={collectionsWeek} />
          </section>
        {/if}

        {#if commentsWeek.length > 0}
          <section class="overview-section">
            <OverviewSectionHeader title="Комментарии недели" />
            <OverviewCommentsWeek items={commentsWeek} />
          </section>
        {/if}

        {#if recommendations.length === 0 && discussing.length === 0 && watching.length === 0 && collectionsWeek.length === 0 && commentsWeek.length === 0}
          <div class="overview-page__empty">Пока нечего показать в обзоре</div>
        {/if}
      </div>
    {/if}
  </div>
</div>
{/if}
