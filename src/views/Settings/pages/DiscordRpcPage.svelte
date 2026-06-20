<script lang="ts">
  import { onMount } from 'svelte';
  import {
    type DiscordRpcPageSettings,
    type DiscordRpcSettings,
    defaultDiscordRpcSettings,
    normalizeDiscordRpcSettings,
  } from '../../../services/discord-rpc-settings';
  import { invalidateDiscordRpcSettingsCache, refreshDiscordPresence } from '../../../services/discord-presence';

  interface PageItem {
    key: keyof DiscordRpcPageSettings;
    label: string;
    hint?: string;
    /** Вложенная опция — доступна только при включённом parentKey группы */
    nested?: boolean;
  }

  interface PageGroup {
    label: string;
    items: PageItem[];
    /** Одна колонка — для коротких групп без «висящего» элемента во 2-й колонке */
    singleColumn?: boolean;
    /** Родительская настройка для nested-пунктов группы */
    parentKey?: keyof DiscordRpcPageSettings;
  }

  const PAGE_GROUPS: PageGroup[] = [
    {
      label: 'Главная и обзор',
      items: [
        { key: 'discordRpcPageHome', label: 'Главная' },
        { key: 'discordRpcPageOverview', label: 'Обзор' },
        { key: 'discordRpcPagePopular', label: 'Популярное' },
      ],
    },
    {
      label: 'Коллекции',
      items: [
        { key: 'discordRpcPageCollections', label: 'Каталог коллекций' },
        { key: 'discordRpcPageMyCollections', label: 'Мои коллекции' },
        { key: 'discordRpcPageCollection', label: 'Просмотр коллекции' },
        { key: 'discordRpcPageCollectionEdit', label: 'Создание и правка' },
      ],
    },
    {
      label: 'Аниме',
      items: [
        { key: 'discordRpcPageRelease', label: 'Карточка тайтла' },
        { key: 'discordRpcPageReleaseComments', label: 'Комментарии' },
        { key: 'discordRpcPageReleaseRelated', label: 'Связанные тайтлы' },
      ],
    },
    {
      label: 'Профили',
      singleColumn: true,
      parentKey: 'discordRpcPageProfile',
      items: [
        { key: 'discordRpcPageProfile', label: 'Страница профиля' },
        { key: 'discordRpcPageProfileFriends', label: 'Друзья', nested: true },
        { key: 'discordRpcPageProfileVotes', label: 'Оценки', nested: true },
      ],
    },
    {
      label: 'Ещё',
      items: [
        { key: 'discordRpcPageBookmarks', label: 'Закладки' },
        { key: 'discordRpcPageSearch', label: 'Поиск' },
        { key: 'discordRpcPageDownloads', label: 'Загрузки' },
        { key: 'discordRpcPageAnnouncement', label: 'Чат в объявлении' },
        { key: 'discordRpcPageOther', label: 'Остальное', hint: 'Админка, UI Kit и прочие экраны' },
      ],
    },
  ];

  let hasElectron = $state(false);
  let loaded = $state(false);
  let settings = $state<DiscordRpcSettings>(defaultDiscordRpcSettings());

  const navigationEnabled = $derived(settings.discordRpcEnabled && settings.discordRpcShowBrowsing);

  async function loadSettings() {
    if (!window.electron?.getSettings) return;
    hasElectron = true;
    const raw = await window.electron.getSettings();
    settings = normalizeDiscordRpcSettings(raw as Record<string, unknown>);
    loaded = true;
  }

  function save(partial: Partial<DiscordRpcSettings>) {
    settings = { ...settings, ...partial };
    invalidateDiscordRpcSettingsCache();
    window.electron?.saveSettings?.(partial);
    refreshDiscordPresence();
  }

  function savePage(
    key: keyof DiscordRpcPageSettings,
    checked: boolean,
    group?: PageGroup,
  ) {
    if (key === 'discordRpcPageProfile' && !checked) {
      save({
        discordRpcPageProfile: false,
        discordRpcPageProfileFriends: false,
        discordRpcPageProfileVotes: false,
      });
      return;
    }
    save({ [key]: checked } as Partial<DiscordRpcSettings>);
  }

  function isPageItemDisabled(item: PageItem, group: PageGroup): boolean {
    if (!navigationEnabled) return true;
    if (!item.nested || !group.parentKey) return false;
    return settings[group.parentKey] === false;
  }

  onMount(() => void loadSettings());
</script>

