<script lang="ts">
  import { onMount } from 'svelte';
  import ProfilePage from '../views/Profile/page.svelte';

  interface Props {
    userId: number;
    onClose: () => void;
  }

  const { userId, onClose }: Props = $props();

  let open = $state(false);
  let closing = $state(false);

  function requestClose() {
    if (closing) return;
    closing = true;
    open = false;
    window.setTimeout(() => onClose(), 150);
  }

  function onOverlayClick(event: MouseEvent) {
    if (event.target === event.currentTarget) requestClose();
  }

  function onKeyDown(event: KeyboardEvent) {
    if (event.key === 'Escape') requestClose();
  }

  onMount(() => {
    requestAnimationFrame(() => { open = true; });
  });
</script>

<svelte:window onkeydown={onKeyDown} />

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div
  class="profile-modal-overlay"
  class:profile-modal-overlay--open={open}
  class:profile-modal-overlay--closing={closing}
  onclick={onOverlayClick}
>
  <div class="profile-modal profile-modal--discord" role="dialog" aria-modal="true" aria-label="Профиль пользователя">
    <button type="button" class="profile-modal__close" aria-label="Закрыть" onclick={requestClose}>×</button>
    <div class="profile-modal__discord-body">
      {#key userId}
        <ProfilePage id={userId} embedded discordLayout />
      {/key}
    </div>
  </div>
</div>
