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
    loading: boolean;
    lastEpisodeTypeUpdateId?: number | null;
    downloadedEpisodes?: DownloadedEpisodeItem[];
    currentDownloadedPath?: string;
    onselect: (dub: DubberItem) => void;
    onselectDownloadedMode?: () => void;
    ontogglePin?: (dub: DubberItem) => void | Promise<void>;
    onclose: () => void;
  }

  let {
    open, x, y, anchor = null,
    dubbers, currentDubberId, loading,
    lastEpisodeTypeUpdateId = null,
    downloadedEpisodes = [],
    currentDownloadedPath = '',
    onselect, onselectDownloadedMode, ontogglePin, onclose,
  }: Props = $props();

  const isSub = (d: DubberItem) => d.type === 1 || d.is_sub === true || /субтитр/i.test(d.name);
  const subtitles = $derived(sortDubbersPinnedFirst(dubbers.filter(isSub)));
  const voiceovers = $derived(sortDubbersPinnedFirst(dubbers.filter((d) => !isSub(d))));

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
    if (loading) {
      return [{ id: 'loading', label: 'Загрузка…', disabled: true }];
    }

    const next: UiV2PopupMenuItem[] = [];

    if (downloadedEpisodes.length > 0) {
      const n = downloadedEpisodes.length;
      next.push({ id: 'sec-downloaded', label: 'Скаченные', type: 'label' });
      next.push({
        id: 'downloaded',
        label: `Скаченное · ${n} ${n === 1 ? 'серия' : n < 5 ? 'серии' : 'серий'}`,
        type: 'radio',
        checked: !!currentDownloadedPath,
        icon: iconDownload(18),
        keepOpen: false,
      });
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
    if (id === 'downloaded') {
      onselectDownloadedMode?.();
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
  title="Выбор"
  searchable={dubbers.length > 8}
  searchPlaceholder="Озвучка…"
  emptyLabel="Нет результатов"
  wide
  placement="anchor"
  onClose={onclose}
  {onSelect}
  {onTrailingClick}
/>
