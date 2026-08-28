<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title: string;
    subtitle?: string;
    children?: Snippet;
  }

  let { title, subtitle, children }: Props = $props();
</script>

<section class="tv-page" aria-label={title}>
  <header class="tv-page__head">
    <h1 class="tv-page__title">{title}</h1>
    {#if subtitle}
      <p class="tv-page__subtitle">{subtitle}</p>
    {/if}
  </header>
  <div class="tv-page__body">
    {@render children?.()}
  </div>
</section>
