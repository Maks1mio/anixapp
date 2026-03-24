<script lang="ts">
  import { onMount } from 'svelte';
  import { renderConnectionTab } from '../../settings';

  let container: HTMLElement;

  onMount(() => {
    const el = renderConnectionTab();
    container.appendChild(el);
  });
</script>

<div bind:this={container}></div>
