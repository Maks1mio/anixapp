<script lang="ts">
  import { navigate } from '../../stores/navigation';
  import UiV2CommentThread, {
    type UiV2CommentNode,
  } from '../uikit-v2/UiV2CommentThread.svelte';
  import { type OverviewCommentWeekItem } from '../../utils/overview';

  interface Props {
    items: OverviewCommentWeekItem[];
  }

  let { items }: Props = $props();

  const nodes = $derived.by((): UiV2CommentNode[] =>
    items.map((item) => ({
      id: item.id,
      message: item.message,
      timestamp: item.timestamp,
      voteCount: item.voteCount,
      isSpoiler: item.isSpoiler,
      profile: {
        id: 0,
        login: item.profileLogin,
        avatar: item.profileAvatar,
        badgeUrl: item.profileBadgeUrl ?? null,
        badgeName: item.profileBadgeName ?? null,
      },
      releaseId: item.releaseId,
      releaseTitle: item.releaseTitle,
    })),
  );

  function openProfile(node: UiV2CommentNode) {
    if (node.profile.id) navigate(`/profile/${node.profile.id}`);
  }

  function openRelease(node: UiV2CommentNode) {
    if (node.releaseId) navigate(`/release/${node.releaseId}`);
  }
</script>

{#if nodes.length > 0}
  <div class="overview-comments-week">
    <UiV2CommentThread
      nodes={nodes}
      enableInlineReply={false}
      onAuthorClick={openProfile}
      onReleaseClick={openRelease}
    />
  </div>
{/if}
