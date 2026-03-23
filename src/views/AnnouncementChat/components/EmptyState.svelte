<script lang="ts">
  type Variant = 'loading' | 'empty';

  interface Props {
    variant: Variant;
    accentColor?: string;
  }

  let { variant, accentColor = 'var(--color-accent)' }: Props = $props();
</script>

<div class="dc-empty">
  {#if variant === 'loading'}
    <span class="dc-empty__spinner" style="--hc: {accentColor}"></span>
    <span class="dc-empty__sub">Загрузка…</span>
  {:else}
    <svg
      width="52"
      height="52"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      stroke-width="1"
      stroke-linecap="round"
      stroke-linejoin="round"
      class="dc-empty__icon"
      style="--hc: {accentColor}"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/>
    </svg>
    <p class="dc-empty__title">Тут пока тихо</p>
    <p class="dc-empty__sub">Начните обсуждение — напишите первое сообщение</p>
  {/if}
</div>

<style lang="scss">
  @use '../../../styles/variables' as *;

  .dc-empty {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 1rem;
    padding: 4rem 2rem;
    color: $color-text-muted;
    text-align: center;
    min-height: 200px;
  }

  .dc-empty__icon {
    color: var(--hc);
    opacity: 0.4;
    transition: opacity 0.25s ease;
  }

  .dc-empty__title {
    margin: 0;
    font-size: 1.15rem;
    font-weight: 600;
    color: $color-text;
    letter-spacing: 0.01em;
  }

  .dc-empty__sub {
    margin: 0;
    font-size: 0.88rem;
    line-height: 1.5;
    max-width: 280px;
  }

  .dc-empty__spinner {
    display: inline-block;
    width: 24px;
    height: 24px;
    border: 2px solid color-mix(in srgb, var(--hc) 30%, transparent);
    border-top-color: var(--hc);
    border-radius: 50%;
    animation: dc-empty-spin 0.65s linear infinite;
    flex-shrink: 0;
  }

  @keyframes dc-empty-spin {
    to { transform: rotate(360deg); }
  }
</style>
