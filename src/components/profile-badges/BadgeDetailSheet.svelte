<script lang="ts">
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../actions/portal';
  import UserBadge from '../UserBadge.svelte';
  import UiV2Button from '../uikit-v2/UiV2Button.svelte';
  import { iconChevronRight } from '../icons';
  import type { ApiBadge } from '../../types/api';
  import {
    BADGE_RARITY_LABEL,
    badgeAwardInfo,
    badgeDate,
    badgeImage,
    badgeOwnershipText,
    badgeRarity,
  } from '../../utils/badge-collection';

  interface Props {
    badge: ApiBadge;
    /** Свой профиль: можно установить значок и закрепить на витрине */
    editable?: boolean;
    selected?: boolean;
    busy?: boolean;
    onClose: () => void;
    onSelect?: (badge: ApiBadge) => void;
    onUnselect?: () => void;
    onTogglePin?: (badge: ApiBadge) => void;
    onOpenRelease?: (releaseId: number) => void;
  }

  let {
    badge,
    editable = false,
    selected = false,
    busy = false,
    onClose,
    onSelect,
    onUnselect,
    onTogglePin,
    onOpenRelease,
  }: Props = $props();

  const titleId = `badge-sheet-${Math.random().toString(36).slice(2, 8)}`;
  const rarity = $derived(badgeRarity(badge));
  const image = $derived(badgeImage(badge, 'anim'));
  const ownership = $derived(badgeOwnershipText(badge.ownership_percentage));
  const date = $derived(badgeDate(badge.timestamp));
  const award = $derived(badgeAwardInfo(badge));
  // В коллекции профиля значки всегда получены её владельцем; is_owned важен только для значков релиза
  const owned = $derived(editable || badge.is_owned !== false);

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

