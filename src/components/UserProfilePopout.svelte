<script lang="ts">
  import { onDestroy, onMount, untrack } from 'svelte';
  import ProfileDiscordCard from './ProfileDiscordCard.svelte';
  import { userProfilePopout, closeUserProfilePopout } from '../stores/user-profile';
  import { loadProfilePreview, type ProfilePreviewData } from '../utils/profile-preview';

  const POPOUT_WIDTH = 300;
  const GAP = 8;
  const EDGE = 8;

  let target = $state<{ userId: number; anchor: HTMLElement } | null>(null);
  let popoutEl = $state<HTMLElement | null>(null);
  let loadState = $state<'loading' | 'error' | 'ready'>('loading');
  let preview = $state<ProfilePreviewData | null>(null);

  function positionPopout() {
    if (!popoutEl || !target) return;
    const ar = target.anchor.getBoundingClientRect();
    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const height = popoutEl.offsetHeight;

    let left = ar.left;
    if (left + POPOUT_WIDTH > vw - EDGE) left = ar.right - POPOUT_WIDTH;
    if (left < EDGE) left = EDGE;

    let top = ar.bottom + GAP;
    if (top + height > vh - EDGE) top = Math.max(EDGE, ar.top - GAP - height);

    popoutEl.style.position = 'fixed';
    popoutEl.style.left = `${left}px`;
    popoutEl.style.top = `${top}px`;
    popoutEl.style.width = `${POPOUT_WIDTH}px`;
  }

  async function loadPreview(userId: number) {
    loadState = 'loading';
    preview = null;
    const data = await loadProfilePreview(userId);
    if (!data) {
      loadState = 'error';
      return;
    }
    preview = data;
    loadState = 'ready';
    requestAnimationFrame(positionPopout);
  }

  function onDocumentMouseDown(event: MouseEvent) {
    const node = event.target as Node;
    if (popoutEl?.contains(node) || target?.anchor.contains(node)) return;
    closeUserProfilePopout();
  }

  function onDocumentKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') closeUserProfilePopout();
  }

  function onReposition() {
    positionPopout();
  }

  $effect(() => {
    const next = $userProfilePopout;
    const prevUserId = untrack(() => target?.userId);
    target = next;
    if (!next) {
      preview = null;
      loadState = 'loading';
      return;
    }
    if (next.userId !== prevUserId) void loadPreview(next.userId);
    else requestAnimationFrame(positionPopout);
  });

  onMount(() => {
    document.addEventListener('mousedown', onDocumentMouseDown, true);
    document.addEventListener('keydown', onDocumentKeyDown, true);
    window.addEventListener('resize', onReposition);
    window.addEventListener('scroll', onReposition, true);
  });

  onDestroy(() => {
    document.removeEventListener('mousedown', onDocumentMouseDown, true);
    document.removeEventListener('keydown', onDocumentKeyDown, true);
    window.removeEventListener('resize', onReposition);
    window.removeEventListener('scroll', onReposition, true);
  });
</script>

{#if target}
  <div
    bind:this={popoutEl}
    class="user-popout"
    role="dialog"
    aria-label="Профиль пользователя"
  >
    {#if loadState === 'loading'}
      <div class="user-popout__state">Загрузка…</div>
    {:else if loadState === 'error' || !preview?.profile}
      <div class="user-popout__state user-popout__state--error">Не удалось загрузить профиль</div>
    {:else}
      <ProfileDiscordCard
        profile={preview.profile}
        coverUrl={preview.coverUrl}
        isMyProfile={preview.isMyProfile}
        selfProfileId={preview.selfProfileId}
        variant="popout"
        showFullLink={true}
      />
    {/if}
  </div>
{/if}
