<script lang="ts">
  import { onMount } from 'svelte';
  import UiV2Toggle from '../../../components/uikit-v2/UiV2Toggle.svelte';
  import UiV2SettingsRow from '../../../components/uikit-v2/UiV2SettingsRow.svelte';
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
    settings = normalizeDiscordRpcSettings(raw as unknown as Record<string, unknown>);
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
    _group?: PageGroup,
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

<div class="uiv2-settings">
  {#if !hasElectron}
    <p class="uiv2-settings__status">Статус Discord работает только в десктоп-приложении AnixApp.</p>
  {:else if !loaded}
    <p class="uiv2-settings__status">Загрузка…</p>
  {:else}
    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Основное</h3>
      <div class="uiv2-settings__group">
        <UiV2SettingsRow
          title="Статус в Discord"
          desc="Показывать в профиле Discord, чем вы заняты в AnixApp. Нужен запущенный Discord на этом ПК."
        >
          <UiV2Toggle
            label="Статус в Discord"
            checked={settings.discordRpcEnabled}
            onChange={(checked) => save({ discordRpcEnabled: checked })}
          />
        </UiV2SettingsRow>

        <UiV2SettingsRow
          title="Где вы в приложении"
          desc="Показывать текущий раздел в статусе. Если выключить — в Discord будет просто «AnixApp · В приложении»."
        >
          <UiV2Toggle
            label="Где вы в приложении"
            checked={settings.discordRpcShowBrowsing}
            disabled={!settings.discordRpcEnabled}
            onChange={(checked) => save({ discordRpcShowBrowsing: checked })}
          />
        </UiV2SettingsRow>
      </div>
    </section>

    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Разделы приложения</h3>
      <p class="uiv2-settings__desc">
        Выберите экраны, для которых Discord будет показывать отдельный статус. Неактивные разделы отображаются как «в приложении».
      </p>
      <div class="uiv2-settings__group uiv2-settings__group--pad">
        <div class="uiv2-settings__pages">
          {#each PAGE_GROUPS as group}
            <section class="uiv2-settings__pages-group">
              <h4 class="uiv2-settings__subhead">{group.label}</h4>
              <ul
                class="uiv2-settings__check-grid"
                class:uiv2-settings__check-grid--single={group.singleColumn}
              >
                {#each group.items as item}
                  {@const itemDisabled = isPageItemDisabled(item, group)}
                  {@const itemChecked = itemDisabled && item.nested ? false : settings[item.key]}
                  <li
                    class="uiv2-settings__check-item"
                    class:uiv2-settings__check-item--nested={item.nested}
                  >
                    <label class="uiv2-settings__check">
                      <input
                        type="checkbox"
                        checked={itemChecked}
                        disabled={itemDisabled}
                        onchange={(e) => savePage(item.key, (e.currentTarget as HTMLInputElement).checked, group)}
                      />
                      <span class="uiv2-settings__check-box" aria-hidden="true"></span>
                      <span class="uiv2-settings__check-text">
                        <span class="uiv2-settings__check-name">{item.label}</span>
                        {#if item.hint}
                          <span class="uiv2-settings__check-hint">{item.hint}</span>
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
    </section>

    <section class="uiv2-settings__block">
      <h3 class="uiv2-settings__title">Плеер и лобби</h3>
      <div class="uiv2-settings__group">
        <UiV2SettingsRow
          title="Текущая серия"
          desc="Название аниме и номер серии, пока идёт воспроизведение в плеере."
        >
          <UiV2Toggle
            label="Текущая серия"
            checked={settings.discordRpcShowWatching}
            disabled={!settings.discordRpcEnabled}
            onChange={(checked) => save({ discordRpcShowWatching: checked })}
          />
        </UiV2SettingsRow>

        <UiV2SettingsRow
          title="Полоса прогресса"
          desc="Таймер серии в Discord во время воспроизведения."
        >
          <UiV2Toggle
            label="Полоса прогресса"
            checked={settings.discordRpcShowProgress}
            disabled={!settings.discordRpcEnabled || !settings.discordRpcShowWatching}
            onChange={(checked) => save({ discordRpcShowProgress: checked })}
          />
        </UiV2SettingsRow>

        <UiV2SettingsRow
          title="Озвучка и плеер"
          desc="Студия озвучки или источник видео в подписи к статусу."
        >
          <UiV2Toggle
            label="Озвучка и плеер"
            checked={settings.discordRpcShowDubber}
            disabled={!settings.discordRpcEnabled || !settings.discordRpcShowWatching}
            onChange={(checked) => save({ discordRpcShowDubber: checked })}
          />
        </UiV2SettingsRow>

        <UiV2SettingsRow
          title="Обложки и аватары"
          desc="Постер аниме или аватар профиля вместо логотипа AnixApp."
        >
          <UiV2Toggle
            label="Обложки и аватары"
            checked={settings.discordRpcShowImages}
            disabled={!settings.discordRpcEnabled}
            onChange={(checked) => save({ discordRpcShowImages: checked })}
          />
        </UiV2SettingsRow>

        <UiV2SettingsRow
          title="Приглашение в лобби"
          desc="Кнопка «Присоединиться» в Discord, когда вы в лобби совместного просмотра."
        >
          <UiV2Toggle
            label="Приглашение в лобби"
            checked={settings.discordRpcShowParty}
            disabled={!settings.discordRpcEnabled}
            onChange={(checked) => save({ discordRpcShowParty: checked })}
          />
        </UiV2SettingsRow>

        <p class="uiv2-settings__note">
          Друзья увидят кнопку «Присоединиться» только если вы уже в лобби и эта опция включена.
        </p>
      </div>
    </section>
  {/if}
</div>
