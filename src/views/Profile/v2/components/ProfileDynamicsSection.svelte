<script lang="ts">
  import ProfileDynamics from '../../v1/components/ProfileDynamics.svelte';

  interface Props { watchDynamics: unknown[]; }
  let { watchDynamics }: Props = $props();
</script>

<div class="profile-v2__dynamics">
  <ProfileDynamics {watchDynamics} embedded />
</div>
