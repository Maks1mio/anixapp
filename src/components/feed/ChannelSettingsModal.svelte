<script lang="ts">
  import { untrack } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../actions/portal';
  import UiV2Button from '../uikit-v2/UiV2Button.svelte';
  import UiV2OutlinedField from '../uikit-v2/UiV2OutlinedField.svelte';
  import UiV2Select, { type UiV2SelectOption } from '../uikit-v2/UiV2Select.svelte';
  import UiV2PillField from '../uikit-v2/UiV2PillField.svelte';
  import UiV2ScrollArea from '../uikit-v2/UiV2ScrollArea.svelte';
  import UiV2Toggle from '../uikit-v2/UiV2Toggle.svelte';
  import UiV2SettingsRow from '../uikit-v2/UiV2SettingsRow.svelte';
  import UserAvatar from '../UserAvatar.svelte';
  import { showToast } from '../../stores/toast';
  import { openProfilePanel } from '../../stores/profile-panel';
  import type { FeedChannel } from '../../types/feed';
  import { channelAvatarUrl, channelCoverUrl } from '../../utils/feed-article';
  import {
    normalizeDirectoryPeople,
    pageableContent,
    type DirectoryPerson,
  } from '../../utils/feed-directory';
  import { iconBan, iconChevronLeft, iconChevronRight, iconUsers, iconX } from '../icons';

  type Props = {
    open: boolean;
    channel: FeedChannel;
    onClose: () => void;
    /** Канал изменён (название, описание, аватар, обложка, флаги). */
    onUpdated?: (patch: Partial<FeedChannel>) => void;
  };

  let { open, channel, onClose, onUpdated }: Props = $props();

  type View = 'main' | 'admins' | 'blocks';
  type BlockedPerson = DirectoryPerson & {
    reason: string;
    expireDate: number;
    perm: boolean;
  };

  const TITLE_MIN = 10;
  const TITLE_MAX = 60;
  const DESC_MIN = 10;
  const DESC_MAX = 1000;
  const DAY_SEC = 86_400;

  const durationOptions: UiV2SelectOption[] = [
    { value: '1', label: '1 день' },
    { value: '7', label: '7 дней' },
    { value: '30', label: '30 дней' },
    { value: 'perm', label: 'Навсегда' },
  ];

  let view = $state<View>('main');

  let title = $state('');
  let description = $state('');
  let commenting = $state(true);
  let suggestions = $state(true);
  let saving = $state(false);
  let formHint = $state('');
  let avatar = $state('');
  let cover = $state('');
  let mediaBusy = $state<'avatar' | 'cover' | null>(null);
  let fileInput = $state<HTMLInputElement | null>(null);
  let fileTarget: 'avatar' | 'cover' = 'avatar';

  let editors = $state<DirectoryPerson[]>([]);
  let editorsState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let blocks = $state<BlockedPerson[]>([]);
  let blocksState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let busyProfileId = $state<number | null>(null);

  /** Поиск подписчика — назначить администратором или заблокировать. */
  let pickQuery = $state('');
  let pickResults = $state<DirectoryPerson[]>([]);
  let pickBusy = $state(false);
  let pickTimer: ReturnType<typeof setTimeout> | null = null;
  let blockTarget = $state<DirectoryPerson | null>(null);
  let blockReason = $state('');
  let blockDuration = $state('7');
  let blockShowReason = $state(true);

  const channelId = $derived(Number(channel.id ?? 0));
  const isCreator = $derived(!!channel.is_creator);
  const canModerate = $derived(isCreator || !!channel.is_administrator_or_higher);
  const viewTitle = $derived(
    view === 'admins' ? 'Администраторы' : view === 'blocks' ? 'Блоклист' : 'Управление каналом',
  );
  const titleOk = $derived(title.trim().length >= TITLE_MIN && title.trim().length <= TITLE_MAX);
  const descOk = $derived(description.trim().length >= DESC_MIN && description.trim().length <= DESC_MAX);
  const dirty = $derived(
    title.trim() !== (channel.title ?? '').trim()
    || description.trim() !== (channel.description ?? '').trim()
    || commenting !== (channel.is_commenting_enabled !== false)
    || suggestions !== !!channel.is_article_suggestion_enabled,
  );
  const canSave = $derived(canModerate && dirty && titleOk && descOk && !saving);

  $effect(() => {
    if (!open) return;
    untrack(() => {
      view = 'main';
      title = channel.title ?? '';
      description = channel.description ?? '';
      commenting = channel.is_commenting_enabled !== false;
      suggestions = !!channel.is_article_suggestion_enabled;
      avatar = channelAvatarUrl(channel.avatar);
      cover = channelCoverUrl(channel.cover);
      saving = false;
      formHint = '';
      editors = [];
      editorsState = 'idle';
      blocks = [];
      blocksState = 'idle';
      resetPicker();
    });
  });

  $effect(() => {
    if (!open) return;
    const current = view;
    untrack(() => {
      resetPicker();
      if (current === 'admins' && editorsState === 'idle') void loadEditors();
      if (current === 'blocks' && blocksState === 'idle') void loadBlocks();
    });
  });

  function resetPicker() {
    pickQuery = '';
    pickResults = [];
    pickBusy = false;
    blockTarget = null;
    blockReason = '';
    blockDuration = '7';
    blockShowReason = true;
    if (pickTimer) clearTimeout(pickTimer);
    pickTimer = null;
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (!open || e.key !== 'Escape') return;
    e.preventDefault();
    if (blockTarget) {
      blockTarget = null;
      return;
    }
    if (view !== 'main') {
      view = 'main';
      return;
    }
    if (!saving) onClose();
  }

  function editErrorText(code: number): string {
    switch (code) {
      case 2: return `Название: от ${TITLE_MIN} до ${TITLE_MAX} символов.`;
      case 3: return `Описание: от ${DESC_MIN} до ${DESC_MAX} символов.`;
      case 5: return 'Канал не найден.';
      case 6: return 'Недостаточно прав для изменения канала.';
      case 7: return 'Редактирование канала недоступно для вашего аккаунта.';
      default: return `Не удалось сохранить (код ${code})`;
    }
  }

  async function save() {
    if (!canSave) {
      if (!titleOk) formHint = `Название: от ${TITLE_MIN} до ${TITLE_MAX} символов`;
      else if (!descOk) formHint = `Описание: от ${DESC_MIN} до ${DESC_MAX} символов`;
      return;
    }
    const api = window.anixApi?.channel?.edit;
    if (!api) return;
    saving = true;
    formHint = '';
    const body = {
      title: title.trim(),
      description: description.trim(),
      is_commenting_enabled: commenting,
      is_article_suggestion_enabled: suggestions,
    };
    try {
      const res = await api(channelId, body);
      const code = Number(res?.code ?? 0);
      if (code !== 0) {
        formHint = editErrorText(code);
        return;
      }
      onUpdated?.(body);
      showToast('Канал сохранён');
    } catch (err) {
      formHint = String(err) || 'Не удалось сохранить';
    } finally {
      saving = false;
    }
  }

  function pickImage(target: 'avatar' | 'cover') {
    if (mediaBusy) return;
    fileTarget = target;
    fileInput?.click();
  }

  function readAsDataUrl(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ''));
      reader.onerror = () => reject(reader.error ?? new Error('read failed'));
      reader.readAsDataURL(file);
    });
  }

  async function onFileChosen(e: Event) {
    const input = e.currentTarget as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const target = fileTarget;
    const api = target === 'avatar'
      ? window.anixApi?.channel?.uploadAvatar
      : window.anixApi?.channel?.uploadCover;
    if (!api) {
      showToast('Загрузка изображений недоступна', 'err');
      return;
    }
    mediaBusy = target;
    try {
      const dataUrl = await readAsDataUrl(file);
      const res = await api(channelId, dataUrl, file.name || 'image.jpg');
      const code = Number(res?.code ?? 0);
      const url = String(res?.url ?? '');
      if (code !== 0 || !url) {
        showToast(target === 'avatar' ? 'Не удалось обновить аватар' : 'Не удалось обновить обложку', 'err');
        return;
      }
      if (target === 'avatar') {
        avatar = channelAvatarUrl(url);
        onUpdated?.({ avatar: url });
      } else {
        cover = channelCoverUrl(url);
        onUpdated?.({ cover: url });
      }
      showToast(target === 'avatar' ? 'Аватар обновлён' : 'Обложка обновлена');
    } catch (err) {
      showToast(String(err), 'err');
    } finally {
      mediaBusy = null;
    }
  }

  async function removeCover() {
    const api = window.anixApi?.channel?.deleteCover;
    if (!api || mediaBusy) return;
    mediaBusy = 'cover';
    try {
      const res = await api(channelId);
      if (Number(res?.code ?? 0) !== 0) {
        showToast('Не удалось удалить обложку', 'err');
        return;
      }
      cover = '';
      onUpdated?.({ cover: '' });
      showToast('Обложка удалена');
    } catch (err) {
      showToast(String(err), 'err');
    } finally {
      mediaBusy = null;
    }
  }

  async function loadEditors() {
    const api = window.anixApi?.channel?.permissions;
    if (!api) {
      editorsState = 'error';
      return;
    }
    editorsState = 'loading';
    try {
      const res = await api(channelId, 0, 1);
      if (Number((res as { code?: number })?.code ?? 0) !== 0) throw new Error('permissions');
      editors = normalizeDirectoryPeople(pageableContent(res));
      editorsState = 'ready';
    } catch {
      editors = [];
      editorsState = 'error';
    }
  }

  function normalizeBlocks(raw: unknown[]): BlockedPerson[] {
    const people = normalizeDirectoryPeople(raw);
    return people.map((person, i) => {
      const rec = (raw[i] ?? {}) as Record<string, unknown>;
      return {
        ...person,
        reason: String(rec.block_reason ?? rec.reason ?? '').trim(),
        expireDate: Number(rec.block_expire_date ?? rec.expire_date ?? 0) || 0,
        perm: rec.is_perm_blocked === true,
      };
    });
  }

  async function loadBlocks() {
    const api = window.anixApi?.channel?.blocks;
    if (!api) {
      blocksState = 'error';
      return;
    }
    blocksState = 'loading';
    try {
      const res = await api(channelId, 0);
      if (Number((res as { code?: number })?.code ?? 0) !== 0) throw new Error('blocks');
      const raw = pageableContent(res).filter((item) => !!item && typeof item === 'object');
      blocks = normalizeBlocks(raw);
      blocksState = 'ready';
    } catch {
      blocks = [];
      blocksState = 'error';
    }
  }

  function onPickInput(value: string) {
    pickQuery = value;
    if (pickTimer) clearTimeout(pickTimer);
    const q = value.trim();
    if (!q) {
      pickResults = [];
      pickBusy = false;
      return;
    }
    pickBusy = true;
    pickTimer = setTimeout(() => void runPickSearch(q), 280);
  }

  async function runPickSearch(q: string) {
    const api = window.anixApi?.search?.channelSubscribers;
    if (!api) {
      pickBusy = false;
      return;
    }
    try {
      const res = await api(channelId, 0, q);
      if (pickQuery.trim() !== q) return;
      pickResults = normalizeDirectoryPeople(pageableContent(res)).slice(0, 8);
    } catch {
      pickResults = [];
    } finally {
      if (pickQuery.trim() === q) pickBusy = false;
    }
  }

  async function setEditor(person: DirectoryPerson, grant: boolean) {
    const api = window.anixApi?.channel?.permissionManage;
    if (!api || busyProfileId != null) return;
    if (!grant && !window.confirm(`Снять права администратора с ${person.login}?`)) return;
    busyProfileId = person.id;
    try {
      const res = await api(channelId, person.id, grant ? 1 : 0);
      const code = Number(res?.code ?? 0);
      if (code !== 0) {
        showToast(
          code === 3 ? 'Пользователь не найден' : code === 5 ? 'Управлять администраторами может только создатель' : `Ошибка (код ${code})`,
          'err',
        );
        return;
      }
      if (grant) {
        if (!editors.some((p) => p.id === person.id)) editors = [...editors, person];
        resetPicker();
        showToast(`${person.login} теперь администратор`);
      } else {
        editors = editors.filter((p) => p.id !== person.id);
        showToast('Права администратора сняты');
      }
    } catch (err) {
      showToast(String(err), 'err');
    } finally {
      busyProfileId = null;
    }
  }

  async function submitBlock() {
    const target = blockTarget;
    const api = window.anixApi?.channel?.blockManage;
    if (!target || !api || busyProfileId != null) return;
    const perm = blockDuration === 'perm';
    const days = perm ? 0 : Number(blockDuration) || 1;
    busyProfileId = target.id;
    try {
      const reason = blockReason.trim();
      const res = await api(channelId, {
        target_profile_id: target.id,
        is_blocked: true,
        reason: reason || null,
        expire_date: perm ? null : Math.floor(Date.now() / 1000) + days * DAY_SEC,
        is_reason_showing_enabled: !!reason && blockShowReason,
        is_perm_blocked: perm,
      });
      if (Number(res?.code ?? 0) !== 0) {
        showToast(`Не удалось заблокировать (код ${res?.code})`, 'err');
        return;
      }
      showToast(`${target.login} заблокирован в канале`);
      resetPicker();
      await loadBlocks();
    } catch (err) {
      showToast(String(err), 'err');
    } finally {
      busyProfileId = null;
    }
  }

  async function unblock(person: BlockedPerson) {
    const api = window.anixApi?.channel?.blockManage;
    if (!api || busyProfileId != null) return;
    busyProfileId = person.id;
    try {
      const res = await api(channelId, {
        target_profile_id: person.id,
        is_blocked: false,
        reason: null,
        expire_date: null,
        is_reason_showing_enabled: false,
        is_perm_blocked: false,
      });
      if (Number(res?.code ?? 0) !== 0) {
        showToast(`Не удалось разблокировать (код ${res?.code})`, 'err');
        return;
      }
      blocks = blocks.filter((p) => p.id !== person.id);
      showToast(`${person.login} разблокирован`);
    } catch (err) {
      showToast(String(err), 'err');
    } finally {
      busyProfileId = null;
    }
  }

  function blockTerm(person: BlockedPerson): string {
    if (person.perm || !person.expireDate) return 'Навсегда';
    const ms = person.expireDate > 1e12 ? person.expireDate : person.expireDate * 1000;
    return `До ${new Date(ms).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })}`;
  }

  function openPerson(id: number) {
    if (id > 0) openProfilePanel(id);
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#snippet personInfo(person: DirectoryPerson, sub?: string)}
  <button type="button" class="channel-settings__person" onclick={() => openPerson(person.id)}>
    <span class="channel-settings__person-avatar">
      <UserAvatar src={channelAvatarUrl(person.avatar)} label={person.login} />
    </span>
    <span class="channel-settings__person-meta">
      <span class="channel-settings__person-name">{person.login}</span>
      {#if sub}
        <span class="channel-settings__person-sub">{sub}</span>
      {/if}
    </span>
  </button>
{/snippet}

{#snippet navRow(icon: string, label: string, target: View)}
  <button type="button" class="channel-settings__nav" onclick={() => { view = target; }}>
    <span class="channel-settings__nav-icon" aria-hidden="true">{@html icon}</span>
    <span class="channel-settings__nav-label">{label}</span>
    <span class="channel-settings__nav-chevron" aria-hidden="true">{@html iconChevronRight(18)}</span>
  </button>
{/snippet}

{#if open}
  <div
    class="channel-create-modal channel-settings"
    role="dialog"
    aria-modal="true"
    aria-labelledby="channel-settings-title"
    use:portal
    transition:fade={{ duration: 140 }}
  >
    <button
      type="button"
      class="channel-create-modal__backdrop"
      aria-label="Закрыть"
      onclick={() => { if (!saving) onClose(); }}
    ></button>

    <div
      class="channel-create-modal__panel channel-settings__panel"
      class:channel-settings__panel--sub={view !== 'main'}
      transition:scale={{ duration: 180, start: 0.96, opacity: 0, easing: cubicOut }}
    >
      <header class="channel-create-modal__head channel-settings__head">
        {#if view !== 'main'}
          <button
            type="button"
            class="channel-create-modal__close"
            aria-label="Назад"
            onclick={() => { view = 'main'; }}
          >
            {@html iconChevronLeft(18)}
          </button>
        {/if}
        <h2 id="channel-settings-title" class="channel-create-modal__title">{viewTitle}</h2>
        <button
          type="button"
          class="channel-create-modal__close"
          aria-label="Закрыть"
          disabled={saving}
          onclick={onClose}
        >
          {@html iconX(16)}
        </button>
      </header>

      <UiV2ScrollArea class="channel-settings__scroll" fade viewportClass="channel-create-modal__body channel-settings__body">
        {#if view === 'main'}
          <div class="uiv2-settings">
            {#if isCreator}
              <div class="channel-settings__media">
                <div
                  class="channel-settings__cover"
                  class:channel-settings__cover--empty={!cover}
                  style={cover ? `background-image:url('${cover}')` : undefined}
                >
                  <div class="channel-settings__cover-actions">
                    <UiV2Button
                      variant="chrome"
                      size="sm"
                      label={mediaBusy === 'cover' ? 'Загрузка…' : cover ? 'Заменить обложку' : 'Загрузить обложку'}
                      disabled={mediaBusy != null}
                      onclick={() => pickImage('cover')}
                    />
                    {#if cover}
                      <UiV2Button
                        variant="chrome"
                        size="sm"
                        label="Удалить"
                        disabled={mediaBusy != null}
                        onclick={() => void removeCover()}
                      />
                    {/if}
                  </div>
                </div>
                <button
                  type="button"
                  class="channel-settings__avatar"
                  class:channel-settings__avatar--busy={mediaBusy === 'avatar'}
                  aria-label="Сменить аватар"
                  disabled={mediaBusy != null}
                  onclick={() => pickImage('avatar')}
                >
                  <UserAvatar src={avatar} label={title || 'Канал'} shape="channel" />
                  <span class="channel-settings__avatar-hint" aria-hidden="true">
                    {mediaBusy === 'avatar' ? '…' : 'Изменить'}
                  </span>
                </button>
              </div>
              <input
                bind:this={fileInput}
                class="channel-settings__file"
                type="file"
                accept="image/png,image/jpeg,image/webp,image/gif"
                onchange={onFileChosen}
              />
            {/if}

            {#if canModerate}

              <section class="uiv2-settings__block">
                <div class="uiv2-settings__group uiv2-settings__group--pad">
                  <UiV2OutlinedField
                    label="Название"
                    bind:value={title}
                    maxlength={TITLE_MAX}
                    disabled={saving}
                    hint={`${title.trim().length}/${TITLE_MAX} · минимум ${TITLE_MIN}`}
                    error={title.length > 0 && !titleOk}
                  />
                  <UiV2OutlinedField
                    label="Описание"
                    bind:value={description}
                    maxlength={DESC_MAX}
                    multiline
                    rows={3}
                    class="channel-settings__desc"
                    disabled={saving}
                    hint={`${description.trim().length}/${DESC_MAX} · минимум ${DESC_MIN}`}
                    error={description.length > 0 && !descOk}
                  />
                </div>
              </section>

              <section class="uiv2-settings__block">
                <h3 class="uiv2-settings__title">Разрешения</h3>
                <div class="uiv2-settings__group">
                  <UiV2SettingsRow title="Разрешить комментирование">
                    <UiV2Toggle
                      label="Разрешить комментирование"
                      checked={commenting}
                      disabled={saving}
                      onChange={(next) => { commenting = next; }}
                    />
                  </UiV2SettingsRow>
                  <UiV2SettingsRow title="Разрешить предлагать записи">
                    <UiV2Toggle
                      label="Разрешить предлагать записи"
                      checked={suggestions}
                      disabled={saving}
                      onChange={(next) => { suggestions = next; }}
                    />
                  </UiV2SettingsRow>
                </div>
              </section>

              {#if formHint}
                <p class="channel-create-modal__hint" role="alert">{formHint}</p>
              {/if}

              <section class="uiv2-settings__block">
                <h3 class="uiv2-settings__title">Управление</h3>
                <div class="uiv2-settings__group">
                  {#if isCreator}
                    {@render navRow(iconUsers(18), 'Управление администраторами', 'admins')}
                  {/if}
                  {@render navRow(iconBan(18), 'Управление блоклистом', 'blocks')}
                </div>
              </section>
            {/if}
          </div>
        {:else}
          <UiV2PillField
            class="channel-settings__pick"
            label={view === 'admins' ? 'Найти подписчика' : 'Найти подписчика для блокировки'}
            type="search"
            autocomplete="off"
            spellcheck={false}
            value={pickQuery}
            oninput={(e) => onPickInput((e.currentTarget as HTMLInputElement).value)}
          />

          {#if blockTarget}
            <div class="uiv2-settings__group uiv2-settings__group--pad">
              {@render personInfo(blockTarget, 'Блокировка в канале')}
              <UiV2OutlinedField label="Причина" bind:value={blockReason} maxlength={200} />
              <UiV2SettingsRow title="Показывать причину">
                <UiV2Toggle
                  label="Показывать причину"
                  checked={blockShowReason}
                  onChange={(next) => { blockShowReason = next; }}
                />
              </UiV2SettingsRow>
              <UiV2Select
                ariaLabel="Срок блокировки"
                options={durationOptions}
                value={blockDuration}
                onChange={(v) => { blockDuration = v; }}
              />
              <div class="channel-settings__block-actions">
                <UiV2Button variant="ghost" size="sm" label="Отмена" onclick={() => { blockTarget = null; }} />
                <UiV2Button
                  variant="primary"
                  size="sm"
                  label={busyProfileId === blockTarget.id ? 'Блокировка…' : 'Заблокировать'}
                  disabled={busyProfileId != null}
                  onclick={() => void submitBlock()}
                />
              </div>
            </div>
          {:else if pickQuery.trim()}
            <div class="uiv2-settings__group">
              {#if pickBusy && pickResults.length === 0}
                <p class="channel-settings__empty">Поиск…</p>
              {:else if pickResults.length === 0}
                <p class="channel-settings__empty">Среди подписчиков никого не нашли.</p>
              {/if}
              {#each pickResults as person (person.id)}
                {@const isAdmin = editors.some((p) => p.id === person.id)}
                <div class="channel-settings__row">
                  {@render personInfo(person)}
                  {#if view === 'admins'}
                    <UiV2Button
                      variant={isAdmin ? 'ghost' : 'primary'}
                      size="sm"
                      label={isAdmin ? 'Уже администратор' : 'Назначить'}
                      disabled={isAdmin || busyProfileId != null}
                      onclick={() => void setEditor(person, true)}
                    />
                  {:else}
                    <UiV2Button
                      variant="chrome"
                      size="sm"
                      label="Заблокировать"
                      disabled={busyProfileId != null || blocks.some((p) => p.id === person.id)}
                      onclick={() => { blockTarget = person; }}
                    />
                  {/if}
                </div>
              {/each}
            </div>
          {:else if view === 'admins'}
            {#if editorsState === 'loading' || editorsState === 'idle'}
              <p class="channel-settings__empty">Загрузка…</p>
            {:else if editorsState === 'error'}
              <p class="channel-settings__empty">
                Не удалось загрузить администраторов.
                <button type="button" class="feed-dir-modal__retry" onclick={() => void loadEditors()}>Повторить</button>
              </p>
            {:else if editors.length === 0}
              <p class="channel-settings__empty">Администраторов нет. Найдите подписчика, чтобы назначить.</p>
            {:else}
              <div class="uiv2-settings__group">
                {#each editors as person (person.id)}
                  <div class="channel-settings__row">
                    {@render personInfo(person, 'Администратор')}
                    <UiV2Button
                      variant="ghost"
                      size="sm"
                      label={busyProfileId === person.id ? '…' : 'Снять'}
                      disabled={busyProfileId != null}
                      onclick={() => void setEditor(person, false)}
                    />
                  </div>
                {/each}
              </div>
            {/if}
          {:else}
            {#if blocksState === 'loading' || blocksState === 'idle'}
              <p class="channel-settings__empty">Загрузка…</p>
            {:else if blocksState === 'error'}
              <p class="channel-settings__empty">
                Не удалось загрузить блоклист.
                <button type="button" class="feed-dir-modal__retry" onclick={() => void loadBlocks()}>Повторить</button>
              </p>
            {:else if blocks.length === 0}
              <p class="channel-settings__empty">В канале никто не заблокирован.</p>
            {:else}
              <div class="uiv2-settings__group">
                {#each blocks as person (person.id)}
                  <div class="channel-settings__row">
                    {@render personInfo(person, person.reason ? `${blockTerm(person)} · ${person.reason}` : blockTerm(person))}
                    <UiV2Button
                      variant="chrome"
                      size="sm"
                      label={busyProfileId === person.id ? '…' : 'Разблокировать'}
                      disabled={busyProfileId != null}
                      onclick={() => void unblock(person)}
                    />
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        {/if}
      </UiV2ScrollArea>

      {#if view === 'main' && canModerate}
        <footer class="channel-create-modal__foot">
          <UiV2Button
            label={saving ? 'Сохранение…' : 'Сохранить'}
            variant="primary"
            block
            disabled={!canSave}
            onclick={() => void save()}
          />
        </footer>
      {/if}
    </div>
  </div>
{/if}

