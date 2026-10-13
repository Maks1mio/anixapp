<script lang="ts">
  import { prepareEditorSvg } from './prepareEditorSvg';

  type Props = {
    svg: string;
    size?: number;
    class?: string;
  };

  let { svg, size = 18, class: className = '' }: Props = $props();
  const html = $derived(prepareEditorSvg(svg));
</script>

<span
  class="ed-icon {className}"
  style:width="{size}px"
  style:height="{size}px"
  aria-hidden="true"
>{@html html}</span>

<style>
  .ed-icon {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    flex-shrink: 0;
    color: inherit;
    line-height: 0;
    pointer-events: none;
  }
  .ed-icon :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
</style>
