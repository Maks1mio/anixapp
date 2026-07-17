<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    title?: string;
    class?: string;
    children: Snippet;
    actions?: Snippet;
  }

  let { title, class: className = '', children, actions }: Props = $props();
</script>

<section class="profile-ui__section-block{className ? ` ${className}` : ''}">
  {#if title || actions}
    <header class="profile-ui__section-block-head">
      {#if title}
        <h3 class="profile-ui__section-block-title">{title}</h3>
      {/if}
      {#if actions}
        <div class="profile-ui__section-block-actions">
          {@render actions()}
        </div>
      {/if}
    </header>
  {/if}
  <div class="profile-ui__section-block-body">
    {@render children()}
  </div>
</section>
