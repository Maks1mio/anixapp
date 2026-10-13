<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { showToast } from '../stores/toast';
  import { navigate } from '../stores/navigation';
  import { closeProfilePanel } from '../stores/profile-panel';
  import { channelAvatarUrl } from '../utils/feed-article';
  import { resolveCdnAssetUrl } from '../utils/posterUrl';

  type MutedChannel = {
    id: number;
    title: string;
    avatar?: string | null;
    is_blog?: boolean;
    subscriber_count?: number;
  };

  let rootEl = $state<HTMLElement | undefined>();
  let items = $state<MutedChannel[]>([]);
  let page = $state(0);
  let hasMore = $state(true);
  let loading = $state(false);
  let loadState = $state<'loading' | 'error' | 'empty' | 'ready'>('loading');
  let busyId = $state(0);

  let scrollEl: HTMLElement | null = null;
  let scrollListener: (() => void) | null = null;

  function avatarOf(ch: MutedChannel): string {
    const raw = channelAvatarUrl(ch.avatar) || String(ch.avatar ?? '').trim();
    return raw ? (resolveCdnAssetUrl(raw) || raw) : '';
  }

  function normalize(raw: unknown): MutedChannel | null {
    if (!raw || typeof raw !== 'object') return null;
    const rec = raw as Record<string, unknown>;
    const id = Number(rec.id ?? 0);
    if (!(id > 0)) return null;
    return {
      id,
      title: typeof rec.title === 'string' && rec.title.trim()
        ? rec.title.trim()
        : `Канал #${id}`,
      avatar: typeof rec.avatar === 'string' ? rec.avatar : null,
      is_blog: !!rec.is_blog,
      subscriber_count: Number(rec.subscriber_count ?? 0) || undefined,
    };
  }

  async function load(append: boolean) {
    if (!window.anixApi?.channel?.mutes || loading || (!hasMore && append)) return;
    loading = true;
    if (!append) {
      loadState = 'loading';
      page = 0;
      hasMore = true;
      items = [];
    }
    const pageToLoad = page;
    try {
      const data = await window.anixApi.channel.mutes(pageToLoad);
      const content = Array.isArray(data?.content) ? data.content : [];
      const next = content
        .map((row) => normalize(row))
        .filter((row): row is MutedChannel => !!row);
      if (!next.length) {
        if (!append) loadState = 'empty';
        hasMore = false;
        loading = false;
        return;
      }
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

  async function unmute(id: number) {
    if (!window.anixApi?.channel?.unmute || busyId) return;
    busyId = id;
    try {
      await window.anixApi.channel.unmute(id);
      items = items.filter((ch) => ch.id !== id);
      if (!items.length) loadState = 'empty';
      showToast('Канал снова виден в ленте', 'ok');
    } catch (err) {
      showToast(err instanceof Error ? err.message : String(err), 'err');
    } finally {
      busyId = 0;
    }
  }

  function openChannel(id: number) {
    closeProfilePanel();
    navigate(`/channel/${id}`);
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
    Каналы и блоги, которые вы скрыли из ленты. Их записи снова появятся после отмены скрытия.
  </p>

  {#if loadState === 'loading'}
    <p class="profile-panel__state">Загрузка…</p>
  {:else if loadState === 'error'}
    <div class="profile-panel__state">
      <p>Не удалось загрузить список</p>
      <button type="button" class="profile-panel__retry" onclick={() => void load(false)}>Повторить</button>
    </div>
  {:else if loadState === 'empty'}
    <p class="profile-panel__state">Скрытых каналов нет</p>
  {:else}
    <ul class="profile-panel__friend-rows" aria-label="Скрытые каналы">
      {#each items as ch (ch.id)}
        {@const av = avatarOf(ch)}
        <li class="profile-panel__friend-row profile-panel__settings-row">
          <button
            type="button"
            class="profile-panel__friend-row-main"
            onclick={() => openChannel(ch.id)}
          >
            <span
              class="profile-panel__friend-row-av"
              class:profile-panel__friend-row-av--channel={!ch.is_blog}
              style={av ? `background-image:url('${av}')` : undefined}
            ></span>
            <span class="profile-panel__friend-row-meta">
              <span class="profile-panel__friend-row-name">{ch.title}</span>
              <span class="profile-panel__friend-row-sub">
                {ch.is_blog ? 'Блог' : 'Канал'}
              </span>
            </span>
          </button>
          <button
            type="button"
            class="profile-panel__request-btn"
            disabled={busyId === ch.id}
            onclick={() => void unmute(ch.id)}
          >Показать</button>
        </li>
      {/each}
    </ul>
    {#if loading}
      <p class="profile-panel__state">Загрузка…</p>
    {/if}
  {/if}
</div>
