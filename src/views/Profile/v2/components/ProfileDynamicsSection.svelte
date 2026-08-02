<script lang="ts">
  import ProfileDynamics from '../../v1/components/ProfileDynamics.svelte';

  interface Props {
    watchDynamics: unknown[];
    hideSummary?: boolean;
    hideYLabels?: boolean;
  }
  let { watchDynamics, hideSummary = false, hideYLabels = false }: Props = $props();
</script>

<div class="profile-v2__dynamics">
  <ProfileDynamics {watchDynamics} embedded {hideSummary} {hideYLabels} />
</div>
