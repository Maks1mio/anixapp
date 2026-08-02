<script lang="ts">
  import { fly, fade } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import {
    iconBan,
    iconCopy,
    iconEyeOff,
    iconInfo,
    iconLoginHistory,
    iconShare,
  } from './icons';

  export type ProfileMoreAction =
    | 'loginHistory'
    | 'share'
    | 'copyLink'
    | 'muteBlog'
    | 'report'
    | 'block';

  interface Props {
    isMyProfile: boolean;
    onClose: () => void;
    onAction: (id: ProfileMoreAction) => void;
  }

  let { isMyProfile, onClose, onAction }: Props = $props();

  type Item = {
    id: ProfileMoreAction;
    label: string;
    icon: string;
    danger?: boolean;
  };

  const items = $derived.by((): Item[] => {
    const base: Item[] = [
      { id: 'loginHistory', label: 'История никнейма', icon: iconLoginHistory(22) },
      { id: 'share', label: 'Поделиться', icon: iconShare(22) },
      { id: 'copyLink', label: 'Скопировать ссылку', icon: iconCopy(22) },
    ];
    if (isMyProfile) return base;
    return [
      ...base,
      { id: 'muteBlog', label: 'Скрыть блог из ленты', icon: iconEyeOff(22) },
      { id: 'report', label: 'Пожаловаться', icon: iconInfo(22), danger: true },
      { id: 'block', label: 'Заблокировать', icon: iconBan(22), danger: true },
    ];
  });

  function select(id: ProfileMoreAction) {
    onAction(id);
    onClose();
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Escape') onClose();
  }
</script>

<svelte:window onkeydown={onKeydown} />

<div class="profile-panel__social-sheet" role="dialog" aria-modal="true" aria-label="Действия профиля">
  <button
    type="button"
    class="profile-panel__social-sheet-backdrop"
    aria-label="Закрыть"
    onclick={onClose}
    transition:fade={{ duration: 160 }}
  ></button>

  <div
    class="profile-panel__social-sheet-panel profile-panel__more-sheet-panel"
    transition:fly={{ y: 36, duration: 260, easing: cubicOut }}
  >
    <div class="profile-panel__social-sheet-handle" aria-hidden="true"></div>
    <ul class="profile-panel__social-sheet-list">
      {#each items as item (item.id)}
        <li>
          <button
            type="button"
            class="profile-panel__social-sheet-item"
            class:profile-panel__social-sheet-item--danger={item.danger}
            onclick={() => select(item.id)}
          >
            <span class="profile-panel__social-sheet-icon" aria-hidden="true">{@html item.icon}</span>
            <span class="profile-panel__social-sheet-label">{item.label}</span>
          </button>
        </li>
      {/each}
    </ul>
  </div>
</div>
