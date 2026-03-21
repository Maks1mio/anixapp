<script lang="ts">
  import { onMount } from 'svelte';
  import { renderWatch } from './watch';

  let container: HTMLElement;

  onMount(() => {
    const el = renderWatch();
    container.appendChild(el);
    return () => { container.innerHTML = ''; };
  });
</script>

<div bind:this={container} class="watch-svelte-host"></div>
