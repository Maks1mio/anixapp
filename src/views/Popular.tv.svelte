<script lang="ts">
  import { onMount } from 'svelte';
  import TvPage from '../components/tv/TvPage.svelte';
  import TvHomeRow from '../components/tv/TvHomeRow.svelte';
  import { attachTvHomeCarouselScroll } from '../tv/carouselScroll';
  import { mapWithConcurrency } from '../tv/homeRows';
  import { fetchTvPopularPage } from '../tv/popular';
  import { POPULAR_TAB_DEFS, type PopularTabId } from '../data/popularTabs';
  import type { ReleaseCardData } from '../types/release';

  type RowStatus = 'loading' | 'ready' | 'empty' | 'error';
  interface Row {
    id: PopularTabId;
    label: string;
    items: ReleaseCardData[];
    status: RowStatus;
  }

  let rows = $state<Row[]>(POPULAR_TAB_DEFS.map((def) => ({
    id: def.id,
    label: def.label,
    items: [],
    status: 'loading' as RowStatus,
  })));

  async function loadRows() {
    await mapWithConcurrency([...POPULAR_TAB_DEFS], 2, async (def) => {
      try {
        const page = await fetchTvPopularPage(def.id, 0);
        rows = rows.map((row) => (row.id === def.id
          ? { ...row, items: page.items, status: page.items.length ? 'ready' : 'empty' }
          : row));
      } catch {
        rows = rows.map((row) => (row.id === def.id ? { ...row, status: 'error' } : row));
      }
      return def.id;
    });
  }

  onMount(() => {
    const detachCarouselScroll = attachTvHomeCarouselScroll();
    void loadRows();
    return detachCarouselScroll;
  });
</script>

<TvPage title="Популярное" hideHead>
  <div class="tv-home">
    <section class="tv-home__stage" aria-label="Популярное">
      <div class="tv-home__rails" data-tv-home-rails>
        <div class="tv-home__rows">
          {#each rows as row (row.id)}
            <TvHomeRow
              label={row.label}
              tabId={`popular-${row.id}`}
              items={row.items}
              status={row.status}
              showSeeAll={row.status === 'ready'}
              seeAllHref={`/overview/popular/${row.id}`}
              seeAllText="Открыть весь топ"
              seeAllAt="end"
            />
          {/each}
        </div>
      </div>
    </section>
  </div>
</TvPage>
