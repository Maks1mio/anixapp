<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import UserBadge from './UserBadge.svelte';
  import { showToast } from '../stores/toast';
  import { openProfilePanel } from '../stores/profile-panel';
  import { resolveBadgeName, resolveProfileBadgeUrl } from '../utils/badge';
  import { resolveCdnAssetUrl } from '../utils/posterUrl';

  type BlockedUser = {
    id: number;
    login: string;
    avatar?: string | null;
    is_online?: boolean;
    badge?: unknown;
  };

  let rootEl = $state<HTMLElement | undefined>();
  let items = $state<BlockedUser[]>([]);
  let listRoot = $state<unknown>(null);
  let page = $state(0);
  let hasMore = $state(true);
  let loading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let busyId = $state(0);

  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;

  function avatarOf(u: BlockedUser): string {
    return u.avatar ? resolveCdnAssetUrl(String(u.avatar)) : '';
  }

  function normalize(raw: unknown): BlockedUser | null {
    if (!raw || typeof raw !== 'object') return null;
    const rec = raw as Record<string, unknown>;
    const id = Number(rec.id ?? 0);
    if (!(id > 0)) return null;
    return {
      id,
      login: typeof rec.login === 'string' && rec.login.trim()
        ? rec.login.trim()
        : `id${id}`,
      avatar: typeof rec.avatar === 'string' ? rec.avatar : null,
      is_online: !!rec.is_online,
      badge: rec.badge,
    };
  }

  async function load(append: boolean) {
    if (!window.anixApi?.profile?.blockList || loading || (!hasMore && append)) return;
    loading = true;
    if (!append) {
      loadState = 'loading';
      page = 0;
      hasMore = true;
      items = [];
      listRoot = null;
    }
    const pageToLoad = page;
    try {
      const data = await window.anixApi.profile.blockList(pageToLoad);
      const content = Array.isArray(data?.content) ? data.content : [];
      const next = content
        .map((row) => normalize(row))
        .filter((row): row is BlockedUser => !!row);
      if (!next.length) {
        if (!append) loadState = 'empty';
        hasMore = false;
        loading = false;
        return;
      }
      listRoot = append ? listRoot ?? data : data;
      items = append ? [...items, ...next] : next;
      loadState = 'ready';
      page += 1;
      hasMore = content.length >= 20;
      loading = false;
      attachScroll();
    } catch (err) {
      if (!append) {
        loadState = 'error';
        showToast(err instanceof Error ? err.message : String(err), 'err');
      }
      loading = false;
    }
  }

  function attachScroll() {
    if (scrollListener) return;
    const el = rootEl?.closest('.page__scroll') as HTMLElement | null
      ?? rootEl?.closest('.profile-panel__scroll') as HTMLElement | null
      ?? rootEl?.parentElement;
    if (!el) return;
    scrollEl = el;
    scrollListener = () => {
      if (!hasMore || loading) return;
      const distance = el.scrollHeight - el.scrollTop - el.clientHeight;
      if (distance < 220) void load(true);
    };
    el.addEventListener('scroll', scrollListener);
  }

  async function unblock(id: number) {
    if (!window.anixApi?.profile?.blockRemove || busyId) return;
    busyId = id;
    try {
      await window.anixApi.profile.blockRemove(id);
      items = items.filter((u) => u.id !== id);
      if (!items.length) loadState = 'empty';
      showToast('Пользователь разблокирован', 'ok');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'err');
    } finally {
      busyId = 0;
    }
  }

  function openUser(id: number, login: string) {
    openProfilePanel(id, { login });
  }

  onMount(() => {
    void load(false);
  });

  onDestroy(() => {
    if (scrollEl && scrollListener) scrollEl.removeEventListener('scroll', scrollListener);
  });
</script>

<div class="profile-panel__settings-list" bind:this={rootEl}>
  <p class="profile-panel__settings-hint">
    Список пользователей, которым запрещён доступ к вашей странице.
  </p>

  {#if loadState === 'loading'}
    <p class="profile-panel__state">Загрузка…</p>
  {:else if loadState === 'error'}
    <div class="profile-panel__state">
      <p>Не удалось загрузить блоклист</p>
      <button type="button" class="profile-panel__retry" onclick={() => void load(false)}>Повторить</button>
    </div>
  {:else if loadState === 'empty'}
    <p class="profile-panel__state">Блоклист пуст</p>
  {:else}
    <ul class="profile-panel__friend-rows" aria-label="Блоклист">
      {#each items as user (user.id)}
        {@const av = avatarOf(user)}
        {@const badgeUrl = resolveProfileBadgeUrl(user, listRoot)}
        <li class="profile-panel__friend-row profile-panel__settings-row">
          <button
            type="button"
            class="profile-panel__friend-row-main"
            onclick={() => openUser(user.id, user.login)}
          >
            <span
              class="profile-panel__friend-row-av"
              class:profile-panel__friend-row-av--online={!!user.is_online}
              style={av ? `background-image:url('${av}')` : undefined}
            ></span>
            <span class="profile-panel__friend-row-meta">
              <span class="profile-panel__friend-row-name">
                {user.login}
                <UserBadge url={badgeUrl} name={resolveBadgeName(user.badge)} size="xs" />
              </span>
            </span>
          </button>
          <button
            type="button"
            class="profile-panel__request-btn"
            disabled={busyId === user.id}
            onclick={() => void unblock(user.id)}
          >Разблокировать</button>
        </li>
      {/each}
    </ul>
    {#if loading}
      <p class="profile-panel__state">Загрузка…</p>
    {/if}
  {/if}
</div>
