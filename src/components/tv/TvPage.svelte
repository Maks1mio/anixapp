<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    subtitle?: string;
    hideHead?: boolean;
    children?: Snippet;
  }

  let { title, subtitle, hideHead = false, children }: Props = $props();
</script>

<section class="tv-page" class:tv-page--no-head={hideHead} aria-label={title}>
  {#if !hideHead}
    <header class="tv-page__head">
      <h1 class="tv-page__title">{title}</h1>
      {#if subtitle}
        <p class="tv-page__subtitle">{subtitle}</p>
      {/if}
    </header>
  {/if}
  <div class="tv-page__body">
    {@render children?.()}
  </div>
</section>
