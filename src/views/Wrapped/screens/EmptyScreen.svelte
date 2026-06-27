<script lang="ts">
  import WrappedScreenShell from '../components/WrappedScreenShell.svelte';

  interface Props { onHome: () => void; }
  let { onHome }: Props = $props();
</script>

<WrappedScreenShell id="empty">
  <div class="wrapped-block wrapped-block--center">
    <h2 class="wrapped-heading" data-wrapped-animate>Мало данных</h2>
    <p class="wrapped-lead" data-wrapped-animate>
      Пока недостаточно истории просмотров для персональных итогов. Смотри аниме — и возвращайся в конце года!
    </p>
    <button type="button" class="wrapped-btn wrapped-btn--primary" data-wrapped-animate onclick={onHome}>
      На главную
    </button>
  </div>
</WrappedScreenShell>
