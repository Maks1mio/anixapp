<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    active: boolean;
    keepKey?: string;
    children?: Snippet;
  }

  let { active, keepKey = '', children }: Props = $props();
</script>

<div
  class="tv-route-layer"
  class:tv-route-layer--active={active}
  data-tv-keep={keepKey || undefined}
  inert={!active}
  aria-hidden={!active}
>
  {@render children?.()}
</div>
