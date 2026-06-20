<script lang="ts">
  import { onMount } from 'svelte';
  import { navigate } from '../stores/navigation';
  import OverviewHeroBanner from '../components/overview/OverviewHeroBanner.svelte';
  import OverviewSectionHeader from '../components/overview/OverviewSectionHeader.svelte';
  import OverviewReleaseCarousel from '../components/overview/OverviewReleaseCarousel.svelte';
  import OverviewDiscussList from '../components/overview/OverviewDiscussList.svelte';
  import OverviewCollectionsWeek from '../components/overview/OverviewCollectionsWeek.svelte';
  import OverviewCommentsWeek from '../components/overview/OverviewCommentsWeek.svelte';
  import OverviewSkeleton from '../components/overview/OverviewSkeleton.svelte';
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
    type OverviewOverride,
  } from '../services/overview-overrides';
  import type { ReleaseCardData } from '../types/release';
  import type { CollectionCardData } from '../components/CollectionCard.svelte';

  type LoadState = 'loading' | 'ready' | 'error';

  const DISCOVER_TIMEOUT_MS = 20_000;

  let loadState = $state<LoadState>('loading');
  let errorMsg = $state('');

  let banners = $state<OverviewBanner[]>([]);
  let recommendations = $state<ReleaseCardData[]>([]);
  let watching = $state<ReleaseCardData[]>([]);
  let discussing = $state<OverviewDiscussItem[]>([]);
  let collectionsWeek = $state<CollectionCardData[]>([]);
  let commentsWeek = $state<OverviewCommentWeekItem[]>([]);
  let heroOverrides = $state<OverviewOverride[]>([]);

  function applyCache(data: OverviewCacheData) {
    banners = data.banners;
    recommendations = data.recommendations;
    watching = data.watching;
    discussing = data.discussing;
    collectionsWeek = data.collectionsWeek;
    commentsWeek = data.commentsWeek;
    loadState = 'ready';
    errorMsg = '';
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
            .map((raw) => mapOverviewCommentWeek(raw as Record<string, unknown>))
            .filter((c): c is OverviewCommentWeekItem => c != null)
        : [],
    };
  }

  async function loadHeroOverrides() {
    try {
      heroOverrides = await fetchOverviewOverrides();
    } catch {
      heroOverrides = [];
    }
  }

  async function loadOverview(force = false) {
    if (!force) {
      const cached = getOverviewCache();
      if (cached) {
        applyCache(cached);
        void loadHeroOverrides();
        return;
      }

      const pending = getOverviewInflight();
      if (pending) {
        try {
          applyCache(await pending);
          void loadHeroOverrides();
        } catch (err) {
          errorMsg = String(err);
          loadState = 'error';
        }
        return;
      }
    }

    loadState = 'loading';

    const request = fetchOverviewPayload()
      .then((payload) => setOverviewCache(payload))
      .finally(() => setOverviewInflight(null));

    setOverviewInflight(request);

    try {
      const data = await request;
      applyCache(data);
      await loadHeroOverrides();
    } catch (err) {
      errorMsg = String(err);
      loadState = 'error';
    }
  }

  onMount(() => {
    void loadOverview();
  });
</script>

<div class="view view-overview">
  <div class="overview-page">
    {#if loadState === 'loading'}
      <OverviewSkeleton />
    {:else if loadState === 'error'}
      <div class="overview-page__error">
        <p>{errorMsg || 'Не удалось загрузить обзор'}</p>
        <button type="button" class="overview-page__retry" onclick={() => void loadOverview(true)}>
          Повторить
        </button>
      </div>
    {:else}
      <OverviewHeroBanner items={banners} overrides={heroOverrides} />

      <div class="overview-page__content">
        {#if recommendations.length > 0}
          <section class="overview-section">
            <OverviewSectionHeader
              title="Рекомендации"
              subtitle="На основе ваших оценок"
              onShowAll={() => navigate('/catalog')}
            />
            <OverviewReleaseCarousel items={recommendations} />
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
            <OverviewReleaseCarousel items={watching} />
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
