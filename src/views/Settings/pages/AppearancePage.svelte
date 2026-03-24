<script lang="ts">
  import { onMount } from 'svelte';
  import { renderAppearanceTab } from '../../settings';

  let container: HTMLElement;

  onMount(() => {
    const el = renderAppearanceTab();
    container.appendChild(el);
  });
</script>

<div bind:this={container}></div>
