<script lang="ts">
  import type { ArticleFormatBlock } from '../../utils/article-block-format';
  import { requestOpenExternal } from '../../utils/external-link';

  type Props = {
    blocks: ArticleFormatBlock[];
    class?: string;
  };

  let { blocks, class: className = '' }: Props = $props();

  function onBlocksClick(e: MouseEvent) {
    const target = e.target;
    if (!(target instanceof Element)) return;
    const anchor = target.closest('a');
    if (!anchor) return;
    const href = anchor.getAttribute('href');
    if (!href) return;
    e.preventDefault();
    e.stopPropagation();
    requestOpenExternal(href);
  }
</script>

{#if blocks.length > 0}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div class="uiv2-article-blocks {className}" onclick={onBlocksClick}>
    {#each blocks as block, i (i)}
      {#if block.kind === 'header'}
        {#if block.level <= 2}
          <h2 class="uiv2-article-blocks__h">{@html block.html}</h2>
        {:else}
          <h3 class="uiv2-article-blocks__h3">{@html block.html}</h3>
        {/if}
      {:else if block.kind === 'quote'}
        <blockquote class="uiv2-article-blocks__quote">
          <p class="uiv2-article-blocks__quote-text">{@html block.html}</p>
          {#if block.captionHtml}
            <cite class="uiv2-article-blocks__quote-caption">{@html block.captionHtml}</cite>
          {/if}
        </blockquote>
      {:else if block.kind === 'list'}
        <ul class="uiv2-article-blocks__list">
          {#each block.itemsHtml as item, j (j)}
            <li>{@html item}</li>
          {/each}
        </ul>
      {:else}
        <p class="uiv2-article-blocks__p">{@html block.html}</p>
      {/if}
    {/each}
  </div>
{/if}