<div class="settings-modal-content discord-rpc-settings">
  {#if !hasElectron}
    <p class="settings-account-coming-soon">Статус Discord работает только в десктоп-приложении AnixApp.</p>
  {:else if !loaded}
    <div class="discord-rpc-settings__loading">Загрузка…</div>
  {:else}
    <div class="settings-section">
      <p class="settings-section__label">Основное</p>
      <div class="settings-section__body">
        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Статус в Discord</div>
            <div class="settings-row__desc">
              Показывать в профиле Discord, чем вы заняты в AnixApp. Нужен запущенный Discord на этом ПК.
            </div>
          </div>
          <div class="settings-row__control">
            <label class="settings-toggle-switch" aria-label="Статус в Discord">
              <input
                type="checkbox"
                checked={settings.discordRpcEnabled}
                onchange={(e) => save({ discordRpcEnabled: (e.target as HTMLInputElement).checked })}
              />
              <span class="settings-toggle-switch__track"></span>
              <span class="settings-toggle-switch__thumb"></span>
            </label>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Где вы в приложении</div>
            <div class="settings-row__desc">
              Показывать текущий раздел в статусе. Если выключить — в Discord будет просто «AnixApp · В приложении».
            </div>
          </div>
          <div class="settings-row__control">
            <label class="settings-toggle-switch" aria-label="Где вы в приложении">
              <input
                type="checkbox"
                checked={settings.discordRpcShowBrowsing}
                disabled={!settings.discordRpcEnabled}
                onchange={(e) => save({ discordRpcShowBrowsing: (e.target as HTMLInputElement).checked })}
              />
              <span class="settings-toggle-switch__track"></span>
              <span class="settings-toggle-switch__thumb"></span>
            </label>
          </div>
        </div>
      </div>
    </div>

    <div class="settings-section">
      <p class="settings-section__label">Разделы приложения</p>
      <p class="discord-rpc-settings__section-desc">
        Выберите экраны, для которых Discord будет показывать отдельный статус. Неактивные разделы отображаются как «в приложении».
      </p>
      <div class="settings-section__body discord-rpc-settings__pages">
        {#each PAGE_GROUPS as group}
          <section class="discord-rpc-settings__group">
            <h3 class="discord-rpc-settings__group-title">{group.label}</h3>
            <ul
              class="discord-rpc-settings__grid"
              class:discord-rpc-settings__grid--single={group.singleColumn}
            >
              {#each group.items as item}
                {@const itemDisabled = isPageItemDisabled(item, group)}
                {@const itemChecked = itemDisabled && item.nested ? false : settings[item.key]}
                <li
                  class="discord-rpc-settings__item"
                  class:discord-rpc-settings__item--nested={item.nested}
                >
                  <label class="discord-rpc-settings__item-label">
                    <input
                      type="checkbox"
                      class="discord-rpc-settings__checkbox"
                      checked={itemChecked}
                      disabled={itemDisabled}
                      onchange={(e) => savePage(item.key, (e.target as HTMLInputElement).checked, group)}
                    />
                    <span class="discord-rpc-settings__item-text">
                      <span class="discord-rpc-settings__item-name">{item.label}</span>
                      {#if item.hint}
                        <span class="discord-rpc-settings__item-hint">{item.hint}</span>
                      {/if}
                    </span>
                  </label>
                </li>
              {/each}
            </ul>
          </section>
        {/each}
      </div>
    </div>

    <div class="settings-section">
      <p class="settings-section__label">Плеер и лобби</p>
      <div class="settings-section__body">
        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Текущая серия</div>
            <div class="settings-row__desc">
              Название аниме и номер серии, пока идёт воспроизведение в плеере.
            </div>
          </div>
          <div class="settings-row__control">
            <label class="settings-toggle-switch" aria-label="Текущая серия">
              <input
                type="checkbox"
                checked={settings.discordRpcShowWatching}
                disabled={!settings.discordRpcEnabled}
                onchange={(e) => save({ discordRpcShowWatching: (e.target as HTMLInputElement).checked })}
              />
              <span class="settings-toggle-switch__track"></span>
              <span class="settings-toggle-switch__thumb"></span>
            </label>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Полоса прогресса</div>
            <div class="settings-row__desc">Таймер серии в Discord во время воспроизведения.</div>
          </div>
          <div class="settings-row__control">
            <label class="settings-toggle-switch" aria-label="Полоса прогресса">
              <input
                type="checkbox"
                checked={settings.discordRpcShowProgress}
                disabled={!settings.discordRpcEnabled || !settings.discordRpcShowWatching}
                onchange={(e) => save({ discordRpcShowProgress: (e.target as HTMLInputElement).checked })}
              />
              <span class="settings-toggle-switch__track"></span>
              <span class="settings-toggle-switch__thumb"></span>
            </label>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Озвучка и плеер</div>
            <div class="settings-row__desc">Студия озвучки или источник видео в подписи к статусу.</div>
          </div>
          <div class="settings-row__control">
            <label class="settings-toggle-switch" aria-label="Озвучка и плеер">
              <input
                type="checkbox"
                checked={settings.discordRpcShowDubber}
                disabled={!settings.discordRpcEnabled || !settings.discordRpcShowWatching}
                onchange={(e) => save({ discordRpcShowDubber: (e.target as HTMLInputElement).checked })}
              />
              <span class="settings-toggle-switch__track"></span>
              <span class="settings-toggle-switch__thumb"></span>
            </label>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Обложки и аватары</div>
            <div class="settings-row__desc">Постер аниме или аватар профиля вместо логотипа AnixApp.</div>
          </div>
          <div class="settings-row__control">
            <label class="settings-toggle-switch" aria-label="Обложки и аватары">
              <input
                type="checkbox"
                checked={settings.discordRpcShowImages}
                disabled={!settings.discordRpcEnabled}
                onchange={(e) => save({ discordRpcShowImages: (e.target as HTMLInputElement).checked })}
              />
              <span class="settings-toggle-switch__track"></span>
              <span class="settings-toggle-switch__thumb"></span>
            </label>
          </div>
        </div>

        <div class="settings-row">
          <div class="settings-row__info">
            <div class="settings-row__label">Приглашение в лобби</div>
            <div class="settings-row__desc">
              Кнопка «Присоединиться» в Discord, когда вы в лобби совместного просмотра.
            </div>
          </div>
          <div class="settings-row__control">
            <label class="settings-toggle-switch" aria-label="Приглашение в лобби">
              <input
                type="checkbox"
                checked={settings.discordRpcShowParty}
                disabled={!settings.discordRpcEnabled}
                onchange={(e) => save({ discordRpcShowParty: (e.target as HTMLInputElement).checked })}
              />
              <span class="settings-toggle-switch__track"></span>
              <span class="settings-toggle-switch__thumb"></span>
            </label>
          </div>
        </div>

        <p class="discord-rpc-settings__note">
          Друзья увидят кнопку «Присоединиться» только если вы уже в лобби и эта опция включена.
        </p>
      </div>
    </div>
  {/if}
</div>
