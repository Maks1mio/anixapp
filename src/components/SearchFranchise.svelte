<script lang="ts">
  import UiV2SearchFranchise, {
    type UiV2SearchFranchiseData,
  } from './uikit-v2/UiV2SearchFranchise.svelte';

  export type SearchFranchiseData = UiV2SearchFranchiseData;

  interface Props {
    data: SearchFranchiseData;
    onclick?: () => void;
    class?: string;
  }

  let { data, onclick, class: className = '' }: Props = $props();
</script>

<UiV2SearchFranchise {data} {onclick} class={className} />
