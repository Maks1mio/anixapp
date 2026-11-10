<script lang="ts">
  /**
   * Карточка «Доступно обновление» на главной телефона: последний релиз GitHub с APK другой версии.
   * Кнопка скачивает APK и открывает установщик; Скрыть её нельзя — она уходит сама после обновления.
   */
  import { onMount } from 'svelte';
  import { iconDownload } from './icons';
  import {
    cancelMobileUpdate,
    checkMobileUpdate,
    formatBytes,
    installMobileUpdate,
    mobileUpdate,
  } from '../stores/mobile-update';

  const show = $derived(
    $mobileUpdate.available && !!$mobileUpdate.latest,
  );
  const dl = $derived($mobileUpdate.download);

  onMount(() => {
    void checkMobileUpdate();
  });
</script>

{#if show && $mobileUpdate.latest}
  <!-- Телефон — строка над «Продолжить просмотр»; планшет — колонка справа от неё (стиль ряда в mobile-overrides.scss) -->
  <section class="m-home-update" aria-label="Доступно обновление">
    <span class="m-home-update__icon" aria-hidden="true">{@html iconDownload(20)}</span>
    <div class="m-home-update__text">
      <span class="m-home-update__title">
        {#if dl.state === 'downloading'}Скачивается {$mobileUpdate.latest.version}
        {:else if dl.state === 'downloaded'}Версия {$mobileUpdate.latest.version} скачана
        {:else}Вышла версия {$mobileUpdate.latest.version}{/if}
      </span>
      <span class="m-home-update__meta">
        {#if dl.state === 'downloading'}
          {dl.percent}%{dl.total ? ` из ${formatBytes(dl.total)}` : ''}
        {:else if dl.state === 'downloaded'}
          Осталось установить
        {:else}
          {[formatBytes($mobileUpdate.latest.apkSize), 'обновление AnixApp'].filter(Boolean).join(' · ')}
        {/if}
      </span>
    </div>
    {#if dl.state === 'downloading'}
      <button type="button" class="m-home-update__btn m-home-update__btn--tonal" onclick={cancelMobileUpdate}>Отмена</button>
    {:else}
      <button type="button" class="m-home-update__btn" onclick={() => void installMobileUpdate()}>
        {dl.state === 'downloaded' ? 'Установить' : 'Обновить'}
      </button>
    {/if}
    {#if dl.state === 'downloading'}
      <span class="m-home-update__progress" aria-hidden="true"><span style:width="{dl.percent}%"></span></span>
    {/if}
  </section>
{/if}

<style lang="scss">
  .m-home-update {
    position: relative;
    overflow: hidden;
    display: flex;
    align-items: center;
    gap: var(--m-space-3, 12px);
    padding: var(--m-space-3, 12px);
    border-radius: 16px;
    background: var(--m-surface-block, var(--uiv2-hover-bg));
  }

  .m-home-update__icon {
    flex: none;
    display: inline-flex;
    align-items: center;
    justify-content: center;
    width: 40px;
    height: 40px;
    border-radius: 12px;
    background: color-mix(in srgb, var(--m-primary, #e65454) 16%, transparent);
    color: var(--m-primary, #e65454);
  }

  .m-home-update__text {
    flex: 1 1 auto;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 2px;
  }

  .m-home-update__title,
  .m-home-update__meta {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    font-variant-numeric: tabular-nums;
  }

  .m-home-update__title {
    color: var(--m-text, var(--uiv2-fg-strong));
    font: 500 15px/20px var(--m-font, inherit);
  }

  .m-home-update__meta {
    color: var(--m-text-2, var(--uiv2-fg-muted));
    font: 400 13px/16px var(--m-font, inherit);
  }

  .m-home-update__btn {
    flex: none;
    order: 3;
    height: 36px;
    padding: 0 var(--m-space-4, 16px);
    border: 0;
    border-radius: 18px;
    background: var(--m-primary, #e65454);
    color: var(--m-on-primary, #fff);
    font: 500 14px var(--m-font, inherit);
    white-space: nowrap;
    transition: transform 0.12s ease, filter 0.12s ease;

    &:active {
      transform: scale(0.97);
      filter: brightness(0.92);
    }

    &--tonal {
      background: color-mix(in srgb, var(--m-primary, #e65454) 16%, transparent);
      color: var(--m-primary, #e65454);
    }
  }


  .m-home-update__progress {
    position: absolute;
    left: 0;
    right: 0;
    bottom: 0;
    height: 3px;
    background: color-mix(in srgb, var(--m-text, #fff) 8%, transparent);

    > span {
      display: block;
      height: 100%;
      background: var(--m-primary, #e65454);
      transition: width 0.2s linear;
    }
  }

  /* Планшет: колонка рядом с «Продолжить просмотр» — шапка сверху, кнопка во всю ширину снизу */
  @media (min-width: 600px) {
    .m-home-update {
      flex-wrap: wrap;
      align-content: space-between;
      align-items: flex-start;
      padding: var(--m-space-4, 16px);
    }

    .m-home-update__icon {
      width: 44px;
      height: 44px;
    }

    .m-home-update__text {
      flex-basis: 0;
      padding-top: 2px;
    }


    .m-home-update__btn {
      flex: 1 0 100%;
      height: 40px;
      border-radius: 20px;
    }
  }
</style>
