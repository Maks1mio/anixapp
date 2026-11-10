<script lang="ts">
  import type { Snippet } from 'svelte';
  import UiV2Tabs, { type UiV2TabItem } from './uikit-v2/UiV2Tabs.svelte';
  import type { TabSwipeState } from '../actions/swipeTabs';

  export type TabItem = UiV2TabItem;

  interface Props {
    tabs: TabItem[];
    activeId: string;
    onChange: (id: string) => void;
    rootClassName?: string;
    leftActions?: Snippet;
    rightActions?: Snippet;
    onTabContextMenu?: (tab: TabItem, event: MouseEvent) => void;
    swipe?: TabSwipeState;
  }

  let {
    tabs,
    activeId,
    onChange,
    rootClassName = 'bookmarks__tabs',
    leftActions,
    rightActions,
    onTabContextMenu,
    swipe = null,
  }: Props = $props();
</script>

<UiV2Tabs
  {tabs}
  {activeId}
  {onChange}
  {leftActions}
  {rightActions}
  {onTabContextMenu}
  {swipe}
  class={rootClassName}
/>
