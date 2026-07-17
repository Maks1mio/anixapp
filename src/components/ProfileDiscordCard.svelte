<script lang="ts">
  import ProfileSidebar from '../views/Profile/v2/components/shell/ProfileSidebar.svelte';

  interface Props {
    profile: Record<string, unknown>;
    coverUrl: string | null;
    isMyProfile: boolean;
    selfProfileId: number;
    variant?: 'popout' | 'sidebar';
    showFullLink?: boolean;
    onOpenSocial?: (url: string) => void;
  }

  let {
    profile,
    coverUrl,
    isMyProfile,
    selfProfileId,
    variant = 'popout',
    showFullLink = false,
    onOpenSocial,
  }: Props = $props();
</script>

<ProfileSidebar
  {profile}
  {coverUrl}
  {isMyProfile}
  {selfProfileId}
  variant={variant === 'popout' ? 'popout' : 'sidebar'}
  {showFullLink}
  {onOpenSocial}
/>
