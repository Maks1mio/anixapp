<div class="overview-skeleton" aria-busy="true" aria-label="Загрузка обзора">
  <section class="overview-hero" aria-hidden="true">
    <div class="overview-skeleton__stage">
      <div class="overview-skeleton__stage-shade"></div>
      <div class="overview-skeleton__stage-content">
        <div class="overview-skeleton__block overview-skeleton__stage-title"></div>
        <div class="overview-skeleton__block overview-skeleton__stage-desc"></div>
        <div class="overview-skeleton__stage-actions">
          <div class="overview-skeleton__block overview-skeleton__stage-btn"></div>
          <div class="overview-skeleton__block overview-skeleton__stage-btn overview-skeleton__stage-btn--ghost"></div>
        </div>
      </div>
      <div class="overview-skeleton__stage-controls" aria-hidden="true">
        <div class="overview-skeleton__block overview-skeleton__stage-ctrl"></div>
        <div class="overview-skeleton__block overview-skeleton__stage-ctrl"></div>
      </div>
      <div class="overview-skeleton__stage-dots" aria-hidden="true">
        {#each [0, 1, 2, 3, 4] as i (i)}
          <span class="overview-skeleton__block overview-skeleton__stage-dot"></span>
        {/each}
      </div>
    </div>
  </section>

  <div class="overview-page__content">
    <section class="overview-section">
      <header class="overview-section-head overview-skeleton__section-head">
        <div class="overview-skeleton__head-text">
          <div class="overview-skeleton__block overview-skeleton__head-title"></div>
          <div class="overview-skeleton__block overview-skeleton__head-sub"></div>
        </div>
        <div class="overview-skeleton__block overview-skeleton__head-more"></div>
      </header>
      <div class="overview-carousel">
        <div class="overview-skeleton__carousel">
          {#each [0, 1, 2, 3, 4, 5, 6] as i (i)}
            <div class="overview-skeleton__poster-card">
              <div class="overview-skeleton__block overview-skeleton__poster"></div>
              <div class="overview-skeleton__block overview-skeleton__poster-title"></div>
            </div>
          {/each}
        </div>
      </div>
    </section>

    <section class="overview-section">
      <header class="overview-section-head">
        <div class="overview-skeleton__block overview-skeleton__section-title"></div>
      </header>
      <div class="overview-skeleton__discuss-list">
        {#each [0, 1, 2, 3] as i (i)}
          <div class="overview-skeleton__discuss-row">
            <div class="overview-skeleton__block overview-skeleton__discuss-poster"></div>
            <div class="overview-skeleton__discuss-body">
              <div class="overview-skeleton__block overview-skeleton__discuss-title"></div>
              <div class="overview-skeleton__block overview-skeleton__discuss-meta"></div>
              <div class="overview-skeleton__block overview-skeleton__discuss-comments"></div>
            </div>
          </div>
        {/each}
      </div>
    </section>

    <section class="overview-section">
      <header class="overview-section-head overview-skeleton__section-head">
        <div class="overview-skeleton__block overview-skeleton__section-title"></div>
        <div class="overview-skeleton__block overview-skeleton__head-more"></div>
      </header>
      <div class="overview-carousel">
        <div class="overview-skeleton__carousel">
          {#each [0, 1, 2, 3, 4, 5] as i (i)}
            <div class="overview-skeleton__poster-card">
              <div class="overview-skeleton__block overview-skeleton__poster"></div>
              <div class="overview-skeleton__block overview-skeleton__poster-title"></div>
            </div>
          {/each}
        </div>
      </div>
    </section>
  </div>
</div>
