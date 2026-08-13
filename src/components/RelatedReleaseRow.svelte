<script lang="ts">
  import ReleaseCardUiV2 from './ReleaseCardUiV2.svelte';
  import type { ReleaseCardData } from '../types/release';

  interface Props {
    data: ReleaseCardData;
    isFirst?: boolean;
    isLast?: boolean;
    isCurrent?: boolean;
  }

  let {
    data,
    isFirst = false,
    isLast = false,
    isCurrent = false,
  }: Props = $props();
</script>

<div
  class="related-v2-row"
  class:related-v2-row--first={isFirst}
  class:related-v2-row--last={isLast}
  class:related-v2-row--current={isCurrent}
>
  <div class="related-v2-row__rail" aria-hidden="true">
    {#if !isFirst}
      <span class="related-v2-row__line related-v2-row__line--top"></span>
    {:else}
      <span class="related-v2-row__spacer"></span>
    {/if}
    <span class="related-v2-row__node"></span>
    {#if !isLast}
      <span class="related-v2-row__line related-v2-row__line--bottom"></span>
    {:else}
      <span class="related-v2-row__spacer"></span>
    {/if}
  </div>

  <div class="related-v2-row__card">
    <ReleaseCardUiV2 data={data} variant="horizontal" disableOpen={isCurrent} />
  </div>
</div>
