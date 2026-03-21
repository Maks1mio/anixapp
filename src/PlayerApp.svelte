<script lang="ts">
  import { onMount } from 'svelte';
  import Watch from './views/Watch.svelte';

  onMount(() => {
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
      class="player-titlebar__btn player-titlebar__btn--close"
      aria-label="Закрыть"
      onclick={() => window.electron?.closePlayerWindow?.()}
    ></button>
  </div>
</div>

<div class="player-window__content">
  <Watch />
</div>
