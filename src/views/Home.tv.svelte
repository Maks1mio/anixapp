<script lang="ts">
  import { onMount, tick } from 'svelte';
  import TvPage from '../components/tv/TvPage.svelte';
  import TvHomeRow from '../components/tv/TvHomeRow.svelte';
  import AnnouncementBanner from '../components/AnnouncementBanner.svelte';
  import { fetchAnnouncements, type Announcement } from '../services/announcements';
  import {
    buildTvHomeRowDefs,
    createTvHomeRowStates,
    invalidateTvHomeRowCache,
    loadTvHomeRowData,
    mapWithConcurrency,
    TV_CONTINUE_WATCHING_ROW_ID,
    TV_HOME_EAGER_FILTER_ROWS,
    type TvHomeRowState,
  } from '../tv/homeRows';
  import { attachTvHomeRailTitleDim } from '../tv/railTitleDim';
  import { attachTvHomeCarouselScroll } from '../tv/carouselScroll';
  import { syncAuthStatus } from '../stores/auth';

  let rows = $state<TvHomeRowState[]>([]);
  let announcements = $state<Announcement[]>([]);
  let showAnnouncements = $state(false);
  let booting = $state(true);
  let stageEl = $state<HTMLElement | null>(null);
  let railsEl = $state<HTMLElement | null>(null);
  let intersectingIds = $state<string[]>([]);
  let bootSeq = 0;
  let knownAuthenticated: boolean | undefined;
  let bootInFlight: Promise<void> | null = null;
  const rowLoads = new Set<string>();

  const visibleRows = $derived(rows.filter(isVisibleHomeRow));

  function rowsNeedReload(current: TvHomeRowState[]): boolean {
    return current.some((row) => row.status === 'loading' || row.status === 'error');
  }

  function applyRowPatches(
    current: TvHomeRowState[],
    patches: Array<{ id: string; items: TvHomeRowState['items']; status: TvHomeRowState['status'] }>,
  ): TvHomeRowState[] {
    const patchById = new Map(patches.map((patch) => [patch.id, patch]));
    return current.map((entry) => {
      const patch = patchById.get(entry.id);
      return patch ? { ...entry, items: patch.items, status: patch.status } : entry;
    });
  }

  function isVisibleHomeRow(row: TvHomeRowState): boolean {
    return row.id !== TV_CONTINUE_WATCHING_ROW_ID || row.status !== 'empty';
  }

  function isHydrated(row: TvHomeRowState, index: number): boolean {
    if (index < TV_HOME_EAGER_FILTER_ROWS) return true;
    if (intersectingIds.includes(row.id)) return true;
    const prev = visibleRows[index - 1];
    const next = visibleRows[index + 1];
    return (!!prev && intersectingIds.includes(prev.id))
      || (!!next && intersectingIds.includes(next.id));
  }

  async function loadRowById(id: string, seq = bootSeq): Promise<void> {
    const row = rows.find((entry) => entry.id === id);
    if (!row || row.status !== 'loading' || rowLoads.has(id)) return;
    rowLoads.add(id);
    try {
      const data = await loadTvHomeRowData(row);
      if (seq !== bootSeq) return;
      rows = applyRowPatches(rows, [{ id, ...data }]);
    } finally {
      rowLoads.delete(id);
    }
  }

  async function loadEagerRows(defs: TvHomeRowState[], seq: number) {
    const historyRows = defs.filter((row) => row.kind === 'history');
    const filterRows = defs.filter((row) => row.kind !== 'history');
    const eager = [...historyRows, ...filterRows.slice(0, TV_HOME_EAGER_FILTER_ROWS)];

    await mapWithConcurrency(eager, 2, async (row) => {
      if (seq !== bootSeq) return row.id;
      await loadRowById(row.id, seq);
      return row.id;
    });
  }

  async function refreshContinueWatchingRow() {
    invalidateTvHomeRowCache('history');
    const row = rows.find((entry) => entry.id === TV_CONTINUE_WATCHING_ROW_ID);
    if (!row) return;
    rowLoads.delete(row.id);
    rows = applyRowPatches(rows, [{ id: row.id, items: [], status: 'loading' }]);
    await loadRowById(row.id);
  }

  function updateRowDim() {
    if (document.documentElement.classList.contains('tv-android')) return;
    const root = stageEl;
    const railsTop = railsEl?.getBoundingClientRect().top ?? 0;
    if (!root) return;

    root.querySelectorAll<HTMLElement>('[data-tv-home-row]').forEach((row) => {
      const rect = row.getBoundingClientRect();
      const hiddenRatio = Math.min(1, Math.max(0, (railsTop - rect.top) / Math.max(rect.height, 1)));
      const brightness = 1 - hiddenRatio * 0.52;
      const opacity = 1 - hiddenRatio * 0.42;
      row.style.setProperty('--tv-row-brightness', brightness.toFixed(3));
      row.style.setProperty('--tv-row-opacity', opacity.toFixed(3));
    });
  }

  async function bootHomeRows(force = false) {
    if (bootInFlight) {
      await bootInFlight;
      if (!force) return;
    }

    const authenticated = await syncAuthStatus();
    if (
      !force
      && knownAuthenticated === authenticated
      && rows.length > 0
      && !booting
      && !rowsNeedReload(rows)
    ) {
      return;
    }

    const run = async () => {
      knownAuthenticated = authenticated;

      const seq = ++bootSeq;
      const [ann, defs] = await Promise.all([
        fetchAnnouncements().catch(() => [] as Announcement[]),
        buildTvHomeRowDefs(authenticated),
      ]);
      if (seq !== bootSeq) return;

      announcements = ann;
      const nextRows = createTvHomeRowStates(defs);
      rows = nextRows;
      booting = false;

      await loadEagerRows(nextRows, seq);
      if (seq === bootSeq) {
        window.setTimeout(() => {
          if (seq === bootSeq) showAnnouncements = announcements.length > 0;
        }, 400);
      }
    };

    bootInFlight = run().finally(() => {
      bootInFlight = null;
    });
    await bootInFlight;
  }

  onMount(() => {
    const detachRailTitleDim = attachTvHomeRailTitleDim();
    const detachCarouselScroll = attachTvHomeCarouselScroll();

    let initialBootDone = false;
    const runInitialBoot = () => {
      if (initialBootDone) return;
      initialBootDone = true;
      void bootHomeRows();
    };

    window.addEventListener('anix:authChanged', runInitialBoot, { once: true });
    runInitialBoot();

    const onSessionChanged = async () => {
      const authenticated = await syncAuthStatus();
      if (knownAuthenticated === undefined) return;
      if (knownAuthenticated === authenticated) return;
      void bootHomeRows(true);
    };
    const onConnectionReady = () => {
      if (rowsNeedReload(rows)) void bootHomeRows(true);
    };
    const onHistoryChanged = (e: Event) => {
      const kind = (e as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind && kind !== 'history') return;
      void refreshContinueWatchingRow();
    };
    const onFocusRow = (e: Event) => {
      const id = (e as CustomEvent<{ id?: string }>).detail?.id;
      if (!id) return;
      if (!intersectingIds.includes(id)) intersectingIds = [...intersectingIds, id];
      void loadRowById(id);
    };

    window.addEventListener('anix:authChanged', onSessionChanged);
    window.addEventListener('anix:bookmarksChanged', onHistoryChanged);
    window.addEventListener('anix:authChanged', onConnectionReady);
    window.addEventListener('tv-home:focus-row', onFocusRow);

    return () => {
      detachRailTitleDim();
      detachCarouselScroll();
      window.removeEventListener('anix:authChanged', onSessionChanged);
      window.removeEventListener('anix:bookmarksChanged', onHistoryChanged);
      window.removeEventListener('anix:authChanged', onConnectionReady);
      window.removeEventListener('tv-home:focus-row', onFocusRow);
    };
  });

  const rowObserveKey = $derived(rows.map((row) => row.id).join('|'));

  $effect(() => {
    const rails = railsEl;
    rowObserveKey;
    if (!rails || !rowObserveKey) return;

    const io = new IntersectionObserver((entries) => {
      const next = new Set(intersectingIds);
      for (const entry of entries) {
        const id = (entry.target as HTMLElement).dataset.tvHomeRowId;
        if (!id) continue;
        if (entry.isIntersecting) next.add(id);
        else next.delete(id);
      }
      intersectingIds = [...next];
      const vis = rows.filter(isVisibleHomeRow);
      for (const id of next) {
        void loadRowById(id);
        const index = vis.findIndex((row) => row.id === id);
        const ahead = vis[index + 1];
        if (ahead) void loadRowById(ahead.id);
      }
      updateRowDim();
    }, {
      root: rails,
      rootMargin: '280px 0px',
      threshold: 0.01,
    });

    rails.querySelectorAll<HTMLElement>('[data-tv-home-row]').forEach((node) => io.observe(node));

    return () => io.disconnect();
  });

  $effect(() => {
    if (document.documentElement.classList.contains('tv-android')) return;
    const rails = railsEl;
    if (!rails) return;

    const onScroll = () => updateRowDim();
    rails.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });
    updateRowDim();

    return () => {
      rails.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
    };
  });

  $effect(() => {
    rows.length;
    booting;
    if (document.documentElement.classList.contains('tv-android')) return;
    void tick().then(updateRowDim);
  });
</script>

<TvPage title="Главная" hideHead>
  <div class="tv-home">
    <section class="tv-home__stage" bind:this={stageEl} aria-label="Главная">
      <div class="tv-home__rails" bind:this={railsEl} data-tv-home-rails>
        {#if showAnnouncements}
          <div class="tv-home__announcements">
            {#each announcements as ann (ann.id)}
              <AnnouncementBanner announcement={ann} />
            {/each}
          </div>
        {/if}

        {#if booting}
          <TvHomeRow label="Загрузка…" status="loading" skeletonCount={5} />
        {:else if visibleRows.length === 0}
          <p class="tv-page__status">Нет разделов для показа</p>
        {:else}
          <div class="tv-home__rows">
            {#each visibleRows as row, index (row.id)}
              <TvHomeRow
                label={row.label}
                tabId={row.tabId ?? row.id}
                items={row.items}
                status={row.status}
                hydrate={isHydrated(row, index)}
                cardVariant={row.kind === 'history' ? 'history' : 'default'}
                showSeeAll={row.kind !== 'history'}
                skeletonCount={5}
              />
            {/each}
          </div>
        {/if}
      </div>
    </section>
  </div>
</TvPage>
