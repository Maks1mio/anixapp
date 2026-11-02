<script lang="ts">
  import TvPage from '../components/tv/TvPage.svelte';
  import TvReleaseGrid from '../components/tv/TvReleaseGrid.svelte';
  import { POPULAR_TAB_DEFS, resolvePopularTab } from '../data/popularTabs';
  import { fetchTvPopularPage } from '../tv/popular';

  interface Props {
    tab: string;
  }

  let { tab }: Props = $props();

  const tabId = $derived(resolvePopularTab(tab));
  const label = $derived(POPULAR_TAB_DEFS.find((def) => def.id === tabId)?.label ?? 'Популярное');
</script>

<TvPage title={label} subtitle="Популярное">
  <TvReleaseGrid fetchPage={(page) => fetchTvPopularPage(tabId, page)} />
</TvPage>
