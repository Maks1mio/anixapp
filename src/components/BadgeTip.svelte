<script lang="ts">
  /**
   * Подсказка значка: крупное превью + название. Оборачивает любой значок
   * (Anixart — `url`, Lottie тоже; AnixApp/anixback — готовый `imageSrc`).
   */
  import type { Snippet } from 'svelte';
  import UiV2Tooltip from './uikit-v2/UiV2Tooltip.svelte';
  import UserBadge from './UserBadge.svelte';

  type Props = {
    name: string;
    /** URL значка Anixart (картинка или Lottie .json) */
    url?: string | null;
    /** Готовый src картинки (значки AnixApp) */
    imageSrc?: string | null;
    onhover?: () => void;
    children: Snippet;
  };

  let { name, url = null, imageSrc = null, onhover, children }: Props = $props();
</script>

{#snippet preview()}
  <span class="badge-tip">
    {#if imageSrc}
      <img class="badge-tip__img" src={imageSrc} alt="" decoding="async" />
    {:else if url}
      <UserBadge {url} {name} size="xl" showTooltip={false} />
    {/if}
    <span class="badge-tip__name">{name}</span>
  </span>
{/snippet}

<UiV2Tooltip content={preview} placement="top" showDelay={180} class="badge-tip-trigger">
  <!-- svelte-ignore a11y_no_static_element_interactions -->
  <span class="badge-tip-hover" onmouseenter={onhover}>{@render children()}</span>
</UiV2Tooltip>

<style>
  :global(.badge-tip-trigger.uiv2-tooltip__trigger) {
    flex-shrink: 0;
    align-items: center;
    vertical-align: middle;
    max-width: none;
  }

  .badge-tip-hover {
    display: inline-flex;
    align-items: center;
    line-height: 0;
  }

  .badge-tip {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.4rem;
    padding: 0.25rem 0.15rem 0.1rem;
    max-width: 12rem;
    text-align: center;
  }

  .badge-tip__img {
    width: 4.5rem;
    height: 4.5rem;
    object-fit: contain;
  }

  .badge-tip__name {
    font-weight: 600;
    line-height: 1.25;
  }
</style>
