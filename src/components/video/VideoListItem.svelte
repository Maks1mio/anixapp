<script lang="ts">
  /**
   * Видео строкой, как в Anixart (item_video_list): превью 16:9 со значком хостинга,
   * название в две строки и «⋮», ниже «автор • дата», релиз и категория.
   * «⋮» — меню как bottom_sheet_release_video: к релизу, открыть в…, копировать ссылку, к себе / убрать.
   */
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from '../uikit-v2/UiV2PopupMenu.svelte';
  import { iconExternalLink, iconInfo, iconLink, iconMinus, iconMoreVertical, iconPlus } from '../icons';
  import { navigate } from '../../stores/navigation';
  import { requireAuth } from '../../stores/auth';
  import { showToast } from '../../stores/toast';
  import { requestOpenExternal } from '../../utils/external-link';
  import { formatCommentTimestamp } from '../../utils/comment';
  import type { ReleaseVideoItem } from '../../views/Release/_videoUtils';

  interface Props {
    video: ReleaseVideoItem;
    /** Видео убрано «от себя» — список может его скрыть */
    onFavoriteChange?: (video: ReleaseVideoItem, isFavorite: boolean) => void;
  }

  let { video, onFavoriteChange }: Props = $props();

  let menuOpen = $state(false);
  let moreEl = $state<HTMLButtonElement | null>(null);
  let favorite = $state<boolean | null>(null);
  let busy = $state(false);

  const isFavorite = $derived(favorite ?? !!video.isFavorite);
  const title = $derived(video.title.trim() || 'Без названия');
  const author = $derived(video.profile?.login || video.profile?.nickname || '');
  const date = $derived(video.timestamp ? formatCommentTimestamp(video.timestamp) : '');
  const metaLine = $derived([author, date].filter(Boolean).join(' • '));

  const description = $derived(
    [metaLine, video.release?.title ?? '', video.category?.name ?? ''].filter(Boolean),
  );

  const menuItems = $derived<UiV2PopupMenuItem[]>([
    ...(video.release ? [{ id: 'release', label: 'Перейти к релизу', icon: iconInfo(18) }] : []),
    { id: 'open', label: 'Открыть в…', icon: iconExternalLink(18) },
    { id: 'copy', label: 'Скопировать ссылку', icon: iconLink(18) },
    isFavorite
      ? { id: 'unfav', label: 'Убрать от себя', icon: iconMinus(18) }
      : { id: 'fav', label: 'Добавить к себе', icon: iconPlus(18) },
  ]);

  function open() {
    if (video.url) requestOpenExternal(video.url);
  }

  async function toggleFavorite(next: boolean) {
    if (!requireAuth() || busy) return;
    const api = window.anixApi?.profile;
    const call = next ? api?.addFavoriteVideo : api?.removeFavoriteVideo;
    if (!call) {
      showToast('Недоступно в этой версии', 'err');
      return;
    }
    busy = true;
    try {
      const res = await call(video.id);
      if (res && res.code != null && res.code !== 0) throw new Error(String(res.code));
      favorite = next;
      onFavoriteChange?.(video, next);
      showToast(next ? 'Видео добавлено к себе' : 'Видео убрано');
    } catch {
      showToast('Не удалось изменить', 'err');
    } finally {
      busy = false;
    }
  }

  async function onSelect(id: string) {
    menuOpen = false;
    if (id === 'release' && video.release) navigate(`/release/${video.release.id}`);
    else if (id === 'open') open();
    else if (id === 'copy') {
      try {
        await navigator.clipboard.writeText(video.url);
        showToast('Скопировано');
      } catch {
        showToast('Не удалось скопировать', 'err');
      }
    } else if (id === 'fav') void toggleFavorite(true);
    else if (id === 'unfav') void toggleFavorite(false);
  }
</script>

