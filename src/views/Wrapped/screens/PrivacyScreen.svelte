<script lang="ts">
  import WrappedScreenShell from '../components/WrappedScreenShell.svelte';
  import type { WrappedData } from '../shared/wrapped-load';

  interface Props {
    data: WrappedData;
    onHome: () => void;
  }

  let { data, onHome }: Props = $props();
</script>

<WrappedScreenShell id="privacy">
  <div class="wrapped-block wrapped-block--center">
    <h2 class="wrapped-heading" data-wrapped-animate>Статистика скрыта</h2>
    <p class="wrapped-lead" data-wrapped-animate>
      {data.login}, ты скрыл статистику в настройках профиля. Мы всё равно подготовили итоги
      на основе доступных данных.
    </p>
    <p class="wrapped-meta wrapped-meta--muted" data-wrapped-animate>
      Открой статистику в профиле, чтобы увидеть больше цифр в следующем году.
    </p>
    <button type="button" class="wrapped-btn" data-wrapped-animate onclick={onHome}>На главную</button>
  </div>
</WrappedScreenShell>
