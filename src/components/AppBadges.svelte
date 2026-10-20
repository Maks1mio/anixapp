<script lang="ts">
  /**
   * Anixapp badges (anixback) next to a profile name: «В AnixApp», Anix+ tiers, custom.
   * Many instances on one screen are batched into one /badges/users request (badges-api).
   */
  import { untrack } from 'svelte';
  import { loadUserBadges, visibleAppBadges, type AppBadge } from '../services/badges-api';
  import { resolveAnixbackUploadUrl } from '../services/anixback-endpoint';
  import { isSupportBadge, onSupportBadgeActivate } from '../stores/support-promo';

  type Size = 'xs' | 'sm' | 'md';

  type Props = {
    userId: number | null | undefined;
    size?: Size;
    class?: string;
  };

  let { userId, size = 'sm', class: className = '' }: Props = $props();

  let badges = $state<AppBadge[]>([]);

  async function load(id: number) {
    const list = visibleAppBadges(await loadUserBadges(id));
    if (id === Number(userId)) badges = list;
  }

  $effect(() => {
    const id = Number(userId ?? 0);
    untrack(() => {
      badges = [];
      if (id > 0) void load(id);
    });
  });

  // Own badge just granted by the first verified launch (app-presence).
  $effect(() => {
    const onChanged = (e: Event) => {
      const id = Number(userId ?? 0);
      if (id > 0 && Number((e as CustomEvent<{ userId?: number }>).detail?.userId) === id) void load(id);
    };
    window.addEventListener('anix:appBadgesChanged', onChanged);
    return () => window.removeEventListener('anix:appBadgesChanged', onChanged);
  });
</script>

{#each badges as b (b.slug)}
  {#if isSupportBadge(b.slug)}
    <!-- Anix+ → модалка поддержки (span: значок часто лежит внутри кнопки профиля) -->
    <span
      class="app-badge-hit"
      role="button"
      tabindex="0"
      aria-label="{b.name} — подробнее об Anix+"
      onclick={onSupportBadgeActivate}
      onkeydown={onSupportBadgeActivate}
    >
      <img
        class="app-badge app-badge--{size} {className}"
        src={resolveAnixbackUploadUrl(b.image_url)}
        alt={b.name}
        title={b.name}
        loading="lazy"
        decoding="async"
      />
    </span>
  {:else}
    <img
      class="app-badge app-badge--{size} {className}"
      src={resolveAnixbackUploadUrl(b.image_url)}
      alt={b.name}
      title={b.name}
      loading="lazy"
      decoding="async"
    />
  {/if}
{/each}

<style>
  .app-badge-hit {
    display: inline-flex;
    flex-shrink: 0;
    vertical-align: middle;
    border-radius: 4px;
    cursor: pointer;
  }

  .app-badge-hit:hover .app-badge {
    transform: scale(1.12);
  }

  .app-badge-hit:focus-visible {
    outline: 2px solid var(--uikit-v2-accent, currentColor);
    outline-offset: 2px;
  }

  .app-badge {
    transition: transform 0.12s ease;
    display: inline-block;
    flex-shrink: 0;
    object-fit: contain;
    vertical-align: middle;
  }

  .app-badge--xs {
    width: 0.85rem;
    height: 0.85rem;
  }

  .app-badge--sm {
    width: 1rem;
    height: 1rem;
  }

  .app-badge--md {
    width: 1.35rem;
    height: 1.35rem;
  }
</style>
