<script lang="ts">
  type Props = {
    count: number;
    onOpen?: () => void;
  };

  let { count, onOpen }: Props = $props();

  const label = $derived(
    count > 99 ? '99+' : String(Math.max(0, Math.floor(count))),
  );
</script>

<button
  type="button"
  class="feed-suggestions-nav"
  onclick={() => onOpen?.()}
>
  <span class="feed-suggestions-nav__badge" aria-hidden="true">{label}</span>
  <span class="feed-suggestions-nav__text">Показать предложенные записи</span>
</button>
