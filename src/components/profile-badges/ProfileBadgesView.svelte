<script lang="ts">
  /**
   * Экран «Установка значка» (Anixart 10.5): превью у ника, витрина, недавние,
   * разделы по категориям, лист значка и получение по коду.
   */
  import { onMount } from 'svelte';
  import UserBadge from '../UserBadge.svelte';
  import UiV2Button from '../uikit-v2/UiV2Button.svelte';
  import UiV2Skeleton from '../uikit-v2/UiV2Skeleton.svelte';
  import BadgeTile from './BadgeTile.svelte';
  import BadgeDetailSheet from './BadgeDetailSheet.svelte';
  import BadgeClaimSheet from './BadgeClaimSheet.svelte';
  import { iconArrowLeft, iconArrowRight, iconChevronDown, iconPin } from '../icons';
  import type { ApiBadge } from '../../types/api';
  import { resolveJacksonRefs } from '../../utils/jackson-refs';
  import { showToast } from '../../stores/toast';
  import { navigate } from '../../stores/navigation';
  import { closeProfilePanel } from '../../stores/profile-panel';
  import {
    BADGE_SHOWCASE_LIMIT,
    badgeImage,
    readRecentBadgeIds,
    rememberRecentBadge,
    toBadgeCollectionView,
    type BadgeCollectionView,
  } from '../../utils/badge-collection';

  interface Props {
    profileId: number;
    login: string;
    avatarUrl?: string;
    /** Значок изменён (null — снят): обновить шапку профиля */
    onBadgeChanged?: (badge: ApiBadge | null) => void;
  }

  let { profileId, login, avatarUrl = '', onBadgeChanged }: Props = $props();

  let loadState = $state<'loading' | 'ready' | 'error'>('loading');
  let view = $state<BadgeCollectionView | null>(null);
  /** Подгруженные целиком разделы (кнопка «Ещё N») */
  let expanded = $state<Record<number, ApiBadge[]>>({});
  let expanding = $state<number | null>(null);
  let busy = $state(false);
  let openBadge = $state<ApiBadge | null>(null);
  let claimOpen = $state(false);
  let reorder = $state(false);
  let reorderIds = $state<number[]>([]);
  let dragId = $state<number | null>(null);

  const selected = $derived.by(() => {
    if (!view?.selectedId) return null;
    return allBadges().find((b) => b.id === view?.selectedId) ?? null;
  });
  const previewImage = $derived(selected ? badgeImage(selected, 'anim') : null);
  const showcased = $derived(view?.showcased ?? []);
  const reorderList = $derived(
    reorderIds.map((id) => showcased.find((b) => b.id === id)).filter((b): b is ApiBadge => !!b),
  );

  function allBadges(): ApiBadge[] {
    if (!view) return [];
    return [
      ...view.showcased,
      ...view.recent,
      ...view.sections.flatMap((s) => s.items),
      ...Object.values(expanded).flat(),
    ];
  }

  async function load() {
    const api = window.anixApi?.settings;
    if (!api?.getBadgeCollection || !profileId) {
      loadState = 'error';
      return;
    }
    if (!view) loadState = 'loading';
    try {
      const res = resolveJacksonRefs(await api.getBadgeCollection(profileId, readRecentBadgeIds()));
      if (res?.code != null && res.code !== 0) throw new Error(`code ${res.code}`);
      view = toBadgeCollectionView(res);
      expanded = {};
      loadState = 'ready';
    } catch {
      if (!view) loadState = 'error';
      else showToast('Не удалось обновить значки', 'err');
    }
  }

  async function expandSection(sectionId: number) {
    const api = window.anixApi?.settings;
    if (!api?.getBadgeSection || expanding != null) return;
    expanding = sectionId;
    try {
      const items: ApiBadge[] = [];
      for (let page = 0; page < 30; page++) {
        const res = resolveJacksonRefs(await api.getBadgeSection(profileId, sectionId, page));
        items.push(...(res?.content ?? []));
        const pages = Math.max(1, Number(res?.total_page_count) || 1);
        if (page + 1 >= pages || !res?.content?.length) break;
      }
      expanded = { ...expanded, [sectionId]: items };
    } catch {
      showToast('Не удалось загрузить значки', 'err');
    } finally {
      expanding = null;
    }
  }

  /** Обновить значок во всех списках сразу (витрина, недавние, разделы, лист) */
  function patchBadge(id: number, patch: Partial<ApiBadge>) {
    if (!view) return;
    const apply = (list: ApiBadge[]) => list.map((b) => (b.id === id ? { ...b, ...patch } : b));
    view = {
      ...view,
      showcased: apply(view.showcased),
      recent: apply(view.recent),
      sections: view.sections.map((s) => ({ ...s, items: apply(s.items) })),
    };
    expanded = Object.fromEntries(Object.entries(expanded).map(([k, v]) => [k, apply(v)]));
    if (openBadge?.id === id) openBadge = { ...openBadge, ...patch };
  }

  function open(badge: ApiBadge) {
    if (reorder) return;
    rememberRecentBadge(badge.id);
    openBadge = badge;
  }

  async function selectBadge(badge: ApiBadge) {
    const api = window.anixApi?.settings;
    if (busy || !api?.setBadge || !view) return;
    busy = true;
    try {
      const res = await api.setBadge(badge.id);
      if (res?.code !== 0) throw new Error();
      const prev = view.selectedId;
      if (prev) patchBadge(prev, { is_selected: false });
      patchBadge(badge.id, { is_selected: true });
      view = { ...view, selectedId: badge.id };
      onBadgeChanged?.(res?.badge ?? badge);
      showToast('Значок установлен');
      openBadge = null;
    } catch {
      showToast('Не удалось установить значок', 'err');
    } finally {
      busy = false;
    }
  }

  async function unselectBadge() {
    const api = window.anixApi?.settings;
    if (busy || !api?.removeBadge || !view) return;
    busy = true;
    try {
      const res = await api.removeBadge();
      if (res?.code !== 0) throw new Error();
      if (view.selectedId) patchBadge(view.selectedId, { is_selected: false });
      view = { ...view, selectedId: null };
      onBadgeChanged?.(null);
      showToast('Значок снят');
      openBadge = null;
    } catch {
      showToast('Не удалось снять значок', 'err');
    } finally {
      busy = false;
    }
  }

  async function togglePin(badge: ApiBadge) {
    const api = window.anixApi?.settings;
    if (busy || !view || !api?.pinBadge || !api?.unpinBadge) return;
    const pinned = !!badge.is_showcased;
    if (!pinned && view.showcased.length >= BADGE_SHOWCASE_LIMIT) {
      showToast(`На витрине можно закрепить не более ${BADGE_SHOWCASE_LIMIT} значков`, 'info');
      return;
    }
    busy = true;
    try {
      const res = pinned ? await api.unpinBadge(badge.id) : await api.pinBadge(badge.id);
      if (res?.code === 3) {
        showToast(`На витрине можно закрепить не более ${BADGE_SHOWCASE_LIMIT} значков`, 'info');
        return;
      }
      if (res?.code !== 0) throw new Error();
      patchBadge(badge.id, { is_showcased: !pinned });
      const next = pinned
        ? view.showcased.filter((b) => b.id !== badge.id)
        : [...view.showcased, { ...badge, is_showcased: true }];
      view = { ...view, showcased: next };
    } catch {
      showToast('Не удалось обновить витрину. Попробуйте ещё раз.', 'err');
    } finally {
      busy = false;
    }
  }

  function startReorder() {
    if (showcased.length < 2) {
      showToast('Закрепите хотя бы 2 значка, чтобы изменить порядок', 'info');
      return;
    }
    reorderIds = showcased.map((b) => b.id);
    reorder = true;
  }

  function move(id: number, delta: number) {
    const from = reorderIds.indexOf(id);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= reorderIds.length) return;
    const next = [...reorderIds];
    next.splice(to, 0, next.splice(from, 1)[0]);
    reorderIds = next;
  }

  function onDrop(targetId: number) {
    if (dragId == null || dragId === targetId) return;
    move(dragId, reorderIds.indexOf(targetId) - reorderIds.indexOf(dragId));
    dragId = null;
  }

  async function finishReorder() {
    const api = window.anixApi?.settings;
    const changed = reorderIds.some((id, i) => id !== showcased[i]?.id);
    if (!changed || !api?.reorderBadgeShowcase || !view) {
      reorder = false;
      return;
    }
    busy = true;
    try {
      const res = await api.reorderBadgeShowcase(reorderIds);
      if (res?.code !== 0) throw new Error();
      view = { ...view, showcased: reorderList };
      reorder = false;
    } catch {
      showToast('Не удалось обновить витрину. Попробуйте ещё раз.', 'err');
    } finally {
      busy = false;
    }
  }

  function openRelease(releaseId: number) {
    openBadge = null;
    closeProfilePanel();
    navigate(`/release/${releaseId}`);
  }

  onMount(() => {
    void load();
  });
