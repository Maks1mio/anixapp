<script lang="ts">
  import type { Snippet } from 'svelte';

  type Props = {
    title: string;
    desc?: string;
    stack?: boolean;
    children?: Snippet;
  };

  let { title, desc = '', stack = false, children }: Props = $props();
</script>

<div class="uiv2-settings__row" class:uiv2-settings__row--stack={stack}>
  <div class="uiv2-settings__row-info">
    <p class="uiv2-settings__row-title">{title}</p>
    {#if desc}
      <p class="uiv2-settings__row-desc">{desc}</p>
    {/if}
  </div>
  {#if children}
    <div class="uiv2-settings__row-control">
      {@render children()}
    </div>
  {/if}
</div>
