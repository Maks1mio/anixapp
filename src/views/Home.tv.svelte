<script lang="ts">
  import { onMount } from 'svelte';
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

  let rows = $state<TvHomeRowState[]>([]);
  let announcements = $state<Announcement[]>([]);
  let booting = $state(true);

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
    void (async () => {
      const [ann, defs] = await Promise.all([
        fetchAnnouncements().catch(() => [] as Announcement[]),
        buildTvHomeRowDefs(),
      ]);

      announcements = ann;
      rows = createTvHomeRowStates(defs);
      booting = false;

      await Promise.all(defs.map((def) => loadRow(def.id, def.filterArgs)));
    })();
  });
</script>

<TvPage title="Главная">
  <div class="tv-home">
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
</TvPage>
