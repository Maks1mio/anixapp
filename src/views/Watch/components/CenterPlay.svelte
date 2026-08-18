<script lang="ts">
  import UiV2RoundButton from '../../../components/uikit-v2/UiV2RoundButton.svelte';
  import UiV2Tooltip from '../../../components/uikit-v2/UiV2Tooltip.svelte';
  import { iconPlay } from '../../../components/icons';

  interface Props {
    paused: boolean;
    onplay: () => void;
  }

  let { paused, onplay }: Props = $props();
</script>

<div class="watch-page__center-play" class:watch-page__center-play--hidden={!paused}>
  <UiV2Tooltip text="Воспроизвести" placement="top" showDelay={80}>
    <UiV2RoundButton
      size="lg"
      label="Воспроизвести"
      class="watch-page__center-play-btn"
      onclick={onplay}
    >
      {@html iconPlay(36)}
    </UiV2RoundButton>
  </UiV2Tooltip>
</div>
