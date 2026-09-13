<script lang="ts">
  import { channelAvatarUrl } from '../../utils/feed-article';

  type Props = {
    title: string;
    subtitle?: string;
    time?: string;
    avatar?: string | null;
    isBlog?: boolean;
    isPost?: boolean;
    onOpen?: () => void;
  };

  let {
    title,
    subtitle = '',
    time = '',
    avatar = null,
    isBlog = false,
    isPost = false,
    onOpen,
  }: Props = $props();

  const src = $derived(channelAvatarUrl(avatar));
  const meta = $derived([subtitle, time].filter(Boolean).join(' · '));
</script>

<button
  type="button"
  class="feed-history-moment"
  class:feed-history-moment--post={isPost}
  aria-label={meta ? `${meta}: ${title}` : title}
  onclick={() => onOpen?.()}
>
  <span
    class="feed-history-moment__avatar"
    class:feed-history-moment__avatar--channel={!isBlog}
    class:feed-history-moment__avatar--empty={!src}
    class:feed-history-moment__avatar--post={isPost}
    style={src ? `background-image:url('${src}')` : undefined}
    aria-hidden="true"
  ></span>
  <span class="feed-history-moment__meta">
    <span class="feed-history-moment__title">{title}</span>
    {#if meta}
      <span class="feed-history-moment__sub">{meta}</span>
    {/if}
  </span>
</button>
