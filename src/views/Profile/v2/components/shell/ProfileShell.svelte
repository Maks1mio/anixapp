<script lang="ts">
  import type { Snippet } from 'svelte';

  interface Props {
    modal?: boolean;
    children: Snippet;
    main: Snippet;
  }

  let { modal = false, children, main }: Props = $props();
</script>

<div class="profile-ui__shell" class:profile-ui__shell--modal={modal}>
  <div class="profile-ui__shell-aside">
    {@render children()}
  </div>
  <div class="profile-ui__shell-main">
    {@render main()}
  </div>
</div>
