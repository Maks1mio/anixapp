<script lang="ts">
  import UserBadge from '../UserBadge.svelte';
  import { iconCheck, iconPin } from '../icons';
  import type { ApiBadge } from '../../types/api';
  import { badgeImage, badgeRarity, badgeSubtitle } from '../../utils/badge-collection';

  interface Props {
    badge: ApiBadge;
    /** Значок стоит у ника */
    selected?: boolean;
    /** Компактная плитка без подписи (витрина, недавние) */
    compact?: boolean;
    disabled?: boolean;
    /** Значки релиза: неполученные размыты (в коллекции профиля is_owned не используется) */
    hideUnowned?: boolean;
    onclick?: (badge: ApiBadge) => void;
  }

  let { badge, selected = false, compact = false, disabled = false, hideUnowned = false, onclick }: Props = $props();

  const rarity = $derived(badgeRarity(badge));
  // Как SpoilerLayout в приложении (ReleaseBadgesUiController)
  const hidden = $derived(hideUnowned && badge.is_owned === false);
  const image = $derived(badgeImage(badge, compact ? 'anim' : 'static'));
  const subtitle = $derived(hidden ? '' : badgeSubtitle(badge));
  const name = $derived(hidden ? 'Скрытый значок' : badge.name?.trim() || 'Без названия');
</script>

<button
  type="button"
  class="badge-tile badge-tile--{rarity.toLowerCase()}"
  class:badge-tile--compact={compact}
  class:badge-tile--selected={selected}
  class:badge-tile--hidden={hidden}
  {disabled}
  aria-label={name}
  aria-pressed={selected}
  onclick={() => onclick?.(badge)}
>
  <span class="badge-tile__icon">
    {#if image}
      <UserBadge url={image} name={name} size="lg" class="badge-tile__img" showTooltip={false} />
    {:else}
      <span class="badge-tile__img badge-tile__img--empty" aria-hidden="true"></span>
    {/if}
    {#if badge.is_showcased}
      <span class="badge-tile__mark badge-tile__mark--pin" title="На витрине" aria-hidden="true">
        {@html iconPin(11)}
      </span>
    {/if}
    {#if selected}
      <span class="badge-tile__mark badge-tile__mark--check" title="Установлен" aria-hidden="true">
        {@html iconCheck(11)}
      </span>
    {/if}
  </span>
  {#if !compact}
    <span class="badge-tile__name">{name}</span>
    {#if subtitle}
      <span class="badge-tile__sub">{subtitle}</span>
    {/if}
  {/if}
</button>

<style lang="scss">
  .badge-tile {
    --badge-rarity: var(--badge-rarity-common);
    --badge-bg-mix: 0%;
    --badge-border-mix: 11%;

    position: relative;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.3rem;
    min-width: 0;
    padding: 0.75rem 0.45rem 0.65rem;
    border: 1px solid color-mix(in srgb, var(--badge-rarity) var(--badge-border-mix), var(--uiv2-border-subtle));
    border-radius: 14px;
    background:
      radial-gradient(120% 90% at 50% 0%, color-mix(in srgb, var(--badge-rarity) calc(var(--badge-bg-mix) * 2), transparent), transparent 70%),
      var(--uiv2-surface-subtle);
    color: var(--uikit-v2-text);
    font: inherit;
    text-align: center;
    cursor: pointer;
    transition:
      background-color 0.16s ease,
      border-color 0.16s ease,
      transform 0.16s ease;

    &:hover:not(:disabled) {
      border-color: color-mix(in srgb, var(--badge-rarity) calc(var(--badge-border-mix) + 18%), var(--uiv2-border-subtle));
      background-color: var(--uiv2-hover-bg);
    }

    &:active:not(:disabled) {
      transform: scale(0.97);
    }

    &:focus-visible {
      outline: 2px solid var(--uikit-v2-accent);
      outline-offset: 2px;
    }

    &:disabled {
      cursor: default;
      opacity: 0.6;
    }
  }

  .badge-tile--uncommon {
    --badge-rarity: var(--badge-rarity-uncommon);
    --badge-bg-mix: 5%;
    --badge-border-mix: 15%;
  }

  .badge-tile--rare {
    --badge-rarity: var(--badge-rarity-rare);
    --badge-bg-mix: 8%;
    --badge-border-mix: 31%;
  }

  .badge-tile--epic {
    --badge-rarity: var(--badge-rarity-epic);
    --badge-bg-mix: 11%;
    --badge-border-mix: 41%;
  }

  .badge-tile--legendary {
    --badge-rarity: var(--badge-rarity-legendary);
    --badge-bg-mix: 15%;
    --badge-border-mix: 51%;
  }

  .badge-tile--selected {
    border-color: var(--uikit-v2-accent);
    box-shadow: 0 0 0 1px var(--uikit-v2-accent) inset;
  }

  .badge-tile--compact {
    padding: 0.6rem;
    border-radius: 16px;
  }

  .badge-tile__icon {
    position: relative;
    display: grid;
    place-items: center;
    width: 3.4rem;
    height: 3.4rem;

    .badge-tile--compact & {
      width: 3.8rem;
      height: 3.8rem;
    }
  }

  .badge-tile__icon :global(.badge-tile__img) {
    width: 100%;
    height: 100%;
  }

  .badge-tile__img--empty {
    display: block;
    border-radius: 50%;
    background: var(--uiv2-surface-raised);
  }

  .badge-tile--hidden .badge-tile__icon :global(.badge-tile__img) {
    filter: blur(7px) saturate(0.6);
    opacity: 0.75;
  }

  .badge-tile__mark {
    position: absolute;
    display: grid;
    place-items: center;
    width: 1.2rem;
    height: 1.2rem;
    border-radius: 50%;
    box-shadow: 0 0 0 2px var(--uiv2-panel-bg);
  }

  .badge-tile__mark--check {
    right: -0.2rem;
    bottom: -0.1rem;
    background: var(--uikit-v2-accent);
    color: var(--uiv2-chrome-on-accent-fg);
  }

  .badge-tile__mark--pin {
    top: -0.15rem;
    right: -0.2rem;
    background: var(--uiv2-chrome-bg);
    color: var(--uiv2-fg-soft);
  }

  .badge-tile__name {
    display: -webkit-box;
    max-width: 100%;
    overflow: hidden;
    font-size: 0.76rem;
    font-weight: 600;
    line-height: 1.2;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow-wrap: anywhere;

    .badge-tile--hidden & {
      color: var(--uiv2-fg-muted);
      font-style: italic;
    }
  }

  .badge-tile__sub {
    max-width: 100%;
    overflow: hidden;
    color: var(--uiv2-fg-muted);
    font-size: 0.68rem;
    line-height: 1.2;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
</style>
