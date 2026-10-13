<script lang="ts">
  /** Выбор размера плейлиста для VLC/mpv на длинных тайтлах. */
  import UiV2ChoiceSheet, { type UiV2ChoiceOption } from './uikit-v2/UiV2ChoiceSheet.svelte';
  import {
    describeExternalPlaylistWindow,
    type ExternalPlaylistWindow,
  } from '../utils/mobile-player';

  interface Props {
    currentEp: number;
    positions: number[];
    onChoose: (window: ExternalPlaylistWindow) => void;
    onClose: () => void;
  }
  let { currentEp, positions, onChoose, onClose }: Props = $props();

  let value = $state<ExternalPlaylistWindow>(50);

  const options = $derived.by((): UiV2ChoiceOption[] => {
    const windows: ExternalPlaylistWindow[] = [50, 100, 'all'];
    return windows.map((w) => {
      const d = describeExternalPlaylistWindow(positions, currentEp, w);
      return { value: w === 'all' ? 'all' : String(w), label: d.label, description: d.description };
    });
  });
</script>

<UiV2ChoiceSheet
  title="Сколько серий подготовить?"
  options={options}
  value={value === 'all' ? 'all' : String(value)}
  cancelLabel="Назад"
  onSelect={(v) => {
    const w: ExternalPlaylistWindow = v === 'all' ? 'all' : (Number(v) === 100 ? 100 : 50);
    value = w;
    onChoose(w);
  }}
  {onClose}
/>
