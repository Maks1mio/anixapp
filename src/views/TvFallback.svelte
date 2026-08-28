<script lang="ts">
  import TvPage from '../components/tv/TvPage.svelte';
  import { navigate } from '../stores/navigation';

  interface Props {
    path?: string;
  }

  let { path = '/' }: Props = $props();
</script>

<TvPage title="Раздел в разработке" subtitle={path}>
  <p class="tv-page__status">
    Для TV пока нет отдельной страницы этого раздела. Вернитесь в меню слева или нажмите «Назад».
  </p>
  <button type="button" class="tv-page__back" onclick={() => navigate('/')}>
    На главную
  </button>
</TvPage>
