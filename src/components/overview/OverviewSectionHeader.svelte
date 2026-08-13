<script lang="ts">
  import UiV2SectionHeader from '../uikit-v2/UiV2SectionHeader.svelte';

  interface Props {
    title: string;
    subtitle?: string;
    showAllLabel?: string;
    onShowAll?: () => void;
  }

  let { title, subtitle = '', showAllLabel = 'Показать всё', onShowAll }: Props = $props();
</script>

<UiV2SectionHeader {title} {subtitle} moreLabel={showAllLabel} {onShowAll} />
