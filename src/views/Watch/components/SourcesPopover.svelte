<script lang="ts">
  import type { SourceItem } from '../_types';
  import UiV2PopupMenu, { type UiV2PopupMenuItem } from '../../../components/uikit-v2/UiV2PopupMenu.svelte';

  interface Props {
    open: boolean;
    x: number;
    y: number;
    anchor?: HTMLElement | null;
    sources: SourceItem[];
    currentSourceName: string;
    currentSourceId?: string;
    loading: boolean;
    onselect: (src: SourceItem) => void;
    onclose: () => void;
  }

  let {
    open, x, y, anchor = null,
    sources, currentSourceName, currentSourceId = '',
    loading, onselect, onclose,
  }: Props = $props();

  const items = $derived.by((): UiV2PopupMenuItem[] => {
    if (loading) {
      return [{ id: 'loading', label: 'Загрузка…', disabled: true }];
    }
    if (sources.length === 0) {
      return [{ id: 'empty', label: 'Нет источников', disabled: true }];
    }
    return sources.map((src) => ({
      id: `src:${src.id}`,
      label: src.name,
      type: 'radio' as const,
      checked: String(src.id) === String(currentSourceId) || src.name === currentSourceName,
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
  title="Источник"
  wide={sources.some((s) => s.name.length > 18)}
  placement="anchor"
  onClose={onclose}
  onSelect={(id) => {
    if (!id.startsWith('src:')) return;
    const src = sources.find((s) => `src:${s.id}` === id);
    if (src) onselect(src);
  }}
/>
