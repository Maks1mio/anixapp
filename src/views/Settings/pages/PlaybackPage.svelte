<script lang="ts">
  import { onMount } from 'svelte';
  import { renderPlaybackTab } from '../../settings';

  let container: HTMLElement;

  onMount(() => {
    const el = renderPlaybackTab();
    container.appendChild(el);
  });
</script>

<div bind:this={container}></div>
