<script lang="ts">
  import { iconChevronLeft } from '../icons';
  import UiV2RoundButton from './UiV2RoundButton.svelte';

  export type UiV2BackBarSegment = {
    label: string;
    /** Подсвеченная «текущая» секция */
    active?: boolean;
  };

  type Props = {
    /** Цепочка: сначала текущий экран, затем контекст / наследование */
    segments: UiV2BackBarSegment[];
    backLabel?: string;
    onBack?: () => void;
  };

  let {
    segments,
    backLabel = 'Назад',
    onBack,
  }: Props = $props();
</script>

<div class="uiv2-back-bar" aria-label="Назад">
  <UiV2RoundButton label={backLabel} onclick={onBack}>
    {@html iconChevronLeft(18)}
  </UiV2RoundButton>

  {#if segments.length}
    <div class="uiv2-back-bar__pill">
      <div class="uiv2-back-bar__track">
        {#each segments as seg, i (`${i}-${seg.label}`)}
          {#if i > 0}
            <span class="uiv2-back-bar__sep" aria-hidden="true"></span>
          {/if}
          <span
            class="uiv2-back-bar__seg"
            class:uiv2-back-bar__seg--active={!!seg.active}
            title={seg.label}
          >
            {seg.label}
          </span>
        {/each}
      </div>
    </div>
  {/if}
</div>
