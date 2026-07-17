<script lang="ts">
  export interface ProfileTab {
    id: string;
    label: string;
    icon: string;
  }

  interface Props {
    tabs: ProfileTab[];
    activeId: string;
    onChange: (id: string) => void;
  }

  let { tabs, activeId, onChange }: Props = $props();
</script>

<div class="profile-ui__tabs" role="tablist" aria-label="Разделы профиля">
  {#each tabs as tab}
    <button
      type="button"
      role="tab"
      class="profile-ui__tab"
      class:profile-ui__tab--active={tab.id === activeId}
      aria-selected={tab.id === activeId}
      onclick={() => onChange(tab.id)}
    >
      <span class="profile-ui__tab-icon" aria-hidden="true">{@html tab.icon}</span>
      <span class="profile-ui__tab-label">{tab.label}</span>
    </button>
  {/each}
</div>
