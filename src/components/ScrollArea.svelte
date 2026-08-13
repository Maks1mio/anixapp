<script lang="ts">
  import type { Snippet } from 'svelte';
  import UiV2ScrollArea from './uikit-v2/UiV2ScrollArea.svelte';

  interface Props {
    extraClass?: string;
    scrollId?: string;
    children?: Snippet;
  }

  let { extraClass, scrollId, children }: Props = $props();
</script>

<UiV2ScrollArea
  class={extraClass}
  viewportClass="page__scroll"
  {scrollId}
  axis="y"
>
  {@render children?.()}
</UiV2ScrollArea>
