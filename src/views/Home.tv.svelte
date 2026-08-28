<script lang="ts">
  import { onMount, tick } from 'svelte';
  import TvPage from '../components/tv/TvPage.svelte';
  import TvHomeRow from '../components/tv/TvHomeRow.svelte';
  import AnnouncementBanner from '../components/AnnouncementBanner.svelte';
  import { fetchAnnouncements, type Announcement } from '../services/announcements';
  import {
    buildTvHomeRowDefs,
    createTvHomeRowStates,
    fetchTvHomeRowItems,
    type TvHomeRowState,
  } from '../tv/homeRows';
  import { attachTvHomeRailTitleDim } from '../tv/railTitleDim';

  let rows = $state<TvHomeRowState[]>([]);
  let announcements = $state<Announcement[]>([]);
  let booting = $state(true);
  let stageEl = $state<HTMLElement | null>(null);
  let railsEl = $state<HTMLElement | null>(null);

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

  async function loadRow(rowId: string, filterArgs: Record<string, unknown>) {
    try {
      const items = await fetchTvHomeRowItems(filterArgs);
      rows = rows.map((row) =>
        row.id === rowId
          ? { ...row, items, status: items.length > 0 ? 'ready' : 'empty' }
          : row,
      );
    } catch {
      rows = rows.map((row) =>
        row.id === rowId ? { ...row, status: 'error' } : row,
      );
    }
  }

  onMount(() => {
    const detachRailTitleDim = attachTvHomeRailTitleDim();

    void (async () => {
      const [ann, defs] = await Promise.all([
        fetchAnnouncements().catch(() => [] as Announcement[]),
        buildTvHomeRowDefs(),
      ]);

      announcements = ann;
      rows = createTvHomeRowStates(defs);
      booting = false;

      await Promise.all(defs.map((def) => loadRow(def.id, def.filterArgs)));
      await tick();
      updateRowDim();
    })();

    return detachRailTitleDim;
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
          <TvHomeRow label="Загрузка…" status="loading" skeletonCount={10} />
        {:else if rows.length === 0}
          <p class="tv-page__status">Нет разделов для показа</p>
        {:else}
          <div class="tv-home__rows">
            {#each rows as row (row.id)}
              <TvHomeRow
                label={row.label}
                tabId={row.tabId ?? row.id}
                items={row.items}
                status={row.status}
              />
            {/each}
          </div>
        {/if}
      </div>
    </section>
  </div>
</TvPage>
