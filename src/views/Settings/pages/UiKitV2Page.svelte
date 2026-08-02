<script lang="ts">
  import { navigate } from '../../../stores/navigation';
</script>

<div class="developer-uikit-v2">
  <p class="settings-section__desc">
    Песочница для нового UI. Компоненты и токены V2 собираем здесь отдельно от текущего UI Kit.
  </p>
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <button
    class="settings-nav__item"
    style="width:auto;display:inline-flex;padding:8px 16px;background:rgba(255,255,255,0.06);border-radius:4px;"
    onclick={() => navigate('/uikit-v2')}
  >
    Открыть UI Kit V2
  </button>
</div>
