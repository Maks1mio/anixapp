<script lang="ts">
  interface Props {
    grade:          number | null;
    hasRating:      boolean;
    voteCount:      number;
    vote1: number; vote2: number; vote3: number; vote4: number; vote5: number;
    watchingCount:  number;
    planCount:      number;
    completedCount: number;
    holdOnCount:    number;
    droppedCount:   number;
  }

  let {
    grade, hasRating, voteCount,
    vote1, vote2, vote3, vote4, vote5,
    watchingCount, planCount, completedCount, holdOnCount, droppedCount,
  }: Props = $props();

  const totalList = $derived(watchingCount + planCount + completedCount + holdOnCount + droppedCount);
  const lp = (n: number) => totalList > 0 ? (n / totalList) * 100 : 0;
</script>

<div class="release-page__section release-page__rating-block">
  <h2 class="release-page__section-title">Рейтинг</h2>

  <div class="release-page__rating-content">
    <div class="release-page__rating-main">
      <div class="release-page__rating-value">
        {grade != null && hasRating ? grade.toFixed(2) : '—'}
      </div>
      {#if voteCount > 0}
        <div class="release-page__rating-votes-label">{voteCount.toLocaleString('ru-RU')} голосов</div>
      {/if}
    </div>

    <div class="release-page__rating-bars">
      {#each [5, 4, 3, 2, 1] as star}
        {@const v   = star === 5 ? vote5 : star === 4 ? vote4 : star === 3 ? vote3 : star === 2 ? vote2 : vote1}
        {@const pct = voteCount > 0 ? (v / voteCount) * 100 : 0}
        <div class="release-page__rating-bar-row">
          <span class="release-page__rating-bar-label">{star}</span>
          <div class="release-page__rating-bar-track">
            <div class="release-page__rating-bar-fill" style="width:{pct}%"></div>
          </div>
        </div>
      {/each}
    </div>
  </div>

  {#if totalList > 0}
    <div class="release-page__list-stats">
      <div class="release-page__list-stats-bar">
        <div class="release-page__list-stats-seg release-page__list-stats-seg--watching"  style="width:{lp(watchingCount)}%"  title="Смотрю: {watchingCount.toLocaleString('ru-RU')}"></div>
        <div class="release-page__list-stats-seg release-page__list-stats-seg--planned"   style="width:{lp(planCount)}%"      title="В планах: {planCount.toLocaleString('ru-RU')}"></div>
        <div class="release-page__list-stats-seg release-page__list-stats-seg--completed" style="width:{lp(completedCount)}%" title="Просмотрено: {completedCount.toLocaleString('ru-RU')}"></div>
        <div class="release-page__list-stats-seg release-page__list-stats-seg--on_hold"   style="width:{lp(holdOnCount)}%"   title="Отложено: {holdOnCount.toLocaleString('ru-RU')}"></div>
        <div class="release-page__list-stats-seg release-page__list-stats-seg--dropped"   style="width:{lp(droppedCount)}%"  title="Брошено: {droppedCount.toLocaleString('ru-RU')}"></div>
      </div>
      <div class="release-page__list-stats-legend">
        <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--watching"><i></i> Смотрю — {watchingCount.toLocaleString('ru-RU')}</span>
        <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--planned"><i></i> В планах — {planCount.toLocaleString('ru-RU')}</span>
        <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--completed"><i></i> Просмотрено — {completedCount.toLocaleString('ru-RU')}</span>
        <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--on_hold"><i></i> Отложено — {holdOnCount.toLocaleString('ru-RU')}</span>
        <span class="release-page__list-stats-legend-item release-page__list-stats-legend-item--dropped"><i></i> Брошено — {droppedCount.toLocaleString('ru-RU')}</span>
      </div>
    </div>
  {/if}
</div>
