<script lang="ts">
  import { toasts } from '../stores/toast';
</script>

<div class="toast-container">
  {#each $toasts as t (t.id)}
    <div class="toast toast--{t.type}">
      {#if t.type === 'ok'}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
      {:else if t.type === 'err'}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
      {:else}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><circle cx="12" cy="12" r="9"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
      {/if}
      <span>{t.message}</span>
    </div>
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    bottom: 24px;
    left: 50%;
    transform: translateX(-50%);
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 8px;
    z-index: 10001;
    pointer-events: none;
  }

  .toast {
    display: flex;
    align-items: center;
    gap: 8px;
    padding: 10px 18px;
    border-radius: 10px;
    font-size: 0.875rem;
    font-weight: 500;
    color: #fff;
    backdrop-filter: blur(12px);
    box-shadow: 0 4px 24px rgba(0,0,0,.35);
    animation: toast-in 0.2s ease;
  }

  .toast--ok   { background: rgba(34, 197, 94, 0.88); }
  .toast--err  { background: rgba(239, 68, 68, 0.88); }
  .toast--info { background: rgba(99, 102, 241, 0.88); }

  @keyframes toast-in {
    from { opacity: 0; transform: translateY(10px); }
    to   { opacity: 1; transform: translateY(0); }
  }
</style>
