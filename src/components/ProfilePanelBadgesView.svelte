<script lang="ts">
  /** Коллекция значков чужого профиля (только просмотр). Свой профиль открывает «Установку значка». */
  import UiV2BackBar from './uikit-v2/UiV2BackBar.svelte';
  import ProfileBadgesView from './profile-badges/ProfileBadgesView.svelte';

  interface Props {
    profileId: number;
    login: string;
    onBack: () => void;
  }

  let { profileId, login, onBack }: Props = $props();
</script>

<div class="profile-panel__edit-view">
  <header class="profile-panel__friends-head">
    <UiV2BackBar
      segments={[
        { label: 'Значки', active: true },
        { label: login },
      ]}
      {onBack}
    />
  </header>
  <ProfileBadgesView {profileId} {login} readonly />
</div>
