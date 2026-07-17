<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { getProfileLayout, type ProfileLayout } from '../../prefs';
  import ProfileV1 from './v1/page.svelte';
  import ProfileV2 from './v2/page.svelte';

  interface Props { id?: number; embedded?: boolean; discordLayout?: boolean; }
  let { id, embedded = false, discordLayout = false }: Props = $props();

  let layout = $state<ProfileLayout>(getProfileLayout());

  function onLayoutChanged(e: Event) {
    const next = (e as CustomEvent<{ layout?: ProfileLayout }>).detail?.layout;
    if (next === 'classic' || next === 'v2') layout = next;
  }

  onMount(() => {
    layout = getProfileLayout();
    window.addEventListener('anix:profileLayoutChanged', onLayoutChanged);
  });

  onDestroy(() => {
    window.removeEventListener('anix:profileLayoutChanged', onLayoutChanged);
  });
</script>

{#if discordLayout}
  <ProfileV2 {id} {embedded} {discordLayout} />
{:else if layout === 'classic'}
  <ProfileV1 {id} {embedded} />
{:else}
  <ProfileV2 {id} {embedded} {discordLayout} />
{/if}
