<script lang="ts">
  /**
   * Значки релиза (ReleaseBadgesFragment): сетка значков, неполученные скрыты под спойлером,
   * переключатель «Раскрыть / Скрыть неполученные», лист значка с установкой и витриной.
   */
  import { onMount } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../../actions/portal';
  import UiV2Button from '../../../components/uikit-v2/UiV2Button.svelte';
  import UiV2RoundButton from '../../../components/uikit-v2/UiV2RoundButton.svelte';
  import UiV2Skeleton from '../../../components/uikit-v2/UiV2Skeleton.svelte';
  import BadgeTile from '../../../components/profile-badges/BadgeTile.svelte';
  import BadgeDetailSheet from '../../../components/profile-badges/BadgeDetailSheet.svelte';
  import { iconEye, iconEyeOff } from '../../../components/icons';
  import type { ApiBadge } from '../../../types/api';
  import { resolveJacksonRefs } from '../../../utils/jackson-refs';
  import { rememberRecentBadge } from '../../../utils/badge-collection';
  import { showToast } from '../../../stores/toast';
  import { navigate } from '../../../stores/navigation';

  interface Props {
    releaseId: number;
    total?: number;
    onClose: () => void;
  }

  let { releaseId, total = 0, onClose }: Props = $props();

  const titleId = `release-badges-${Math.random().toString(36).slice(2, 8)}`;
  const SHOW_UNEARNED_KEY = 'anixapp.releaseBadges.showUnearned';

  let loadState = $state<'loading' | 'ready' | 'error'>('loading');
  let items = $state<ApiBadge[]>([]);
  let page = $state(0);
  let hasMore = $state(true);
  let loadingMore = $state(false);
  let showUnearned = $state(readShowUnearned());
  /** Неполученные значки, открытые тапом по спойлеру */
  let revealed = $state<Set<number>>(new Set());
  let openBadge = $state<ApiBadge | null>(null);
  let busy = $state(false);

  const ownedCount = $derived(items.filter((b) => b.is_owned).length);
  const hasUnearned = $derived(items.some((b) => b.is_owned === false));
  const count = $derived(Math.max(total, items.length));

  function readShowUnearned(): boolean {
    try {
      return localStorage.getItem(SHOW_UNEARNED_KEY) === '1';
    } catch {
      return false;
    }
  }

  function toggleUnearned() {
    showUnearned = !showUnearned;
    revealed = new Set();
    try {
      localStorage.setItem(SHOW_UNEARNED_KEY, showUnearned ? '1' : '0');
    } catch { /* ignore */ }
  }

  async function loadPage() {
    const api = window.anixApi?.release;
    if (!api?.badges || !hasMore || loadingMore) return;
    loadingMore = true;
    try {
      const res = resolveJacksonRefs(await api.badges(releaseId, page));
      if (res?.code != null && res.code !== 0) throw new Error(`code ${res.code}`);
      const content = (res?.content ?? []).filter((b): b is ApiBadge => !!b && Number(b.id) > 0);
      const known = new Set(items.map((b) => b.id));
      items = [...items, ...content.filter((b) => !known.has(b.id))];
      const pages = Number(res?.total_page_count);
      hasMore = content.length > 0 && (Number.isFinite(pages) && pages > 0 ? page + 1 < pages : content.length >= 25);
      page += 1;
      loadState = 'ready';
    } catch {
      if (!items.length) loadState = 'error';
      else showToast('Не удалось загрузить значки', 'err');
      hasMore = false;
    } finally {
      loadingMore = false;
    }
  }

  function retry() {
    loadState = 'loading';
    hasMore = true;
    page = 0;
    void loadPage();
  }

  function onListScroll(e: Event) {
    const el = e.currentTarget as HTMLElement;
    if (el.scrollHeight - el.scrollTop - el.clientHeight < 200) void loadPage();
  }

  function isHidden(badge: ApiBadge): boolean {
    return !showUnearned && badge.is_owned === false && !revealed.has(badge.id);
  }

  function open(badge: ApiBadge) {
    if (isHidden(badge)) {
      revealed = new Set([...revealed, badge.id]);
      return;
    }
    if (badge.is_owned) rememberRecentBadge(badge.id);
    openBadge = badge;
  }

  function patchBadge(id: number, patch: Partial<ApiBadge>) {
    items = items.map((b) => (b.id === id ? { ...b, ...patch } : b));
    if (openBadge?.id === id) openBadge = { ...openBadge, ...patch };
  }

  async function selectBadge(badge: ApiBadge) {
    const api = window.anixApi?.settings;
    if (busy || !api?.setBadge) return;
    busy = true;
    try {
      const res = await api.setBadge(badge.id);
      if (res?.code !== 0) throw new Error();
      items = items.map((b) => ({ ...b, is_selected: b.id === badge.id }));
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
    if (busy || !api?.removeBadge) return;
    busy = true;
    try {
      const res = await api.removeBadge();
      if (res?.code !== 0) throw new Error();
      items = items.map((b) => ({ ...b, is_selected: false }));
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
    if (busy || !api?.pinBadge || !api?.unpinBadge) return;
    const pinned = !!badge.is_showcased;
    busy = true;
    try {
      const res = pinned ? await api.unpinBadge(badge.id) : await api.pinBadge(badge.id);
      if (res?.code === 3) {
        showToast('На витрине можно закрепить не более 3 значков', 'info');
        return;
      }
      if (res?.code !== 0) throw new Error();
      patchBadge(badge.id, { is_showcased: !pinned });
    } catch {
      showToast('Не удалось обновить витрину. Попробуйте ещё раз.', 'err');
    } finally {
      busy = false;
    }
  }

  function openRelease(id: number) {
    openBadge = null;
    if (id === releaseId) return;
    onClose();
    navigate(`/release/${id}`);
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape' && !openBadge) onClose();
  }

  onMount(() => {
    void loadPage();
  });
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
    class="uiv2-choice-sheet__panel uiv2-choice-sheet__panel--form release-badges"
    transition:scale={{ duration: 220, start: 0.94, easing: cubicOut }}
  >
    <header class="release-badges__head">
      <h3 id={titleId} class="uiv2-choice-sheet__title">Значки</h3>
      {#if count > 0}
        <span class="uiv2-card__pill">{loadState === 'ready' && items.length ? `${ownedCount} из ${count}` : count}</span>
      {/if}
      {#if hasUnearned}
        <UiV2RoundButton
          size="sm"
          class="release-badges__toggle"
          label={showUnearned ? 'Скрыть неполученные значки' : 'Раскрыть неполученные значки'}
          onclick={toggleUnearned}
        >
          {@html showUnearned ? iconEyeOff(16) : iconEye(16)}
        </UiV2RoundButton>
      {/if}
    </header>

    <p class="release-badges__hint">
      Значки этого релиза можно получить за разные действия — например, добавление в определённый список
      или просмотр отдельных серий. У каждого значка свои условия.
    </p>

    <div class="release-badges__scroll" onscroll={onListScroll}>
      {#if loadState === 'loading'}
        <div class="release-badges__grid" aria-busy="true">
          {#each Array(6) as _, i (i)}
            <UiV2Skeleton class="release-badges__skeleton" />
          {/each}
        </div>
      {:else if loadState === 'error'}
        <div class="release-badges__empty">
          <p class="release-badges__empty-title">Не удалось загрузить значки</p>
          <UiV2Button label="Повторить" variant="chrome" onclick={retry} />
        </div>
      {:else if items.length === 0}
        <div class="release-badges__empty">
          <p class="release-badges__empty-title">Нет значков</p>
          <p class="release-badges__empty-text">Для этого релиза пока нет значков</p>
        </div>
      {:else}
        <div class="release-badges__grid">
          {#each items as badge (badge.id)}
            <BadgeTile
              {badge}
              selected={!!badge.is_selected}
              hideUnowned={isHidden(badge)}
              onclick={open}
            />
          {/each}
        </div>
        {#if loadingMore}
          <p class="release-badges__more">Загрузка…</p>
        {/if}
      {/if}
    </div>

    <UiV2Button label="Закрыть" size="lg" block variant="chrome" onclick={onClose} />
  </div>
</div>

{#if openBadge}
  <BadgeDetailSheet
    badge={openBadge}
    editable={!!openBadge.is_owned}
    selected={!!openBadge.is_selected}
    {busy}
    onClose={() => (openBadge = null)}
    onSelect={(b) => void selectBadge(b)}
    onUnselect={() => void unselectBadge()}
    onTogglePin={(b) => void togglePin(b)}
    onOpenRelease={openRelease}
  />
{/if}

<style lang="scss">
  .release-badges {
    width: min(100%, 34rem);
    overflow: hidden;
  }

  .release-badges__head {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-width: 0;

    :global(.release-badges__toggle) {
      margin-left: auto;
    }
  }

  .release-badges__hint {
    margin: 0;
    color: var(--uiv2-fg-muted);
    font-size: 0.78rem;
    line-height: 1.45;
  }

  .release-badges__scroll {
    flex: 1 1 auto;
    min-height: 0;
    margin: 0 -0.35rem;
    padding: 0.35rem;
    overflow-y: auto;
    overscroll-behavior: contain;
  }

  .release-badges__grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(6.75rem, 1fr));
    gap: 0.6rem;

    :global(.release-badges__skeleton) {
      display: block;
      height: 8.25rem;
      border-radius: 14px;
    }
  }

  .release-badges__empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.35rem;
    padding: 2rem 1rem;
    text-align: center;
  }

  .release-badges__empty-title {
    margin: 0;
    color: var(--uikit-v2-text);
    font-size: 0.95rem;
    font-weight: 600;
  }

  .release-badges__empty-text,
  .release-badges__more {
    margin: 0;
    color: var(--uiv2-fg-muted);
    font-size: 0.8rem;
    text-align: center;
  }

  .release-badges__more {
    padding: 0.75rem 0 0.25rem;
  }
</style>
