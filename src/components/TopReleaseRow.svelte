<script lang="ts">
  import ReleaseCardUiV2 from './ReleaseCardUiV2.svelte';
  import type { ReleaseCardData } from '../types/release';

  interface Props {
    rank: number;
    data: ReleaseCardData;
  }

  let { rank, data }: Props = $props();
</script>

<div class="top-release-row top-release-row--v2">
  <span class="top-release-row__rank">{rank}</span>
  <div class="top-release-row__card">
    <ReleaseCardUiV2 data={data} variant="horizontal" />
  </div>
</div>
