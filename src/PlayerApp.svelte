<script lang="ts">
  import { onMount } from 'svelte';
  import Watch from './views/Watch.svelte';
  import { initTooltipSystem } from './utils/body-tooltip';

  let pinned = $state(false);

  async function togglePin() {
    const next = await window.electron?.togglePlayerAlwaysOnTop?.();
    pinned = !!next;
  }

  onMount(() => {
    initTooltipSystem();
    document.getElementById('app')?.classList.add('app--player-window');

    const onFullscreen = ((e: CustomEvent<boolean>) => {
      document.body.classList.toggle('player-fullscreen', e.detail === true);
    }) as EventListener;

    window.addEventListener('player-fullscreen', onFullscreen);
    return () => window.removeEventListener('player-fullscreen', onFullscreen);
  });
</script>

<div class="player-titlebar">
  <div class="player-titlebar__drag">
    <span class="player-titlebar__logo" aria-hidden="true">
      <img src="logo/512x512.png" alt="" class="player-titlebar__logo-img" />
    </span>
    <span class="player-titlebar__title">AnixApp</span>
  </div>
  <div class="player-titlebar__controls">
    <button
      type="button"
      class="player-titlebar__btn player-titlebar__btn--pin"
      class:player-titlebar__btn--pin-active={pinned}
      title={pinned ? 'Открепить окно' : 'Поверх всех окон'}
      onclick={togglePin}
    >
      {#if pinned}
        <!-- PinOff -->
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 17v5"/>
          <path d="M15 9.34V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H7.89"/>
          <path d="m2 2 20 20"/>
          <path d="M9 9v1.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h11"/>
        </svg>
      {:else}
        <!-- Pin -->
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
          <path d="M12 17v5"/>
          <path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"/>
        </svg>
      {/if}
    </button>
    <button
      type="button"
      class="player-titlebar__btn player-titlebar__btn--close"
      aria-label="Закрыть"
      onclick={() => window.electron?.closePlayerWindow?.()}
    ></button>
  </div>
</div>

<div class="player-window__content">
  <Watch />
</div>
