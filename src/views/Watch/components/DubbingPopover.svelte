<script lang="ts">
  import type { DubberItem, DownloadedEpisodeItem } from '../_types';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from '../../../components/uikit-v2/UiV2PopupMenu.svelte';
  import { iconDownload, iconMic, iconPin } from '../../../components/icons';
  import { resolveCdnAssetUrl } from '../../../utils/posterUrl';
  import { formatDubberQuality, isDubberNovelty, sortDubbersPinnedFirst } from '../../../utils/dubber-meta';

  interface Props {
    open: boolean;
    x: number;
    y: number;
    anchor?: HTMLElement | null;
    dubbers: DubberItem[];
    currentDubberId: string;
    currentDubberName?: string;
    loading: boolean;
    lastEpisodeTypeUpdateId?: number | null;
    downloadedEpisodes?: DownloadedEpisodeItem[];
    currentDownloadedPath?: string;
    /** Скрыть блок «Скаченные» (например в комнате совместного просмотра) */
    hideDownloaded?: boolean;
    onselect: (dub: DubberItem) => void;
    onselectDownloadedDub?: (dubberName: string) => void;
    ontogglePin?: (dub: DubberItem) => void | Promise<void>;
    onclose: () => void;
  }

  let {
    open, x, y, anchor = null,
    dubbers, currentDubberId, currentDubberName = '', loading,
    lastEpisodeTypeUpdateId = null,
    downloadedEpisodes = [],
    currentDownloadedPath = '',
    hideDownloaded = false,
    onselect, onselectDownloadedDub, ontogglePin, onclose,
  }: Props = $props();

  const isSub = (d: DubberItem) => d.type === 1 || d.is_sub === true || /субтитр/i.test(d.name);
  const subtitles = $derived(sortDubbersPinnedFirst(dubbers.filter(isSub)));
  const voiceovers = $derived(sortDubbersPinnedFirst(dubbers.filter((d) => !isSub(d))));

  const localDubbers = $derived.by(() => {
    const map = new Map<string, number>();
    for (const d of downloadedEpisodes) {
      const name = (d.dubberName || 'Скаченное').trim() || 'Скаченное';
      map.set(name, (map.get(name) || 0) + 1);
    }
    return [...map.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => a.name.localeCompare(b.name, 'ru'));
  });

  function escapeAttr(s: string): string {
    return s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
  }

  function dubIcon(dub: DubberItem): string {
    if (dub.icon) {
      return `<img src="${escapeAttr(resolveCdnAssetUrl(dub.icon))}" alt="">`;
    }
    return iconMic(18);
  }

  function dubLabel(dub: DubberItem): string {
    const parts = [dub.name];
    if (isDubberNovelty(dub.id, lastEpisodeTypeUpdateId)) parts.push('Новинка');
    const quality = formatDubberQuality(dub.quality);
    if (quality) parts.push(quality);
    return parts.join(' · ');
  }

  function epWord(n: number): string {
    return n === 1 ? 'серия' : n < 5 ? 'серии' : 'серий';
  }

  function dubItem(dub: DubberItem): UiV2PopupMenuItem {
    const pinned = dub.pinned === true;
    return {
      id: `dub:${dub.id}`,
      label: dubLabel(dub),
      type: 'radio',
      checked: String(dub.id) === currentDubberId && !currentDownloadedPath,
      icon: dubIcon(dub),
      keepOpen: false,
      trailingIcon: ontogglePin ? iconPin(14) : (pinned ? iconPin(14) : undefined),
      trailingLabel: pinned ? 'Открепить озвучку' : 'Закрепить озвучку',
      trailingActive: pinned,
    };
  }

  const items = $derived.by((): UiV2PopupMenuItem[] => {
    if (loading) return [];

    const next: UiV2PopupMenuItem[] = [];

    if (!hideDownloaded && localDubbers.length > 0) {
      next.push({ id: 'sec-downloaded', label: 'Скаченные', type: 'label' });
      for (const dub of localDubbers) {
        next.push({
          id: `local-dub:${dub.name}`,
          label: `${dub.name} · ${dub.count} ${epWord(dub.count)}`,
          type: 'radio',
          checked: !!currentDownloadedPath && currentDubberName === dub.name,
          icon: iconDownload(18),
          keepOpen: false,
        });
      }
    }

    if (subtitles.length > 0) {
      next.push({ id: 'sec-sub', label: 'Субтитры', type: 'label' });
      for (const dub of subtitles) next.push(dubItem(dub));
    }

    if (voiceovers.length > 0) {
      next.push({ id: 'sec-voice', label: 'Озвучки', type: 'label' });
      for (const dub of voiceovers) next.push(dubItem(dub));
    }

    if (next.length === 0) {
      return [{ id: 'empty', label: 'Озвучки не найдены', disabled: true }];
    }

    return next;
  });

  function onSelect(id: string) {
    if (id.startsWith('local-dub:')) {
      onselectDownloadedDub?.(id.slice('local-dub:'.length));
      return;
    }
    if (!id.startsWith('dub:')) return;
    const dub = dubbers.find((d) => `dub:${d.id}` === id);
    if (dub) onselect(dub);
  }

  function onTrailingClick(id: string) {
    if (!ontogglePin || !id.startsWith('dub:')) return;
    const dub = dubbers.find((d) => `dub:${d.id}` === id);
    if (dub) void ontogglePin(dub);
  }
</script>

<UiV2PopupMenu
  {open}
  {x}
  {y}
  {anchor}
  {items}
  {loading}
  loadingRows={8}
  title="Выбор"
  searchable={!loading && (dubbers.length > 8 || localDubbers.length > 6)}
  searchPlaceholder="Озвучка…"
  emptyLabel="Нет результатов"
  wide
  placement="anchor"
  onClose={onclose}
  {onSelect}
  {onTrailingClick}
/>
