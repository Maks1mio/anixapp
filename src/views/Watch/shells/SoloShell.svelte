<script lang="ts">
  import PlayerChrome, { type PlayerChromeProps } from './PlayerChrome.svelte';

  let { overlayVisible, ...rest }: PlayerChromeProps = $props();
</script>

<PlayerChrome {...rest} {overlayVisible} />
