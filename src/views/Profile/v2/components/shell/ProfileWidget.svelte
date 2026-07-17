<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    class?: string;
    flush?: boolean;
    children: Snippet;
    actions?: Snippet;
  }

  let { title, class: className = '', flush = false, children, actions }: Props = $props();
</script>

<section
  class="profile-ui__widget{className ? ` ${className}` : ''}"
  class:profile-ui__widget--flush={flush}
>
  {#if title || actions}
    <header class="profile-ui__widget-head">
      {#if title}
        <h3 class="profile-ui__widget-title">{title}</h3>
      {/if}
      {#if actions}
        <div class="profile-ui__widget-actions">
          {@render actions()}
        </div>
      {/if}
    </header>
  {/if}
  <div class="profile-ui__widget-body">
    {@render children()}
  </div>
</section>
