<script lang="ts">
  import type { Snippet } from 'svelte';
  import ProfileTabNav, { type ProfileTab } from '../ProfileTabNav.svelte';

  interface Props {
    tabs: ProfileTab[];
    activeTab: string;
    onTabChange: (id: string) => void;
    children: Snippet;
    sticky?: boolean;
  }

  let { tabs, activeTab, onTabChange, children, sticky = true }: Props = $props();
</script>

<div class="profile-ui__main">
  {#if tabs.length}
    <header class="profile-ui__main-head" class:profile-ui__main-head--sticky={sticky}>
      <ProfileTabNav tabs={tabs} activeId={activeTab} onChange={onTabChange} />
    </header>
  {/if}
  <div class="profile-ui__main-scroll" role="tabpanel" data-profile-main-scroll>
    <div class="profile-ui__main-panel">
      {@render children()}
    </div>
  </div>
</div>
