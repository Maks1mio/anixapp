<script lang="ts">
  import { untrack } from 'svelte';
  import UiV2Button from '../uikit-v2/UiV2Button.svelte';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from '../uikit-v2/UiV2PopupMenu.svelte';
  import UserAvatar from '../UserAvatar.svelte';
  import FeedDirectoryModal from './FeedDirectoryModal.svelte';
  import { openProfilePanel } from '../../stores/profile-panel';
  import type { FeedChannel } from '../../types/feed';
  import {
    channelAvatarUrl,
    channelCoverUrl,
    channelSubscriberCount,
    formatCompactCount,
    formatFeedRelativeTime,
    ruSubscribersWord,
  } from '../../utils/feed-article';
  import {
    normalizeDirectoryPeople,
    pageableContent,
    type DirectoryPerson,
  } from '../../utils/feed-directory';
  import {
    iconChevronDown,
    iconPencil,
  } from '../icons';
  import {
    buildFeedChannelMenuItems,
    ensureChannelReportReasons,
    getChannelReportReasons,
    runFeedChannelMenuAction,
  } from '../../utils/feed-channel-menu';

  type Props = {
    channel: FeedChannel;
    canWrite?: boolean;
    subscribeBusy?: boolean;
    onSubscribe?: (channelId: number, next: boolean) => void | Promise<void>;
    onWrite?: () => void;
    onMuted?: (channelId: number) => void;
    onUnmuted?: (channelId: number) => void;
  };

  let {
    channel,
    canWrite = false,
    subscribeBusy = false,
    onSubscribe,
    onWrite,
    onMuted,
    onUnmuted,
  }: Props = $props();

  let infoOpen = $state(false);
  let moreOpen = $state(false);
  let moreX = $state(0);
  let moreY = $state(0);
  let reportTick = $state(0);
  let subscribers = $state<DirectoryPerson[]>([]);
  let directoryOpen = $state(false);

  const channelId = $derived(Number(channel.id ?? 0));
  const title = $derived(channel.title?.trim() || (channel.is_blog ? 'Блог' : 'Группа'));
  const cover = $derived(channelCoverUrl(channel.cover));
  const avatar = $derived(channelAvatarUrl(channel.avatar));
  const subs = $derived(channelSubscriberCount(channel));
  const subscribed = $derived(!!channel.is_subscribed);
  const description = $derived((channel.description ?? '').trim());
  const createdLabel = $derived(formatFeedRelativeTime(channel.creation_date));
  const updatedLabel = $derived(formatFeedRelativeTime(channel.last_article_date));
  const infoKicker = $derived.by(() => {
    if (channel.is_blog) return channel.is_verified ? 'Официальный блог' : 'Блог';
    return channel.is_verified ? 'Официальная группа' : 'Группа';
  });
  const statsLabel = $derived.by(() => {
    const parts = [`${formatCompactCount(subs)} ${ruSubscribersWord(subs)}`];
    if (channel.article_count != null) {
      parts.push(`${formatCompactCount(channel.article_count)} записей`);
    }
    return parts.join(' · ');
  });

  const moreItems = $derived.by((): UiV2PopupMenuItem[] => {
    void reportTick;
    return buildFeedChannelMenuItems(channel, getChannelReportReasons());
  });

  async function loadSubscribers(channelId: number): Promise<void> {
    const api = window.anixApi?.search?.channelSubscribers;
    if (!api) {
      subscribers = [];
      return;
    }
    try {
      const res = await api(channelId, 0, '');
      subscribers = normalizeDirectoryPeople(pageableContent(res)).slice(0, 8);
    } catch {
      subscribers = [];
    }
  }

  $effect(() => {
    const id = channelId;
    infoOpen = false;
    moreOpen = false;
    directoryOpen = false;
    if (!(id > 0)) {
      subscribers = [];
      return;
    }
    void untrack(() => loadSubscribers(id));
  });

  function openSubscriber(profileId: number) {
    if (profileId > 0) openProfilePanel(profileId);
  }

  function openMore(e: MouseEvent) {
    const el = e.currentTarget as HTMLElement;
    const r = el.getBoundingClientRect();
    moreX = r.left + r.width / 2;
    moreY = r.bottom;
    moreOpen = !moreOpen;
    if (moreOpen) {
      void ensureChannelReportReasons().then(() => {
        reportTick += 1;
      });
    }
  }

  async function onMoreSelect(menuId: string) {
    moreOpen = false;
    const result = await runFeedChannelMenuAction(menuId, channel);
    if (result.kind === 'muted') onMuted?.(result.channelId);
    if (result.kind === 'unmuted') onUnmuted?.(result.channelId);
  }
