<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { showToast } from '../stores/toast';
  import {
    listSocialLinks,
    openSocialLink,
    SOCIAL_ICONS,
    type ProfileSocialPages,
    type ProfileSocialLink,
  } from '../utils/profile-social';

  interface Props {
    pages: ProfileSocialPages;
    onClose: () => void;
  }

  let { pages, onClose }: Props = $props();

  const links = $derived(listSocialLinks(pages));

  async function onSelect(link: ProfileSocialLink) {
    const result = await openSocialLink(link);
    if (result === 'copied') showToast(`Discord: ${link.value} скопирован`);
    else if (result === 'error' && link.copy) showToast('Не удалось скопировать', 'err');
    if (result !== 'error' || !link.copy) onClose();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="profile-panel__social-sheet" role="dialog" aria-modal="true" aria-labelledby="profile-social-sheet-title">
  <button
    type="button"
    class="profile-panel__social-sheet-backdrop"
    aria-label="Закрыть"
    onclick={onClose}
    transition:fade={{ duration: 160 }}
  ></button>

  <div
    class="profile-panel__social-sheet-panel"
    transition:fly={{ y: 36, duration: 260, easing: cubicOut }}
  >
    <div class="profile-panel__social-sheet-handle" aria-hidden="true"></div>
    <h3 id="profile-social-sheet-title" class="profile-panel__social-sheet-title">Отправить сообщение</h3>

    {#if !links.length}
      <p class="profile-panel__social-sheet-empty">Соцсети скрыты или не указаны</p>
    {:else}
      <ul class="profile-panel__social-sheet-list">
        {#each links as link (link.id)}
          <li>
            <button
              type="button"
              class="profile-panel__social-sheet-item"
              onclick={() => void onSelect(link)}
            >
              <span class="profile-panel__social-sheet-icon">{@html SOCIAL_ICONS[link.id]}</span>
              <span class="profile-panel__social-sheet-label">{link.label}</span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <button type="button" class="profile-panel__social-sheet-close" onclick={onClose}>
      Закрыть
    </button>
  </div>
</div>
