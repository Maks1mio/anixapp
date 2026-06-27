<script lang="ts" module>
  const RAW = import.meta.glob('../assets/Monogram/*.svg', {
    eager: true,
    query: '?raw',
    import: 'default',
  }) as Record<string, string>;

  const BY_INDEX = new Map<number, string>();
  for (const [path, svg] of Object.entries(RAW)) {
    const n = Number(path.match(/(\d+)\.svg$/)?.[1] ?? 0);
    if (n) BY_INDEX.set(n, svg);
  }

  export function decorSvg(index: number): string {
    return BY_INDEX.get(index) ?? '';
  }
</script>

<script lang="ts">
  import type { RewindDecor } from '../shared/rewind-scenes';

  interface Props {
    items: RewindDecor[];
  }
  let { items }: Props = $props();
</script>

{#if items.length}
  <div class="rewind-decor" aria-hidden="true">
    {#each items as it, i (i)}
      <span
        class="rewind-decor__item rewind-decor__item--{it.pos}"
        data-decor
        style="--ds:{it.size}vmin; --dc:{it.color}; --dr:{it.rotate ?? 0}deg;"
      >
        {@html decorSvg(it.shape)}
      </span>
    {/each}
  </div>
{/if}

<style>
  .rewind-decor {
    position: absolute;
    inset: 0;
    pointer-events: none;
    overflow: hidden;
    z-index: 1;
  }
  .rewind-decor__item {
    position: absolute;
    width: var(--ds, 20vmin);
    aspect-ratio: 1 / 1;
    transform: rotate(var(--dr, 0deg));
  }
  .rewind-decor__item :global(svg) {
    display: block;
    width: 100%;
    height: 100%;
  }
  .rewind-decor__item :global(svg path),
  .rewind-decor__item :global(svg rect),
  .rewind-decor__item :global(svg circle),
  .rewind-decor__item :global(svg polygon) {
    fill: var(--dc);
  }
  .rewind-decor__item--tl {
    top: -4vmin;
    left: -4vmin;
  }
  .rewind-decor__item--tr {
    top: -4vmin;
    right: -4vmin;
  }
  .rewind-decor__item--bl {
    bottom: -4vmin;
    left: -4vmin;
  }
  .rewind-decor__item--br {
    bottom: -4vmin;
    right: -4vmin;
  }
</style>
