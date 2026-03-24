<script lang="ts">
  import { onMount } from 'svelte';
  import { renderBehaviorTab } from '../../settings';

  let container: HTMLElement;

  onMount(() => {
    const el = renderBehaviorTab();
    container.appendChild(el);
  });
</script>

<div bind:this={container}></div>
