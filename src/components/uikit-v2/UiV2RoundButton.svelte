<script lang="ts">
  import type { Snippet } from 'svelte';

  type Size = 'sm' | 'md' | 'lg';

  type Props = {
    size?: Size;
    label: string;
    disabled?: boolean;
    tabindex?: number;
    class?: string;
    title?: string;
    ariaHaspopup?: 'dialog' | 'menu' | 'listbox' | 'tree' | 'grid' | boolean;
    ariaExpanded?: boolean;
    onclick?: (e: MouseEvent) => void;
    children?: Snippet;
  };

  let {
    size = 'md',
    label,
    disabled = false,
    tabindex,
    class: className = '',
    title,
    ariaHaspopup,
    ariaExpanded,
    onclick,
    children,
  }: Props = $props();
</script>

<button
  type="button"
  class="uiv2-round-btn uiv2-round-btn--{size} {className}"
  {disabled}
  {tabindex}
  {title}
  aria-label={label}
  aria-haspopup={ariaHaspopup}
  aria-expanded={ariaExpanded}
  {onclick}
>
  {#if children}
    {@render children()}
  {/if}
</button>
