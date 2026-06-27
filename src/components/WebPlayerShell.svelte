<script lang="ts">
  import Watch from '../views/Watch.svelte';
  import { navigate } from '../stores/navigation';

  function goBack() {
    const params = new URLSearchParams(window.location.hash.split('?')[1] || window.location.search.slice(1));
    const releaseId = params.get('releaseId');
    if (releaseId) {
      navigate(`/release/${releaseId}`);
      return;
    }
    if (window.history.length > 1) {
      window.history.back();
      return;
    }
    navigate('/');
  }
</script>

<div class="web-player-shell">
  <header class="web-player-shell__bar">
    <button type="button" class="web-player-shell__back" onclick={goBack} aria-label="Назад">
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
        <path d="M19 12H5"/><path d="m12 19-7-7 7-7"/>
      </svg>
      <span>Назад</span>
    </button>
  </header>
  <div class="web-player-shell__content">
    <Watch />
  </div>
</div>

<style lang="scss">
  .web-player-shell {
    display: flex;
    flex-direction: column;
    height: 100%;
    min-height: 100vh;
    background: #000;
    color: #fff;
  }

  .web-player-shell__bar {
    flex: none;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.55rem 0.85rem;
    background: rgba(12, 12, 14, 0.92);
    border-bottom: 1px solid rgba(255, 255, 255, 0.08);
    z-index: 20;
  }

  .web-player-shell__back {
    display: inline-flex;
    align-items: center;
    gap: 0.45rem;
    border: none;
    background: transparent;
    color: inherit;
    font: inherit;
    font-weight: 600;
    cursor: pointer;
    padding: 0.35rem 0.5rem;
    border-radius: 8px;

    &:hover {
      background: rgba(255, 255, 255, 0.08);
    }
  }

  .web-player-shell__content {
    flex: 1;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
