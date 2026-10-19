<script lang="ts">
  import { onMount } from 'svelte';
  import TvPage from '../components/tv/TvPage.svelte';
  import TvHomeRow from '../components/tv/TvHomeRow.svelte';
  import { attachTvHomeCarouselScroll } from '../tv/carouselScroll';
  import { mapWithConcurrency } from '../tv/homeRows';
  import {
    TV_BOOKMARK_LISTS,
    TV_BOOKMARK_ROW_LIMIT,
    fetchTvBookmarkPage,
    resetTvBookmarkProfile,
    type TvBookmarkListId,
  } from '../tv/bookmarkRows';
  import type { ReleaseCardData } from '../types/release';
  import { requireAuth, syncAuthStatus } from '../stores/auth';
  import { scheduleFocusTvPageContent } from '../services/tv-navigation';

  type RowStatus = 'loading' | 'ready' | 'empty' | 'error';
  interface Row {
    id: TvBookmarkListId;
    label: string;
    items: ReleaseCardData[];
    total: number;
    status: RowStatus;
  }

  let authState = $state<'checking' | 'guest' | 'ready'>('checking');
  let rows = $state<Row[]>(TV_BOOKMARK_LISTS.map((def) => ({
    id: def.id,
    label: def.label,
    items: [],
    total: 0,
    status: 'loading' as RowStatus,
  })));
  let loadSeq = 0;

  /** Пустые списки прячем, чтобы пульт не «спотыкался» о пустые ряды. */
  const visibleRows = $derived(rows.filter((row) => row.status !== 'empty'));
  const allEmpty = $derived(rows.every((row) => row.status === 'empty'));

  function countLabel(row: Row): string {
    if (row.id === 'history' || row.status !== 'ready' || row.total <= 0) return '';
    return row.total.toLocaleString('ru-RU');
  }

  async function loadRows() {
    const seq = ++loadSeq;
    const authed = await syncAuthStatus();
    if (seq !== loadSeq) return;
    if (!authed) {
      authState = 'guest';
      return;
    }
    authState = 'ready';
    rows = rows.map((row) => ({ ...row, status: row.items.length ? row.status : 'loading' }));

    await mapWithConcurrency(TV_BOOKMARK_LISTS, 3, async (def) => {
      try {
        const page = await fetchTvBookmarkPage(def.id, 0);
        if (seq !== loadSeq) return;
        const items = page.items.slice(0, TV_BOOKMARK_ROW_LIMIT);
        rows = rows.map((row) => (row.id === def.id
          ? { ...row, items, total: page.total, status: items.length ? 'ready' : 'empty' }
          : row));
      } catch {
        if (seq !== loadSeq) return;
        rows = rows.map((row) => (row.id === def.id ? { ...row, status: 'error' } : row));
      }
    });
  }

  onMount(() => {
    const detachCarouselScroll = attachTvHomeCarouselScroll();
    void loadRows();

    // Статус/избранное поменяли на странице тайтла — обновляем ряды.
    const onBookmarksChanged = () => void loadRows();
    const onAuthChanged = () => {
      resetTvBookmarkProfile();
      void loadRows();
    };
    window.addEventListener('anix:bookmarksChanged', onBookmarksChanged);
    window.addEventListener('anix:favoritesChanged', onBookmarksChanged);
    window.addEventListener('anix:authChanged', onAuthChanged);
    return () => {
      detachCarouselScroll();
      window.removeEventListener('anix:bookmarksChanged', onBookmarksChanged);
      window.removeEventListener('anix:favoritesChanged', onBookmarksChanged);
      window.removeEventListener('anix:authChanged', onAuthChanged);
    };
  });

  function login() {
    if (requireAuth()) void loadRows();
    else scheduleFocusTvPageContent(20);
  }
</script>

<TvPage title="Закладки" hideHead>
  <div class="tv-home tv-bookmarks">
    <section class="tv-home__stage" aria-label="Закладки">
      <div class="tv-home__rails" data-tv-home-rails>
        {#if authState === 'guest'}
          <div class="tv-bookmarks__empty">
            <h1 class="tv-bookmarks__empty-title">Закладки</h1>
            <p class="tv-bookmarks__empty-text">
              Войдите в аккаунт, чтобы видеть свои списки, избранное и историю просмотра.
            </p>
            <button type="button" class="tv-bookmarks__login" onclick={login}>Войти</button>
          </div>
        {:else if authState === 'ready' && allEmpty}
          <div class="tv-bookmarks__empty">
            <h1 class="tv-bookmarks__empty-title">Закладки пусты</h1>
            <p class="tv-bookmarks__empty-text">
              Добавляйте тайтлы в списки на странице релиза — кнопка «Категория».
            </p>
          </div>
        {:else}
          <div class="tv-home__rows">
            {#each visibleRows as row (row.id)}
              <TvHomeRow
                label={row.label}
                tabId={`bookmarks-${row.id}`}
                items={row.items}
                status={authState === 'checking' ? 'loading' : row.status}
                cardVariant={row.id === 'history' ? 'history' : 'default'}
                showSeeAll={row.status === 'ready' && row.total > row.items.length}
                seeAllHref={`/bookmarks/${row.id}`}
                seeAllText="Открыть весь список"
                seeAllAt="end"
                meta={countLabel(row)}
                skeletonCount={5}
              />
            {/each}
          </div>
        {/if}
      </div>
    </section>
  </div>
</TvPage>
