<script lang="ts" module>
  /** Контекст: геттер URL аватарки, которую показывают рядом со стрелкой (на Android) */
  export const UIV2_BACK_BAR_AVATAR = 'uiv2-back-bar-avatar';
</script>

<script lang="ts">
  import { getContext } from 'svelte';
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
    /** Аватарка между стрелкой и заголовком; по умолчанию — из контекста UIV2_BACK_BAR_AVATAR */
    avatarUrl?: string;
  };

  let {
    segments,
    backLabel = 'Назад',
    onBack,
    avatarUrl,
  }: Props = $props();

  const avatarCtx = getContext<(() => string) | undefined>(UIV2_BACK_BAR_AVATAR);
  const avatar = $derived(avatarUrl ?? avatarCtx?.() ?? '');
</script>

<div class="uiv2-back-bar" aria-label="Назад">
  <UiV2RoundButton label={backLabel} onclick={onBack}>
    {@html iconChevronLeft(18)}
  </UiV2RoundButton>

  {#if avatar}
    <span class="uiv2-back-bar__avatar" style={`background-image:url('${avatar}')`} aria-hidden="true"></span>
  {/if}

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
          >
            {seg.label}
          </span>
        {/each}
      </div>
    </div>
  {/if}
</div>
