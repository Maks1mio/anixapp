<script lang="ts">
  import WrappedScreenShell from '../components/WrappedScreenShell.svelte';
  import WrappedReleaseCard from '../components/WrappedReleaseCard.svelte';
  import type { WrappedData } from '../shared/wrapped-load';

  interface Props { data: WrappedData; }
  let { data }: Props = $props();
</script>

<WrappedScreenShell id="top-rated" align="start">
  <div class="wrapped-block">
    <h2 class="wrapped-heading" data-wrapped-animate>Любимые оценки</h2>
    <p class="wrapped-lead" data-wrapped-animate>Тайтлы с 5★ за {data.year}</p>
    <div class="wrapped-top-three wrapped-top-three--rated">
      {#each data.topRated as release, i}
        <div data-wrapped-animate style="--i:{i}">
          <WrappedReleaseCard release={release} rank={i + 1} size="lg" meta="★★★★★" />
        </div>
      {/each}
    </div>
  </div>
</WrappedScreenShell>
