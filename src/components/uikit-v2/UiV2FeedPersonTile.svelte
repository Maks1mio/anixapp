<script lang="ts">
  import UserAvatar from '../UserAvatar.svelte';
  import UserBadge from '../UserBadge.svelte';

  type Props = {
    title: string;
    avatar?: string | null;
    /** `circle` — пользователь/блог; `channel` — канал. */
    shape?: 'circle' | 'channel';
    /** Красная точка (онлайн / есть новое). */
    showDot?: boolean;
    active?: boolean;
    dimmed?: boolean;
    pinned?: boolean;
    badgeUrl?: string | null;
    badgeName?: string | null;
    ariaLabel?: string;
    ariaPressed?: boolean | null;
    class?: string;
    onclick?: (e: MouseEvent) => void;
  };

  let {
    title,
    avatar = null,
    shape = 'circle',
    showDot = false,
    active = false,
    dimmed = false,
    pinned = false,
    badgeUrl = null,
    badgeName = null,
    ariaLabel,
    ariaPressed = null,
    class: className = '',
    onclick,
  }: Props = $props();

  const showBadge = $derived(!!(badgeUrl?.trim() || badgeName?.trim()));
</script>

<button
  type="button"
  class="uiv2-feed-person feed-subs__item {className}"
  class:feed-subs__item--active={active}
  class:feed-subs__item--dimmed={dimmed}
  class:feed-subs__item--fresh={showDot && !active}
  class:feed-subs__item--pinned={pinned}
  class:uiv2-feed-person--active={active}
  class:uiv2-feed-person--dimmed={dimmed}
  class:uiv2-feed-person--dot={showDot && !active}
  {title}
  aria-label={ariaLabel ?? title}
  aria-pressed={ariaPressed}
  {onclick}
>
  <span class="uiv2-feed-person__avatar-wrap feed-subs__avatar-wrap" aria-hidden="true">
    <span
      class="uiv2-feed-person__avatar feed-subs__avatar"
      class:feed-subs__avatar--channel={shape === 'channel'}
      class:uiv2-feed-person__avatar--channel={shape === 'channel'}
    >
      <UserAvatar src={avatar} label={title} {shape} />
    </span>
    {#if showDot}
      <span class="uiv2-feed-person__dot feed-subs__dot"></span>
    {/if}
  </span>
  <span class="uiv2-feed-person__name feed-subs__name">
    <span class="uiv2-feed-person__label">{title}</span>
    {#if showBadge}
      <UserBadge url={badgeUrl} name={badgeName} size="xs" showTooltip={false} />
    {/if}
  </span>
</button>