</script>

<div class="badges-view">
  <div class="badges-view__preview" aria-label="Как значок выглядит в комментариях">
    {#if avatarUrl}
      <img class="badges-view__avatar" src={avatarUrl} alt="" />
    {:else}
      <span class="badges-view__avatar badges-view__avatar--empty" aria-hidden="true"></span>
    {/if}
    <div class="badges-view__preview-body">
      <div class="badges-view__preview-head">
        <span class="badges-view__login">{login}</span>
        {#if previewImage}
          <UserBadge url={previewImage} name={selected?.name} size="md" showTooltip={false} />
        {/if}
        <span class="badges-view__date">сегодня</span>
      </div>
      <p class="badges-view__message">Это пример вашего комментария</p>
    </div>
  </div>

  <p class="badges-view__info">
    Значки выдаются за просмотр релизов, участие в событиях и конкурсах. Нажмите на значок, чтобы узнать, за что он
    получен, и установить его рядом с никнеймом.
  </p>

  <div class="badges-view__actions">
    <UiV2Button label="Получить по коду" variant="chrome" onclick={() => (claimOpen = true)} />
    {#if view?.selectedId}
      <UiV2Button label="Снять значок" variant="ghost" disabled={busy} onclick={() => void unselectBadge()} />
    {/if}
  </div>

  {#if loadState === 'loading'}
    <div class="badges-view__grid" aria-busy="true">
      {#each Array(8) as _, i (i)}
        <UiV2Skeleton tag="div" rounded="lg" class="badges-view__skeleton" />
      {/each}
    </div>
  {:else if loadState === 'error'}
    <div class="badges-view__empty">
      <p>Не удалось загрузить значки</p>
      <UiV2Button label="Повторить" variant="chrome" onclick={() => void load()} />
    </div>
  {:else if view && view.total === 0 && !view.showcased.length}
    <div class="badges-view__empty">
      <p class="badges-view__empty-title">Значков пока нет :(</p>
      <p>Вы можете получить значки за определенные действия, участие в событиях и конкурсах</p>
    </div>
  {:else if view}
    <section class="badges-view__section" aria-labelledby="badges-showcase-title">
      <header class="badges-view__head">
        <h3 id="badges-showcase-title" class="badges-view__title">
          Закрепленные
          <span class="badges-view__count">{showcased.length}/{BADGE_SHOWCASE_LIMIT}</span>
        </h3>
        {#if reorder}
          <button type="button" class="badges-view__link" disabled={busy} onclick={() => void finishReorder()}>Готово</button>
        {:else if showcased.length > 0}
          <button type="button" class="badges-view__link" onclick={startReorder}>Изменить порядок</button>
        {/if}
      </header>

      <div class="badges-view__showcase" class:badges-view__showcase--reorder={reorder}>
        {#if reorder}
          {#each reorderList as badge, i (badge.id)}
            <div
              class="badges-view__slot badges-view__slot--drag"
              class:badges-view__slot--dragging={dragId === badge.id}
              draggable="true"
              role="listitem"
              ondragstart={() => (dragId = badge.id)}
              ondragend={() => (dragId = null)}
              ondragover={(e) => e.preventDefault()}
              ondrop={() => onDrop(badge.id)}
            >
              <BadgeTile {badge} compact />
              <div class="badges-view__move">
                <button type="button" aria-label="Левее" disabled={i === 0} onclick={() => move(badge.id, -1)}>
                  {@html iconArrowLeft(14)}
                </button>
                <button
                  type="button"
                  aria-label="Правее"
                  disabled={i === reorderList.length - 1}
                  onclick={() => move(badge.id, 1)}
                >
                  {@html iconArrowRight(14)}
                </button>
              </div>
            </div>
          {/each}
        {:else}
          {#each Array(BADGE_SHOWCASE_LIMIT) as _, i (i)}
            {@const badge = showcased[i]}
            <div class="badges-view__slot">
              {#if badge}
                <BadgeTile {badge} compact selected={view.selectedId === badge.id} onclick={open} />
              {:else}
                <div class="badges-view__slot-empty" title="Откройте значок и нажмите «Закрепить на витрине»">
                  <span aria-hidden="true">{@html iconPin(18)}</span>
                </div>
              {/if}
            </div>
          {/each}
        {/if}
      </div>
    </section>

    {#if view.recent.length && !reorder}
      <section class="badges-view__section" aria-labelledby="badges-recent-title">
        <header class="badges-view__head">
          <h3 id="badges-recent-title" class="badges-view__title">Недавние</h3>
        </header>
        <div class="badges-view__row">
          {#each view.recent as badge (badge.id)}
            <div class="badges-view__row-item">
              <BadgeTile {badge} compact selected={view.selectedId === badge.id} onclick={open} />
            </div>
          {/each}
        </div>
      </section>
    {/if}

    {#each view.sections as section (section.id)}
      {@const items = expanded[section.id] ?? section.items}
      {@const rest = section.count - items.length}
      <section class="badges-view__section" aria-label={section.title}>
        <header class="badges-view__head">
          <h3 class="badges-view__title">
            {section.title}
            <span class="badges-view__count">{section.count}</span>
          </h3>
        </header>
        <div class="badges-view__grid">
          {#each items as badge (badge.id)}
            <BadgeTile {badge} selected={view.selectedId === badge.id} disabled={reorder} onclick={open} />
          {/each}
          {#if rest > 0}
            <button
              type="button"
              class="badges-view__more"
              disabled={expanding != null}
              onclick={() => void expandSection(section.id)}
            >
              {#if expanding === section.id}
                <span class="badges-view__more-label">Загрузка…</span>
              {:else}
                <span class="badges-view__more-label">Ещё {rest}</span>
                <span class="badges-view__more-icon" aria-hidden="true">{@html iconChevronDown(16)}</span>
              {/if}
            </button>
          {/if}
        </div>
      </section>
    {/each}
  {/if}
</div>

{#if openBadge}
  <BadgeDetailSheet
    badge={openBadge}
    editable
    selected={view?.selectedId === openBadge.id}
    {busy}
    onClose={() => (openBadge = null)}
    onSelect={(b) => void selectBadge(b)}
    onUnselect={() => void unselectBadge()}
    onTogglePin={(b) => void togglePin(b)}
    onOpenRelease={openRelease}
  />
{/if}

{#if claimOpen}
  <BadgeClaimSheet onClose={() => (claimOpen = false)} onClaimed={() => void load()} />
{/if}

<style lang="scss">
  .badges-view {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.5rem 1.1rem 1.5rem;
  }

  .badges-view__preview {
    display: flex;
    gap: 0.7rem;
    padding: 0.8rem 0.9rem;
    border: 1px solid var(--uiv2-border-subtle);
    border-radius: 16px;
    background: var(--uiv2-surface-subtle);
  }

  .badges-view__avatar {
    flex-shrink: 0;
    width: 2.4rem;
    height: 2.4rem;
    border-radius: 50%;
    object-fit: cover;
    background: var(--uiv2-surface-raised);
  }

  .badges-view__preview-body {
    display: flex;
    flex-direction: column;
    gap: 0.2rem;
    min-width: 0;
  }

  .badges-view__preview-head {
    display: flex;
    align-items: center;
    gap: 0.35rem;
    min-width: 0;
  }

  .badges-view__login {
    overflow: hidden;
    color: var(--uiv2-fg-strong);
    font-size: 0.88rem;
    font-weight: 700;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .badges-view__date {
    flex-shrink: 0;
    color: var(--uiv2-fg-muted);
    font-size: 0.74rem;
  }

  .badges-view__message {
    margin: 0;
    color: var(--uiv2-fg-soft);
    font-size: 0.84rem;
  }

  .badges-view__info {
    margin: 0;
    color: var(--uiv2-fg-muted);
    font-size: 0.8rem;
    line-height: 1.45;
  }

  .badges-view__actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
  }

  .badges-view__section {
    display: flex;
    flex-direction: column;
    gap: 0.6rem;
  }

  .badges-view__head {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.5rem;
  }

  .badges-view__title {
    display: flex;
    align-items: baseline;
    gap: 0.4rem;
    margin: 0;
    color: var(--uiv2-fg-strong);
    font-size: 0.95rem;
    font-weight: 700;
  }

  .badges-view__count {
    color: var(--uiv2-fg-muted);
    font-size: 0.78rem;
    font-weight: 600;
  }

  .badges-view__link {
    padding: 0.2rem 0.1rem;
    border: none;
    background: none;
    color: var(--uikit-v2-accent);
    font: inherit;
    font-size: 0.8rem;
    font-weight: 600;
    cursor: pointer;

    &:hover:not(:disabled) {
      text-decoration: underline;
    }

    &:disabled {
      opacity: 0.5;
      cursor: default;
    }
  }

  .badges-view__showcase {
    display: grid;
    grid-template-columns: repeat(3, minmax(0, 1fr));
    gap: 0.6rem;
  }

  .badges-view__slot {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
    min-width: 0;

    > :global(.badge-tile) {
      width: 100%;
    }
  }

  .badges-view__slot--drag {
    cursor: grab;
  }

  .badges-view__slot--dragging {
    opacity: 0.45;
  }

  .badges-view__showcase--reorder .badges-view__slot :global(.badge-tile) {
    animation: badges-jiggle 0.32s ease-in-out infinite alternate;
    pointer-events: none;
  }

  @keyframes badges-jiggle {
    from { transform: rotate(-1.6deg); }
    to { transform: rotate(1.6deg); }
  }

  .badges-view__move {
    display: flex;
    justify-content: center;
    gap: 0.3rem;

    button {
      display: grid;
      place-items: center;
      width: 1.8rem;
      height: 1.6rem;
      border: none;
      border-radius: 8px;
      background: var(--uiv2-chrome-bg);
      color: var(--uiv2-chrome-fg);
      cursor: pointer;

      &:hover:not(:disabled) {
        background: var(--uiv2-chrome-bg-hover);
      }

      &:disabled {
        opacity: 0.35;
        cursor: default;
      }
    }
  }

  .badges-view__slot-empty {
    display: grid;
    place-items: center;
    aspect-ratio: 1;
    border: 1.5px dashed var(--uiv2-border-strong);
    border-radius: 16px;
    color: var(--uiv2-fg-muted);
    opacity: 0.7;
  }

  .badges-view__row {
    display: flex;
    gap: 0.55rem;
    overflow-x: auto;
    padding-bottom: 0.2rem;
    scrollbar-width: thin;
  }

  .badges-view__row-item {
    flex: 0 0 5.4rem;
  }

  .badges-view__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(6.4rem, 1fr));
    gap: 0.55rem;
  }

  .badges-view__grid :global(.badges-view__skeleton) {
    height: 7.6rem;
  }

  .badges-view__more {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.25rem;
    min-height: 7rem;
    border: 1px dashed var(--uiv2-border-strong);
    border-radius: 14px;
    background: transparent;
    color: var(--uiv2-fg-soft);
    font: inherit;
    cursor: pointer;
    transition: background-color 0.16s ease;

    &:hover:not(:disabled) {
      background: var(--uiv2-hover-bg);
    }

    &:disabled {
      cursor: default;
      opacity: 0.6;
    }
  }

  .badges-view__more-label {
    font-size: 0.8rem;
    font-weight: 600;
  }

  .badges-view__more-icon {
    line-height: 0;
  }

  .badges-view__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.5rem 0.5rem;
    color: var(--uiv2-fg-muted);
    font-size: 0.84rem;
    text-align: center;

    p {
      margin: 0;
    }
  }

  .badges-view__empty-title {
    color: var(--uiv2-fg-strong);
    font-size: 1rem;
    font-weight: 700;
  }
</style>
