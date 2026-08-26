<script lang="ts">
  import type { EpisodeItem } from '../_types';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from '../../../components/uikit-v2/UiV2PopupMenu.svelte';
  import { iconCircleCheck, iconDownload } from '../../../components/icons';
  import { episodeDisplayLabel } from '../../../utils/episode-display';

  interface Props {
    open: boolean;
    x: number;
    y: number;
    anchor?: HTMLElement | null;
    episodes: EpisodeItem[];
    currentEp: number;
    loading: boolean;
    downloadedPositions?: number[];
    localMode?: boolean;
    onselect: (ep: number) => void;
    onclose: () => void;
  }

  let {
    open, x, y, anchor = null,
    episodes, currentEp, loading,
    downloadedPositions = [],
    localMode = false,
    onselect, onclose,
  }: Props = $props();

  const downloadedSet = $derived(new Set(downloadedPositions));

  const baseEpisodes = $derived.by(() => {
    if (localMode) {
      // В локальном режиме не подмешиваем онлайн-серии тайтла
      const fromApi = episodes.filter((e) => downloadedSet.has(e.position));
      if (fromApi.length > 0) {
        return [...fromApi].sort((a, b) => a.position - b.position);
      }
      return downloadedPositions
        .map((position) => ({ position, name: position > 0 ? `Серия ${position}` : 'Локальный файл' }))
        .sort((a, b) => a.position - b.position);
    }
    return episodes;
  });

  const headerTitle = $derived(
    localMode && downloadedPositions.length > 0
      ? (() => {
          const n = downloadedPositions.length;
          return `${n} ${n === 1 ? 'скачана' : n < 5 ? 'скачаны' : 'скачано'}`;
        })()
      : episodes.length > 0
        ? `${episodes.length} серий`
        : 'Серии',
  );

  function episodeIcon(ep: EpisodeItem): string | undefined {
    if (localMode && downloadedSet.has(ep.position)) return iconDownload(18);
    if (ep.is_watched) {
      return `<span style="color:#22c55e">${iconCircleCheck(18)}</span>`;
    }
    return undefined;
  }

  const items = $derived.by((): UiV2PopupMenuItem[] => {
    if (loading) return [];
    if (localMode && downloadedPositions.length === 0) {
      return [{ id: 'empty-local', label: 'Нет скачанных серий', disabled: true }];
    }
    return baseEpisodes.map((ep) => ({
      id: `ep:${ep.position}`,
      label: episodeDisplayLabel(ep, baseEpisodes),
      type: 'radio' as const,
      checked: ep.position === currentEp,
      icon: episodeIcon(ep),
      keepOpen: false,
    }));
  });
</script>

<UiV2PopupMenu
  {open}
  {x}
  {y}
  {anchor}
  {items}
  {loading}
  loadingRows={8}
  title={loading ? 'Серии' : headerTitle}
  searchable={!loading}
  searchPlaceholder="Номер серии…"
  searchInputMode="numeric"
  emptyLabel="Нет результатов"
  wide
  placement="anchor"
  onClose={onclose}
  onSelect={(id) => {
    if (!id.startsWith('ep:')) return;
    const n = Number(id.slice(3));
    if (Number.isFinite(n)) onselect(n);
  }}
/>
