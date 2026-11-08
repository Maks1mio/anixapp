<script lang="ts">
  /**
   * Строки под связанными релизами (как в Anixart 11): «Значки», «Показать в коллекциях»,
   * «Добавить к себе в коллекцию».
   */
  import { navigate } from '../../../stores/navigation';
  import { requireAuth } from '../../../stores/auth';
  import UserBadge from '../../../components/UserBadge.svelte';
  import { iconChevronRight, iconPlus } from '../../../components/icons';
  import type { ApiBadge } from '../../../types/api';
  import { badgeImage } from '../../../utils/badge-collection';
  import ReleaseBadgesSheet from './ReleaseBadgesSheet.svelte';
  import ReleaseAddToCollectionSheet from './ReleaseAddToCollectionSheet.svelte';

  interface Props {
    releaseId: number;
    release: Record<string, unknown>;
  }

  let { releaseId, release }: Props = $props();

  let badgesOpen = $state(false);
  let addOpen = $state(false);

  const isDeleted = $derived(!!release.is_deleted);
  const badgeCount = $derived(Math.max(0, Number(release.badge_count) || 0));
  const badgesPreview = $derived(
    ((release.badges_preview ?? []) as ApiBadge[])
      .filter((b) => b && Number(b.id) > 0)
      .slice(0, 3),
  );
  const collectionCount = $derived(Math.max(0, Number(release.collection_count) || 0));
  const showBadges = $derived(badgeCount > 0 && !isDeleted);

  function formatCount(n: number): string {
    return n.toLocaleString('ru-RU');
  }

  function openAdd() {
    if (!requireAuth()) return;
    addOpen = true;
  }

  // Кнопка «+» в верхней панели мобильной версии лежит вне страницы
  $effect(() => {
    window.addEventListener('anix:release-add-to-collection', openAdd);
    return () => window.removeEventListener('anix:release-add-to-collection', openAdd);
  });
</script>

<div class="release-page__section release-links">
  <div class="release-links__list">
    {#if showBadges}
      <button type="button" class="release-links__row" onclick={() => (badgesOpen = true)}>
        <span class="release-links__title">Значки</span>
        <span class="uiv2-card__pill">{formatCount(badgeCount)}</span>
        <span class="release-links__end">
          {#if badgesPreview.length}
            <span class="release-links__badges" aria-hidden="true">
              {#each badgesPreview as badge (badge.id)}
                <UserBadge url={badgeImage(badge, 'static')} name={badge.name} size="md" showTooltip={false} />
              {/each}
            </span>
          {/if}
          <span class="release-links__icon">{@html iconChevronRight(20)}</span>
        </span>
      </button>
    {/if}

    <button
      type="button"
      class="release-links__row"
      onclick={() => navigate(`/release/${releaseId}/collections`)}
    >
      <span class="release-links__title">Показать в коллекциях</span>
      {#if collectionCount > 0}
        <span class="uiv2-card__pill">{formatCount(collectionCount)}</span>
      {/if}
      <span class="release-links__end">
        <span class="release-links__icon">{@html iconChevronRight(20)}</span>
      </span>
    </button>

    <button type="button" class="release-links__row" onclick={openAdd}>
      <span class="release-links__title">Добавить к себе в коллекцию</span>
      <span class="release-links__end">
        <span class="release-links__icon">{@html iconPlus(20)}</span>
      </span>
    </button>
  </div>
</div>

{#if badgesOpen}
  <ReleaseBadgesSheet {releaseId} total={badgeCount} onClose={() => (badgesOpen = false)} />
{/if}

{#if addOpen}
  <ReleaseAddToCollectionSheet {releaseId} {release} onClose={() => (addOpen = false)} />
{/if}

<style lang="scss">
  .release-links__list {
    display: flex;
    flex-direction: column;
  }

  .release-links__row {
    display: flex;
    align-items: center;
    gap: 0.6rem;
    width: 100%;
    min-width: 0;
    min-height: 3.5rem;
    padding: 0.55rem 0.75rem;
    border: 0;
    border-radius: 12px;
    background: transparent;
    color: var(--uikit-v2-text);
    font: inherit;
    text-align: left;
    cursor: pointer;
    transition: background-color 0.16s ease;

    & + & {
      position: relative;

      &::before {
        content: '';
        position: absolute;
        top: 0;
        right: 0.75rem;
        left: 0.75rem;
        border-top: 1px solid var(--uiv2-border-subtle);
      }
    }

    &:hover {
      background: var(--uiv2-hover-bg);

      .release-links__icon {
        color: var(--uikit-v2-text);
      }
    }

    &:hover::before,
    &:hover + .release-links__row::before {
      opacity: 0;
    }

    &:focus-visible {
      outline: 2px solid var(--uikit-v2-accent);
      outline-offset: -2px;
    }
  }

  .release-links__title {
    min-width: 0;
    overflow: hidden;
    font-size: 1rem;
    font-weight: 600;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .release-links__end {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-left: auto;
    flex: 0 0 auto;
  }

  .release-links__badges {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .release-links__icon {
    display: grid;
    place-items: center;
    color: var(--uiv2-fg-muted);
    transition: color 0.16s ease;
  }
</style>
