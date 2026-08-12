<script lang="ts">
  import UserAvatar from '../UserAvatar.svelte';
  import UserBadge from '../UserBadge.svelte';
  import UiV2ScrollArea from './UiV2ScrollArea.svelte';
  import UiV2ReactionsSkeleton from './UiV2ReactionsSkeleton.svelte';
  import { iconCheck, iconChevronDown, iconChevronUp } from '../icons';
  import { resolveCdnAssetUrl } from '../../utils/posterUrl';
  import { resolveBadgeName, resolveProfileBadgeUrl } from '../../utils/badge';
  import { handleUserProfileClick } from '../../stores/user-profile';

  export type UiV2ReactionVote = 'up' | 'down';

  export type UiV2ReactionProfile = {
    id: number;
    login: string;
    avatar?: string | null;
    badgeUrl?: string | null;
    badgeName?: string | null;
    vote: UiV2ReactionVote;
  };

  type Filter = 'all' | 'up' | 'down';

  type Props = {
    commentId: number | string | null;
    onAuthorClick?: (profile: UiV2ReactionProfile) => void;
  };

  let { commentId, onAuthorClick }: Props = $props();

  let filter = $state<Filter>('all');
  let loadState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let errorText = $state('');
  let likes = $state<UiV2ReactionProfile[]>([]);
  let dislikes = $state<UiV2ReactionProfile[]>([]);
  let loadedFor = $state<string | null>(null);

  const FILTERS: { id: Filter; label: string }[] = [
    { id: 'all', label: 'Все оценки' },
    { id: 'up', label: 'Положительные' },
    { id: 'down', label: 'Отрицательные' },
  ];

  function mapProfile(raw: Record<string, unknown>, vote: UiV2ReactionVote): UiV2ReactionProfile | null {
    const id = Number(raw.id ?? 0);
    if (!Number.isFinite(id) || id <= 0) return null;
    return {
      id,
      login: String(raw.login ?? raw.nickname ?? 'Пользователь'),
      avatar: resolveCdnAssetUrl(String(raw.avatar ?? '')),
      badgeUrl: resolveProfileBadgeUrl(raw),
      badgeName: resolveBadgeName(raw.badge) || (typeof raw.badge_name === 'string' ? raw.badge_name : null),
      vote,
    };
  }

  async function fetchVotes(kind: UiV2ReactionVote): Promise<UiV2ReactionProfile[]> {
    const id = typeof commentId === 'number' ? commentId : Number(commentId);
    if (!Number.isFinite(id) || id <= 0) return [];
    if (!window.anixApi?.comments?.release?.votes) {
      throw new Error('API реакций недоступно');
    }
    const sort = kind === 'up' ? 2 : 1;
    const data = await window.anixApi.comments.release.votes(id, 0, sort);
    const content = Array.isArray(data?.content) ? data.content : [];
    return content
      .filter((item): item is Record<string, unknown> => !!item && typeof item === 'object')
      .map((item) => mapProfile(item, kind))
      .filter((item): item is UiV2ReactionProfile => !!item);
  }

  async function loadAll(force = false) {
    const id = typeof commentId === 'number' ? commentId : Number(commentId);
    if (!Number.isFinite(id) || id <= 0) return;

    if (!window.anixApi?.comments?.release?.votes) {
      loadState = 'error';
      errorText = 'API реакций недоступно';
      return;
    }

    const key = String(id);
    if (!force && loadedFor === key) {
      loadState = 'ready';
      return;
    }

    loadState = 'loading';
    errorText = '';
    try {
      const [up, down] = await Promise.all([fetchVotes('up'), fetchVotes('down')]);
      likes = up;
      dislikes = down;
      loadedFor = key;
      loadState = 'ready';
    } catch (e) {
      loadState = 'error';
      errorText = e instanceof Error ? e.message : String(e);
    }
  }

  $effect(() => {
    void commentId;
    filter = 'all';
    void loadAll(true);
  });

  function setFilter(next: Filter, e: MouseEvent) {
    e.stopPropagation();
    e.preventDefault();
    filter = next;
  }

  function openProfile(profile: UiV2ReactionProfile, e: MouseEvent) {
    onAuthorClick?.(profile);
    if (profile.id > 0) handleUserProfileClick(profile.id, e);
  }

  const list = $derived.by((): UiV2ReactionProfile[] => {
    if (filter === 'up') return likes;
    if (filter === 'down') return dislikes;
    return [...likes, ...dislikes];
  });
</script>

<div class="uiv2-reactions" role="group" aria-label="Реакции">
  <ul class="uiv2-reactions__filters" role="listbox" aria-label="Фильтр оценок">
    {#each FILTERS as item (item.id)}
      <li>
        <button
          type="button"
          class="uiv2-reactions__filter"
          class:uiv2-reactions__filter--on={filter === item.id}
          role="option"
          aria-selected={filter === item.id}
          onclick={(e) => setFilter(item.id, e)}
        >
          <span
            class="uiv2-reactions__filter-check"
            class:uiv2-reactions__filter-check--empty={filter !== item.id}
            aria-hidden="true"
          >
            {@html iconCheck(16)}
          </span>
          <span class="uiv2-reactions__filter-label">{item.label}</span>
        </button>
      </li>
    {/each}
  </ul>

  <div class="uiv2-reactions__divider" aria-hidden="true"></div>

  <div class="uiv2-reactions__body">
    <UiV2ScrollArea axis="y" class="uiv2-reactions__scroll">
      {#if loadState === 'loading' || loadState === 'idle'}
        <UiV2ReactionsSkeleton count={6} />
      {:else if loadState === 'error'}
        <p class="uiv2-reactions__state uiv2-reactions__state--error">{errorText}</p>
      {:else if list.length === 0}
        <p class="uiv2-reactions__state">Пока пусто</p>
      {:else}
        <ul class="uiv2-reactions__list">
          {#each list as profile (`${profile.vote}-${profile.id}`)}
            <li>
              <button
                type="button"
                class="uiv2-reactions__row"
                onclick={(e) => {
                  e.stopPropagation();
                  openProfile(profile, e);
                }}
              >
                <span class="uiv2-reactions__avatar">
                  <UserAvatar src={profile.avatar} label={profile.login} />
                </span>
                <span class="uiv2-reactions__login">
                  {profile.login}
                  <UserBadge url={profile.badgeUrl} name={profile.badgeName} size="xs" />
                </span>
                <span
                  class="uiv2-reactions__vote"
                  class:uiv2-reactions__vote--up={profile.vote === 'up'}
                  class:uiv2-reactions__vote--down={profile.vote === 'down'}
                  aria-hidden="true"
                >
                  {#if profile.vote === 'up'}
                    {@html iconChevronUp(16)}
                  {:else}
                    {@html iconChevronDown(16)}
                  {/if}
                </span>
              </button>
            </li>
          {/each}
        </ul>
      {/if}
    </UiV2ScrollArea>
  </div>
</div>
