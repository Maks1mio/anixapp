<script lang="ts">
  import { onMount, tick } from 'svelte';
  import TvPage from '../components/tv/TvPage.svelte';
  import TvHomeRow from '../components/tv/TvHomeRow.svelte';
  import AnnouncementBanner from '../components/AnnouncementBanner.svelte';
  import { fetchAnnouncements, type Announcement } from '../services/announcements';
  import {
    buildTvHomeRowDefs,
    createTvHomeRowStates,
    loadTvHomeRowData,
    mapWithConcurrency,
    TV_CONTINUE_WATCHING_ROW_ID,
    type TvHomeRowState,
  } from '../tv/homeRows';
  import { attachTvHomeRailTitleDim } from '../tv/railTitleDim';
  import { attachTvHomeCarouselScroll } from '../tv/carouselScroll';
  import { syncAuthStatus } from '../stores/auth';

  let rows = $state<TvHomeRowState[]>([]);
  let announcements = $state<Announcement[]>([]);
  let booting = $state(true);
  let stageEl = $state<HTMLElement | null>(null);
  let railsEl = $state<HTMLElement | null>(null);
  let bootSeq = 0;
  let knownAuthenticated: boolean | undefined;
  let bootInFlight: Promise<void> | null = null;

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

  async function loadRowsData(defs: TvHomeRowState[], seq: number) {
    const historyRows = defs.filter((row) => row.kind === 'history');
    const filterRows = defs.filter((row) => row.kind !== 'history');

    const patches: Array<{ id: string; items: TvHomeRowState['items']; status: TvHomeRowState['status'] }> = [];

    if (historyRows.length > 0) {
      const historyPatches = await mapWithConcurrency(historyRows, 1, async (row) => {
        const data = await loadTvHomeRowData(row);
        return { id: row.id, ...data };
      });
      patches.push(...historyPatches);
    }

    if (seq !== bootSeq) return;

    const filterPatches = await mapWithConcurrency(filterRows, 1, async (row) => {
      const data = await loadTvHomeRowData(row);
      return { id: row.id, ...data };
    });
    patches.push(...filterPatches);

    if (seq !== bootSeq) return;
    rows = applyRowPatches(defs, patches);
    await tick();
    updateRowDim();
  }

  async function refreshContinueWatchingRow() {
    const row = rows.find((entry) => entry.id === TV_CONTINUE_WATCHING_ROW_ID);
    if (!row) return;
    const data = await loadTvHomeRowData(row);
    rows = applyRowPatches(rows, [{ id: row.id, ...data }]);
    await tick();
    updateRowDim();
  }

  function updateRowDim() {
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

      await loadRowsData(nextRows, seq);
    };

    bootInFlight = run().finally(() => {
      bootInFlight = null;
    });
    await bootInFlight;
  }

  function isVisibleHomeRow(row: TvHomeRowState): boolean {
    return row.id !== TV_CONTINUE_WATCHING_ROW_ID || row.status !== 'empty';
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
    const initialBootTimer = window.setTimeout(runInitialBoot, 1500);

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

    window.addEventListener('anix:authChanged', onSessionChanged);
    window.addEventListener('anix:bookmarksChanged', onHistoryChanged);
    window.addEventListener('anix:authChanged', onConnectionReady);

    return () => {
      window.clearTimeout(initialBootTimer);
      detachRailTitleDim();
      detachCarouselScroll();
      window.removeEventListener('anix:authChanged', onSessionChanged);
      window.removeEventListener('anix:bookmarksChanged', onHistoryChanged);
      window.removeEventListener('anix:authChanged', onConnectionReady);
    };
  });

  $effect(() => {
    const rails = railsEl;
    if (!rails) return;

    const onScroll = () => updateRowDim();
    rails.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('resize', onScroll, { passive: true });

    const resizeObserver = new ResizeObserver(() => updateRowDim());
    if (stageEl) resizeObserver.observe(stageEl);
    resizeObserver.observe(rails);
    updateRowDim();

    return () => {
      rails.removeEventListener('scroll', onScroll);
      window.removeEventListener('resize', onScroll);
      resizeObserver.disconnect();
    };
  });

  $effect(() => {
    rows.length;
    booting;
    void tick().then(updateRowDim);
  });
</script>

<TvPage title="Главная" hideHead>
  <div class="tv-home">
    <section class="tv-home__stage" bind:this={stageEl} aria-label="Главная">
      <div class="tv-home__rails" bind:this={railsEl} data-tv-home-rails>
        {#if announcements.length > 0}
          <div class="tv-home__announcements">
            {#each announcements as ann (ann.id)}
              <AnnouncementBanner announcement={ann} />
            {/each}
          </div>
        {/if}

        {#if booting}
          <TvHomeRow label="Загрузка…" status="loading" skeletonCount={7} />
        {:else if rows.length === 0}
          <p class="tv-page__status">Нет разделов для показа</p>
        {:else}
          <div class="tv-home__rows">
            {#each rows.filter(isVisibleHomeRow) as row (row.id)}
              <TvHomeRow
                label={row.label}
                tabId={row.tabId ?? row.id}
                items={row.items}
                status={row.status}
                cardVariant={row.kind === 'history' ? 'history' : 'default'}
                showSeeAll={row.kind !== 'history'}
              />
            {/each}
          </div>
        {/if}
      </div>
    </section>
  </div>
</TvPage>
