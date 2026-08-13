<script lang="ts">
  import RelatedReleaseRow from "../components/RelatedReleaseRow.svelte";
  import { onMount, onDestroy } from 'svelte';
  import { getSearchParams } from '../router';
  import type { ReleaseCardData } from '../types/release';
  import { mapReleaseRawToCard } from '../utils/release-card';

  interface Props {
    /** Franchise related id (GET /related/{id}/{page}) */
    id: number;
  }

  let { id }: Props = $props();

  let currentReleaseId = $state<number | undefined>(undefined);

  $effect(() => {
    id;
    const from = getSearchParams().get('from');
    const parsed = from ? parseInt(from, 10) : NaN;
    currentReleaseId = Number.isFinite(parsed) ? parsed : undefined;
  });

  function mapReleaseToCardData(raw: Record<string, unknown>): ReleaseCardData {
    return {
      ...mapReleaseRawToCard(raw),
      myVote: typeof raw.your_vote === 'number' ? raw.your_vote : undefined,
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

  let currentRowEl = $state<HTMLElement | undefined>();
  let bgVisible = $state(false);
  let bgTop = $state(0);
  let bgWidth = $state(0);
  let bgHeight = $state(0);

  function getScrollEl(): HTMLElement | null {
    return wrapEl?.closest('.page__scroll') as HTMLElement | null;
  }

  function syncCurrentBg() {
    const scroll = getScrollEl();
    const row = currentRowEl;
    if (!scroll || !row || currentReleaseId == null) {
      bgVisible = false;
      return;
    }

    const scrollRect = scroll.getBoundingClientRect();
    const rowRect = row.getBoundingClientRect();

    bgTop = rowRect.top - scrollRect.top + scroll.scrollTop;
    bgWidth = scroll.offsetWidth;
    bgHeight = row.offsetHeight;
    bgVisible = true;
  }

  $effect(() => {
    items.length;
    currentReleaseId;
    const row = currentRowEl;
    const scroll = getScrollEl();
    if (!row || !scroll || currentReleaseId == null) {
      bgVisible = false;
      return;
    }

    const update = () => requestAnimationFrame(syncCurrentBg);

    update();
    const ro = new ResizeObserver(update);
    ro.observe(row);
    ro.observe(scroll);

    scroll.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);

    return () => {
      ro.disconnect();
      scroll.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  });

  function relatedRowRef(node: HTMLElement, isCurrent: boolean) {
    function apply(active: boolean) {
      if (active) currentRowEl = node;
      else if (currentRowEl === node) currentRowEl = undefined;
    }

    apply(isCurrent);

    return {
      update(active: boolean) {
        apply(active);
      },
      destroy() {
        if (currentRowEl === node) currentRowEl = undefined;
      },
    };
  }

  async function loadPage() {
    if (loading || !hasMore) return;
    loading = true;
    if (page === 0) loadState = 'loading';

    try {
      const data = await window.anixApi!.release.related(id, page) as any;
      const content = (data?.content ?? data?.releases ?? []) as any[];

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

  onDestroy(() => {
    if (scrollEl && scrollListener) scrollEl.removeEventListener('scroll', scrollListener);
  });
</script>

<div class="view view-related" bind:this={wrapEl}>
  {#if bgVisible}
    <div
      class="related__current-bg"
      aria-hidden="true"
      style:top="{bgTop}px"
      style:width="{bgWidth}px"
      style:height="{bgHeight}px"
    ></div>
  {/if}

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
        {#each items as item, index (item.id)}
          {@const isCurrent = currentReleaseId != null && item.id === currentReleaseId}
          <div class="related__row" use:relatedRowRef={isCurrent}>
            <RelatedReleaseRow
              data={item}
              isFirst={index === 0}
              isLast={index === items.length - 1 && !hasMore}
              isCurrent={isCurrent}
            />
          </div>
        {/each}
        {#if loading}
          <div class="related__loading">Загрузка…</div>
        {/if}
      {/if}
    </div>
  </div>
</div>
