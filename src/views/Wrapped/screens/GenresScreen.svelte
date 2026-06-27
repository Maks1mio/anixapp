<script lang="ts">
  import WrappedScreenShell from '../components/WrappedScreenShell.svelte';
  import type { WrappedData } from '../shared/wrapped-load';

  interface Props { data: WrappedData; }
  let { data }: Props = $props();

  const max = $derived(data.topGenresYear[0]?.count ?? 1);
</script>

<WrappedScreenShell id="genres" align="start">
  <div class="wrapped-block">
    <p class="wrapped-eyebrow" data-wrapped-animate>Жанровый микс</p>
    <h2 class="wrapped-heading" data-wrapped-animate>Что смотрел в {data.year}</h2>
    <p class="wrapped-lead" data-wrapped-animate>
      По {data.yearStats.watchedThisYear} тайтлам из истории — твои частые жанры
    </p>

    <div class="wrapped-pref-block wrapped-glass wrapped-pref-block--wide">
      <div class="wrapped-pref-block__bars">
        {#each data.topGenresYear as g, i}
          {@const pct = Math.round((g.count / max) * 100)}
          <div class="wrapped-pref-bar" data-wrapped-animate style="--delay:{i}">
            <div class="wrapped-pref-bar__head">
              <span>{g.name}</span>
              <strong>{g.count}</strong>
            </div>
            <div class="wrapped-pref-bar__track">
              <div class="wrapped-pref-bar__fill" data-bar-fill style="width:{pct}%"></div>
            </div>
          </div>
        {/each}
      </div>
    </div>
  </div>
</WrappedScreenShell>
