<script lang="ts">
  import DeveloperApiBridgeSection from './DeveloperApiBridgeSection.svelte';
  import DeveloperAnixbackSection from './DeveloperAnixbackSection.svelte';
  import LogsPage from './LogsPage.svelte';
  import UiKitPage from './UiKitPage.svelte';
  import UiKitV2Page from './UiKitV2Page.svelte';
</script>

<div class="settings-modal-content developer-settings">
  <DeveloperApiBridgeSection />
  <DeveloperAnixbackSection />

  <section class="developer-settings__block">
    <p class="settings-section__label">Журнал событий</p>
    <LogsPage />
  </section>

  <section class="developer-settings__block">
    <p class="settings-section__label">UI Kit</p>
    <UiKitPage />
  </section>

  <section class="developer-settings__block">
    <p class="settings-section__label">UI Kit V2</p>
    <UiKitV2Page />
  </section>
</div>
