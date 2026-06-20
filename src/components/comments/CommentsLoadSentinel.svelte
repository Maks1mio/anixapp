<script lang="ts">
  import { infiniteScroll } from '../../actions/infiniteScroll';

  interface Props {
    hasMore: boolean;
    loading: boolean;
    onLoad: () => void;
    scrollRoot?: HTMLElement | null;
  }

  let {
    hasMore,
    loading,
    onLoad,
    scrollRoot = null,
  }: Props = $props();
</script>

{#if hasMore || loading}
  <div
    class="anix-comments__load-sentinel"
    aria-hidden="true"
    use:infiniteScroll={{
      onLoad,
      enabled: () => hasMore && !loading,
      root: scrollRoot,
    }}
  >
    {#if loading}
      <span class="anix-comments__load-status">Загрузка…</span>
    {/if}
  </div>
{/if}