</script>

<div class="feed-group">
  <header class="feed-group__hero">
    <div
      class="feed-group__cover"
      class:feed-group__cover--empty={!cover}
      style={cover ? `background-image:url('${cover}')` : undefined}
      aria-hidden="true"
    ></div>
    <div class="feed-group__body">
      <span
        class="feed-group__avatar"
        class:feed-group__avatar--channel={!channel.is_blog}
        class:feed-group__avatar--empty={!avatar}
        style={avatar ? `background-image:url('${avatar}')` : undefined}
        aria-hidden="true"
      ></span>
      <p class="feed-group__kicker">{infoKicker}</p>
      <h2 class="feed-group__title">
        {title}
        {#if channel.is_verified}
          <span class="uiv2-feed-post__verified" title="Подтверждённый канал" aria-hidden="true">✓</span>
        {/if}
      </h2>
      <p class="feed-group__stats">{statsLabel}</p>
      {#if description}
        <p class="feed-group__text" class:feed-group__text--clamp={!infoOpen}>
          {description}
        </p>
      {:else}
        <p class="feed-group__text feed-group__text--muted">Описание не указано.</p>
      {/if}
      {#if infoOpen}
        <ul class="feed-group__facts">
          {#if createdLabel}
            <li>Создана {createdLabel}</li>
          {/if}
          {#if updatedLabel}
            <li>Обновлено {updatedLabel}</li>
          {/if}
        </ul>
      {/if}
      <button
        type="button"
        class="feed-group__more-info"
        aria-expanded={infoOpen}
        onclick={() => { infoOpen = !infoOpen; }}
      >
        {infoOpen ? 'Свернуть' : 'Подробнее'}
      </button>
      <div class="feed-group__actions">
        {#if subscribed}
          <UiV2Button
            variant="chrome"
            size="sm"
            label={subscribeBusy ? 'Отписка…' : 'Отписаться'}
            disabled={subscribeBusy}
            onclick={() => void onSubscribe?.(channel.id, false)}
          />
        {:else}
          <UiV2Button
            variant="primary"
            size="sm"
            label={subscribeBusy ? 'Подписка…' : 'Подписаться'}
            disabled={subscribeBusy}
            onclick={() => void onSubscribe?.(channel.id, true)}
          />
        {/if}
        {#if canWrite}
          <UiV2Button
            variant="chrome"
            size="sm"
            label="Написать"
            onclick={() => onWrite?.()}
          >
            {#snippet icon()}{@html iconPencil(16)}{/snippet}
          </UiV2Button>
        {/if}
        <UiV2Button
          variant="chrome"
          size="sm"
          label="Ещё"
          ariaHaspopup="menu"
          ariaExpanded={moreOpen}
          onclick={openMore}
        >
          {#snippet trailing()}{@html iconChevronDown(14)}{/snippet}
        </UiV2Button>
      </div>
    </div>
  </header>

  <section class="feed-group__card">
    <h3 class="feed-group__card-title-row">
      <span class="feed-group__card-head">
        Подписчики
        <span class="feed-group__count">{formatCompactCount(subs)}</span>
      </span>
      <button
        type="button"
        class="feed-group__all"
        onclick={() => { directoryOpen = true; }}
      >
        Все
      </button>
    </h3>
    {#if subscribers.length > 0}
      <ul class="feed-group__people">
        {#each subscribers as person (person.id)}
          <li>
            <button
              type="button"
              class="feed-group__person"
              title={person.login}
              onclick={() => openSubscriber(person.id)}
            >
              <span class="feed-group__avatar-clip">
                <UserAvatar src={channelAvatarUrl(person.avatar)} label={person.login} />
              </span>
              <span class="feed-group__person-name">{person.login}</span>
            </button>
          </li>
        {/each}
      </ul>
    {:else}
      <p class="feed-group__text feed-group__text--muted">
        Список подписчиков пока недоступен.
      </p>
    {/if}
  </section>
</div>

<UiV2PopupMenu
  open={moreOpen}
  x={moreX}
  y={moreY}
  placement="anchor"
  items={moreItems}
  onClose={() => { moreOpen = false; }}
  onSelect={onMoreSelect}
/>

<FeedDirectoryModal
  open={directoryOpen}
  kind="subscribers"
  channelId={channel.id}
  totalCount={subs}
  onClose={() => { directoryOpen = false; }}
/>
