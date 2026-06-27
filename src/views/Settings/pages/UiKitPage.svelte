<script lang="ts">
  import { navigate } from '../../../stores/navigation';
  import ReleaseCardH from '../../../components/ReleaseCardH.svelte';
  import type { ReleaseCardData } from '../../../types/release';

  const SAMPLE_CARD: ReleaseCardData = {
    id: 2,
    titleRu: 'Адская девочка',
    titleEn: 'Jigoku Shoujo',
    description: 'Всё началось с того, как у Маюми пропали сто тысяч йен, собранных всем классом на благотворительность.',
    poster: 'https://s.anixmirai.com/posters/VPHehhgSpJ9VRap8e2VpahnZPYyaof.jpg',
    titleAlt: '地獄少女',
    rating: 4.23,
    voteCount: 2079,
    episodesReleased: 26,
    episodesTotal: 26,
    year: '2005',
    country: 'Япония',
    status: 'Вышел',
    genres: 'сверхъестественное, тайна, триллер, ужасы, психологическое',
    studio: 'Studio Deen',
    category: 'Сериал',
    releaseDate: 'c 05.10.2005 по 05.04.2006',
  };
</script>

<div class="developer-uikit">
  <p class="settings-section__desc">Компоненты и стили приложения.</p>
  <!-- svelte-ignore a11y_interactive_supports_focus -->
  <!-- svelte-ignore a11y_click_events_have_key_events -->
  <button
    class="settings-nav__item"
    style="width:auto;display:inline-flex;padding:8px 16px;background:rgba(255,255,255,0.06);border-radius:4px;"
    onclick={() => navigate('/uikit')}
  >
    Открыть UI Kit
  </button>

  <div class="uikit-section" style="margin-top:1.5rem">
    <h3 class="uikit-section__title" style="margin:0 0 0.35rem;font-size:1rem;font-weight:600;color:var(--color-text-muted);text-transform:uppercase;letter-spacing:0.05em">Карточка релиза (каталог)</h3>
    <p class="uikit-section__desc" style="margin:0 0 1rem;font-size:0.9rem;color:var(--color-text-muted)">Горизонтальная карточка с данными из API (grade, poster, episodes)</p>
    <div class="uikit-catalog-cards" style="display:flex;flex-direction:column;gap:1rem;max-width:100%">
      <ReleaseCardH data={SAMPLE_CARD} />
    </div>
  </div>
</div>
