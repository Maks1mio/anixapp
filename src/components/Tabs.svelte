<script lang="ts">
  import type { Snippet } from 'svelte';

  export interface TabItem {
    id: string;
    label: string;
  }

  interface Props {
    tabs: TabItem[];
    activeId: string;
    onChange: (id: string) => void;
    rootClassName?: string;
    rightActions?: Snippet;
  }

  let { tabs, activeId, onChange, rootClassName = 'bookmarks__tabs', rightActions }: Props = $props();

  function handleTabClick(tab: TabItem) {
    if (tab.id === activeId) return;
    onChange(tab.id);
  }
</script>

<div class={rootClassName}>
  {#each tabs as tab (tab.id)}
    <button
      type="button"
      class="bookmarks__tab{tab.id === activeId ? ' bookmarks__tab--active' : ''}"
      data-tab={tab.id}
      onclick={() => handleTabClick(tab)}
    >
      {tab.label}
    </button>
  {/each}
  {@render rightActions?.()}
</div>