<div class="video-row">
  <button type="button" class="video-row__main" onclick={open}>
    <span class="video-row__thumb">
      {#if video.image}<img src={video.image} alt="" loading="lazy" referrerpolicy="no-referrer" />{/if}
      {#if video.hosting?.icon}
        <img class="video-row__hosting" src={video.hosting.icon} alt={video.hosting.name} loading="lazy" referrerpolicy="no-referrer" />
      {/if}
    </span>
    <span class="video-row__info">
      <span class="video-row__title">{title}</span>
      {#if metaLine}<span class="video-row__meta">{metaLine}</span>{/if}
      {#if video.release?.title}<span class="video-row__meta">{video.release.title}</span>{/if}
      {#if video.category?.name}<span class="video-row__meta">{video.category.name}</span>{/if}
    </span>
  </button>
  <button
    bind:this={moreEl}
    type="button"
    class="video-row__more"
    aria-label="Действия с видео"
    aria-haspopup="menu"
    aria-expanded={menuOpen}
    onclick={() => { menuOpen = !menuOpen; }}
  >{@html iconMoreVertical(20)}</button>
</div>

<UiV2PopupMenu
  open={menuOpen}
  x={0}
  y={0}
  dropdown
  placement="anchor"
  anchor={moreEl}
  {title}
  {description}
  items={menuItems}
  onClose={() => { menuOpen = false; }}
  onSelect={(id) => void onSelect(id)}
/>

<style lang="scss">
  .video-row {
    position: relative;
    display: flex;
    align-items: flex-start;
    gap: 0.25rem;
    min-width: 0;
  }

  .video-row__main {
    display: flex;
    flex: 1;
    align-items: flex-start;
    gap: 1rem;
    min-width: 0;
    padding: 0;
    border: 0;
    background: none;
    color: inherit;
    font: inherit;
    text-align: left;
    cursor: pointer;

    &:hover .video-row__title {
      color: var(--uikit-v2-text);
    }

    &:active .video-row__thumb {
      transform: scale(0.98);
    }
  }

  .video-row__thumb {
    position: relative;
    flex: none;
    width: 168px;
    aspect-ratio: 168 / 93;
    overflow: hidden;
    border-radius: 12px;
    background: color-mix(in srgb, var(--uikit-v2-text) 8%, transparent);
    transition: transform 0.15s ease;

    > img:first-child {
      width: 100%;
      height: 100%;
      object-fit: cover;
      display: block;
    }
  }

  .video-row__hosting {
    position: absolute;
    top: 8px;
    left: 8px;
    width: 20px;
    height: 20px;
    object-fit: contain;
  }

  .video-row__info {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
    padding-top: 0.1rem;
  }

  .video-row__title {
    display: -webkit-box;
    overflow: hidden;
    margin-bottom: 0.3rem;
    color: var(--uikit-v2-text);
    font-size: 1rem;
    font-weight: 500;
    line-height: 1.3;
    -webkit-box-orient: vertical;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    word-break: break-word;
  }

  .video-row__meta {
    overflow: hidden;
    color: var(--uiv2-fg-muted);
    font-size: 0.75rem;
    line-height: 1.35;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .video-row__more {
    display: grid;
    flex: none;
    place-items: center;
    width: 2rem;
    height: 2rem;
    margin: -0.2rem -0.4rem 0 0;
    padding: 0;
    border: 0;
    border-radius: 50%;
    background: none;
    color: var(--uiv2-fg-muted);
    cursor: pointer;

    &:hover,
    &[aria-expanded='true'] {
      background: color-mix(in srgb, var(--uikit-v2-text) 8%, transparent);
      color: var(--uikit-v2-text);
    }
  }

  :global(html.mobile-mode) {
    .video-row__thumb {
      width: 42%;
      max-width: 200px;
      border-radius: 16px;
    }

    .video-row__title {
      font: 400 16px/1.3 var(--m-font);
      color: var(--m-text);
    }

    .video-row__meta {
      font: 400 13px/1.35 var(--m-font);
      color: var(--m-text-2);
    }

    .video-row__more {
      width: 40px;
      height: 40px;
      margin: -8px -10px 0 0;
      color: var(--m-text-2);
    }
  }
</style>