<div class="uiv2-choice-sheet" role="dialog" aria-modal="true" aria-labelledby={titleId} use:portal>
  <button
    type="button"
    class="uiv2-choice-sheet__backdrop"
    aria-label="Закрыть"
    onclick={onClose}
    transition:fade={{ duration: 160 }}
  ></button>

  <div
    class="uiv2-choice-sheet__panel uiv2-choice-sheet__panel--form badge-sheet badge-sheet--{rarity.toLowerCase()}"
    transition:scale={{ duration: 220, start: 0.94, easing: cubicOut }}
  >
    <div class="badge-sheet__hero">
      <div class="badge-sheet__glow" aria-hidden="true"></div>
      {#if image}
        <UserBadge url={image} name={badge.name} size="lg" class="badge-sheet__img" showTooltip={false} />
      {/if}
    </div>

    <span class="badge-sheet__rarity">{BADGE_RARITY_LABEL[rarity]}</span>
    <h3 id={titleId} class="badge-sheet__name">{badge.name?.trim() || 'Без названия'}</h3>
    {#if badge.description?.trim()}
      <p class="badge-sheet__desc">{badge.description.trim()}</p>
    {/if}

    <div class="badge-sheet__meta">
      {#if badge.is_available === false}
        <span class="badge-sheet__chip badge-sheet__chip--warn">Сейчас недоступен для получения</span>
      {/if}
      {#if ownership}
        <span class="badge-sheet__chip">{ownership}</span>
      {/if}
      {#if owned && date}
        <span class="badge-sheet__chip">Получен {date}</span>
      {/if}
    </div>

    {#if award}
      <section class="badge-sheet__award" aria-label="За что получен">
        <span class="badge-sheet__award-label">{owned ? 'За что получен' : 'Как получить'}</span>
        <svelte:element
          this={award.releaseId ? 'button' : 'div'}
          type={award.releaseId ? 'button' : undefined}
          class="badge-sheet__award-card"
          class:badge-sheet__award-card--link={!!award.releaseId}
          role={award.releaseId ? undefined : 'group'}
          onclick={award.releaseId ? () => onOpenRelease?.(award.releaseId!) : undefined}
        >
          {#if award.poster}
            <img class="badge-sheet__award-poster" src={award.poster} alt="" loading="lazy" />
          {/if}
          <span class="badge-sheet__award-text">
            <span class="badge-sheet__award-title">{award.title}</span>
            {#if award.detail}
              <span class="badge-sheet__award-detail">{award.detail}</span>
            {/if}
          </span>
          {#if award.releaseId}
            <span class="badge-sheet__award-chevron" aria-hidden="true">{@html iconChevronRight(16)}</span>
          {/if}
        </svelte:element>
      </section>
    {/if}

    {#if editable && owned}
      <div class="badge-sheet__actions">
        {#if selected}
          <UiV2Button label="Снять" size="lg" block variant="chrome" disabled={busy} onclick={() => onUnselect?.()} />
        {:else}
          <UiV2Button label="Установить" size="lg" block variant="primary" disabled={busy} onclick={() => onSelect?.(badge)} />
        {/if}
        <UiV2Button
          label={badge.is_showcased ? 'Открепить с витрины' : 'Закрепить на витрине'}
          size="lg"
          block
          variant="chrome"
          disabled={busy}
          onclick={() => onTogglePin?.(badge)}
        />
      </div>
    {/if}

    <UiV2Button label="Закрыть" size="lg" block variant="ghost" onclick={onClose} />
  </div>
</div>

<style lang="scss">
  .badge-sheet {
    --badge-rarity: var(--badge-rarity-common);

    align-items: center;
    text-align: center;
    gap: 0.55rem;
  }

  .badge-sheet--uncommon { --badge-rarity: var(--badge-rarity-uncommon); }
  .badge-sheet--rare { --badge-rarity: var(--badge-rarity-rare); }
  .badge-sheet--epic { --badge-rarity: var(--badge-rarity-epic); }
  .badge-sheet--legendary { --badge-rarity: var(--badge-rarity-legendary); }

  .badge-sheet__hero {
    position: relative;
    display: grid;
    place-items: center;
    width: 8.5rem;
    height: 8.5rem;
    margin: 0.25rem auto 0.15rem;
  }

  .badge-sheet__glow {
    position: absolute;
    inset: 0.5rem;
    border-radius: 50%;
    background: radial-gradient(circle, color-mix(in srgb, var(--badge-rarity) 38%, transparent), transparent 70%);
    filter: blur(10px);
  }

  .badge-sheet__hero :global(.badge-sheet__img) {
    position: relative;
    width: 7rem;
    height: 7rem;
  }

  .badge-sheet__rarity {
    align-self: center;
    padding: 0.18rem 0.6rem;
    border-radius: 999px;
    background: color-mix(in srgb, var(--badge-rarity) 16%, transparent);
    color: color-mix(in srgb, var(--badge-rarity) 85%, var(--uikit-v2-text));
    font-size: 0.72rem;
    font-weight: 700;
    letter-spacing: 0.02em;
  }

  .badge-sheet__name {
    margin: 0;
    color: var(--uiv2-fg-strong);
    font-size: 1.15rem;
    font-weight: 700;
    line-height: 1.25;
  }

  .badge-sheet__desc {
    margin: 0;
    color: var(--uiv2-fg-soft);
    font-size: 0.86rem;
    line-height: 1.4;
    white-space: pre-line;
  }

  .badge-sheet__meta {
    display: flex;
    flex-wrap: wrap;
    justify-content: center;
    gap: 0.35rem;
  }

  .badge-sheet__chip {
    padding: 0.25rem 0.55rem;
    border-radius: 999px;
    background: var(--uiv2-surface-raised);
    color: var(--uiv2-fg-soft);
    font-size: 0.74rem;
  }

  .badge-sheet__chip--warn {
    background: var(--uiv2-choice-warning-bg);
    color: var(--uiv2-choice-warning-fg);
  }

  .badge-sheet__award {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    width: 100%;
    margin-top: 0.2rem;
    text-align: left;
  }

  .badge-sheet__award-label {
    color: var(--uiv2-fg-muted);
    font-size: 0.74rem;
    font-weight: 600;
  }

  .badge-sheet__award-card {
    display: flex;
    align-items: center;
    gap: 0.7rem;
    width: 100%;
    padding: 0.6rem 0.7rem;
    border: 1px solid var(--uiv2-border-subtle);
    border-radius: 12px;
    background: var(--uiv2-surface-subtle);
    color: inherit;
    font: inherit;
    text-align: left;
  }

  .badge-sheet__award-card--link {
    cursor: pointer;
    transition: background-color 0.16s ease;

    &:hover {
      background: var(--uiv2-hover-bg);
    }

    &:focus-visible {
      outline: 2px solid var(--uikit-v2-accent);
      outline-offset: 2px;
    }
  }

  .badge-sheet__award-poster {
    flex-shrink: 0;
    width: 2.6rem;
    height: 3.6rem;
    border-radius: 8px;
    object-fit: cover;
    background: var(--uiv2-surface-raised);
  }

  .badge-sheet__award-text {
    display: flex;
    flex: 1;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .badge-sheet__award-title {
    color: var(--uiv2-fg-strong);
    font-size: 0.85rem;
    font-weight: 600;
    overflow-wrap: anywhere;
  }

  .badge-sheet__award-detail {
    color: var(--uiv2-fg-muted);
    font-size: 0.76rem;
  }

  .badge-sheet__award-chevron {
    flex-shrink: 0;
    color: var(--uiv2-fg-muted);
    line-height: 0;
  }

  .badge-sheet__actions {
    display: flex;
    flex-direction: column;
    gap: 0.4rem;
    width: 100%;
    margin-top: 0.3rem;
  }
</style>
