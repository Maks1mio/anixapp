<script lang="ts">
  import { PROFILE_PRIVACY_NOTICE } from '../profile-privacy';

  interface Props {
    class?: string;
  }

  let { class: className = '' }: Props = $props();
</script>

<p class="profile-ui__privacy{className ? ` ${className}` : ''}" role="note">
  {PROFILE_PRIVACY_NOTICE}
</p>
