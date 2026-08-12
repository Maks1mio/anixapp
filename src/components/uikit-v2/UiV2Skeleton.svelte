<script lang="ts">
  type Props = {
    class?: string;
    tag?: 'span' | 'div';
    rounded?: 'none' | 'sm' | 'md' | 'lg' | 'pill' | 'full';
    ariaHidden?: boolean;
  };

  let {
    class: className = '',
    tag = 'span',
    rounded = 'md',
    ariaHidden = true,
  }: Props = $props();
</script>

<svelte:element
  this={tag}
  class="uiv2-skeleton uiv2-skeleton--{rounded} {className}"
  aria-hidden={ariaHidden}
></svelte:element>
