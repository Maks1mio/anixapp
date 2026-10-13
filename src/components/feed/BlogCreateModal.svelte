<script lang="ts">
  import { untrack } from 'svelte';
  import { fade, scale } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { portal } from '../../actions/portal';
  import UiV2Button from '../uikit-v2/UiV2Button.svelte';
  import UiV2ScrollArea from '../uikit-v2/UiV2ScrollArea.svelte';
  import { showToast } from '../../stores/toast';
  import {
    blogCreateApiErrorMessage,
    blogCreateProgressMarks,
    blogCreateProgressPercent,
    loadBlogCreateGate,
    type BlogCreateGate,
  } from '../../utils/blog-create-gate';
  import { iconImage, iconPencil, iconUsers, iconX } from '../icons';

  type Props = {
    open: boolean;
    onClose: () => void;
    /** Уже известные управляемые каналы — быстрее понять, что блог есть. */
    knownManaged?: Array<{ id?: number; is_blog?: boolean } | null> | null;
    /** Вызывается после успешного POST channel/blog/create */
    onCreated?: (channelId: number) => void | Promise<void>;
  };

  let { open, onClose, knownManaged = null, onCreated }: Props = $props();

  let loadState = $state<'idle' | 'loading' | 'ready' | 'error'>('idle');
  let gate = $state<BlogCreateGate | null>(null);
  let createBusy = $state(false);
  let progressShown = $state(0);
  let helpOpen = $state(false);

  const canCreate = $derived(!!gate?.canCreate);
  const minLevel = $derived(gate?.minRatingScore ?? 0);
  const ratingLevel = $derived(gate?.ratingScore ?? 0);
  const progressMarks = $derived(blogCreateProgressMarks(minLevel));
  const progressTarget = $derived(
    gate ? blogCreateProgressPercent(gate.ratingScore, gate.minRatingScore) : 10,
  );

  const features = [
    {
      icon: iconPencil,
      title: 'Публикация записей в профиле',
      description: 'Друзья будут видеть твои публикации в своей ленте',
    },
    {
      icon: iconUsers,
      title: 'Создание каналов по интересам',
      description: 'Собери свой фандом по Наруто или просто публикуй котиков',
    },
    {
      icon: iconImage,
      title: 'Установка обложки профиля',
      description: 'Выделись с помощью стильной обложки',
    },
  ] as const;

  $effect(() => {
    if (!open) {
      untrack(() => {
        loadState = 'idle';
        gate = null;
        createBusy = false;
        progressShown = 0;
        helpOpen = false;
      });
      return;
    }
    untrack(() => {
      void loadGate();
    });
  });

  $effect(() => {
    if (!open || !gate || canCreate) {
      progressShown = 0;
      return;
    }
    const target = progressTarget;
    progressShown = 0;
    const start = performance.now();
    const duration = 2000;
    let raf = 0;
    const tick = (now: number) => {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - (1 - t) ** 3;
      progressShown = Math.round(target * eased);
      if (t < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  });

  async function loadGate() {
    loadState = 'loading';
    gate = null;
    try {
      const next = await loadBlogCreateGate(knownManaged);
      if (next.existingBlogChannelId != null) {
        showToast('Профиль уже улучшен', 'ok');
        onClose();
        await onCreated?.(next.existingBlogChannelId);
        return;
      }
      gate = next;
      loadState = 'ready';
    } catch {
      loadState = 'error';
      showToast('Не удалось проверить уровень репутации', 'err');
    }
  }

  function onWindowKeydown(e: KeyboardEvent) {
    if (!open) return;
    if (e.key === 'Escape') {
      e.preventDefault();
      if (helpOpen) {
        helpOpen = false;
        return;
      }
      if (!createBusy) onClose();
    }
  }

  async function submitCreate() {
    if (!canCreate || createBusy) return;
    const api = window.anixApi?.channel;
    if (!api?.createBlog) {
      showToast('Создание блога недоступно', 'err');
      return;
    }
    createBusy = true;
    try {
      const res = await api.createBlog();
      const code = Number(res?.code ?? 0);
      if (code !== 0) {
        const msg = blogCreateApiErrorMessage(code) || 'Не удалось улучшить профиль';
        showToast(msg, 'err');
        if (code === 2) {
          await loadGate();
        }
        return;
      }
      const id = Number(res?.channel?.id ?? 0);
      showToast('Твой профиль улучшен!', 'ok');
      onClose();
      if (id > 0) await onCreated?.(id);
    } catch (err) {
      showToast(String(err) || 'Не удалось улучшить профиль', 'err');
    } finally {
      createBusy = false;
    }
  }
</script>

<svelte:window onkeydown={onWindowKeydown} />

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="blog-create-modal"
    role="dialog"
    aria-modal="true"
    aria-labelledby="blog-create-modal-title"
    use:portal
    transition:fade={{ duration: 140 }}
  >
    <button
      type="button"
      class="blog-create-modal__backdrop"
      aria-label="Закрыть"
      disabled={createBusy}
      onclick={() => { if (!createBusy) onClose(); }}
    ></button>

    <div
      class="blog-create-modal__panel"
      transition:scale={{ duration: 180, start: 0.96, opacity: 0, easing: cubicOut }}
    >
      <button
        type="button"
        class="blog-create-modal__close"
        aria-label="Закрыть"
        disabled={createBusy}
        onclick={onClose}
      >
        {@html iconX(16)}
      </button>

      <div class="blog-create-modal__scroll-wrap">
        <UiV2ScrollArea class="blog-create-modal__scroll" padding="0 1.25rem 0.35rem">
          <div class="blog-create-modal__hero" aria-hidden="true">
            <span class="blog-create-modal__hero-glow"></span>
            <span class="blog-create-modal__hero-face">✧</span>
          </div>

          {#if loadState === 'loading' || loadState === 'idle'}
            <p class="blog-create-modal__loading">Проверяем уровень репутации…</p>
          {:else if loadState === 'error'}
            <p class="blog-create-modal__loading" role="alert">Не удалось загрузить данные.</p>
            <UiV2Button label="Повторить" variant="chrome" block onclick={() => void loadGate()} />
          {:else if gate && !canCreate}
            <div class="blog-create-modal__progress-block">
              <div class="blog-create-modal__levels">
                <span class="blog-create-modal__level-current">{ratingLevel} уровень</span>
                <span class="blog-create-modal__level-min">{minLevel} уровень</span>
              </div>
              <div class="blog-create-modal__bar" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progressShown}>
                <span class="blog-create-modal__bar-fill" style={`width:${progressShown}%`}></span>
                {#if progressMarks.length}
                  <div class="blog-create-modal__bar-marks" aria-hidden="true">
                    {#each progressMarks as mark, i (mark)}
                      {@const prev = i === 0 ? 0 : progressMarks[i - 1]}
                      {@const flex = (mark - prev) / minLevel}
                      <span class="blog-create-modal__bar-gap" style={`flex:${flex}`}></span>
                      <span class="blog-create-modal__bar-tick"></span>
                    {/each}
                    <span
                      class="blog-create-modal__bar-gap"
                      style={`flex:${(minLevel - (progressMarks[progressMarks.length - 1] ?? 0)) / minLevel}`}
                    ></span>
                  </div>
                {/if}
              </div>
              <button
                type="button"
                class="blog-create-modal__hint"
                onclick={() => { helpOpen = true; }}
              >
                Для улучшения профиля необходим {minLevel}-й уровень репутации.
                <span class="blog-create-modal__hint-link">Узнай как повысить »</span>
              </button>
            </div>
          {/if}

          <h2 id="blog-create-modal-title" class="blog-create-modal__title">Улучшить профиль</h2>

          <ul class="blog-create-modal__features">
            {#each features as feature (feature.title)}
              <li class="blog-create-modal__feature">
                <span class="blog-create-modal__feature-icon" aria-hidden="true">
                  {@html feature.icon(22)}
                </span>
                <div class="blog-create-modal__feature-text">
                  <p class="blog-create-modal__feature-title">{feature.title}</p>
                  <p class="blog-create-modal__feature-desc">{feature.description}</p>
                </div>
              </li>
            {/each}
          </ul>
        </UiV2ScrollArea>
      </div>

      <div class="blog-create-modal__actions">
        {#if loadState === 'ready' && gate && !canCreate}
          <UiV2Button label="Понятно" variant="chrome" block disabled={createBusy} onclick={onClose} />
        {:else if loadState === 'ready' && canCreate}
          <UiV2Button
            label={createBusy ? 'Улучшаем…' : 'Улучшить профиль'}
            variant="primary"
            block
            disabled={createBusy}
            onclick={() => void submitCreate()}
          />
        {/if}
      </div>
    </div>
  </div>
{/if}

{#if helpOpen}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="blog-create-help"
    role="dialog"
    aria-modal="true"
    aria-labelledby="blog-create-help-title"
    use:portal
    transition:fade={{ duration: 120 }}
  >
    <button
      type="button"
      class="blog-create-help__backdrop"
      aria-label="Закрыть"
      onclick={() => { helpOpen = false; }}
    ></button>
    <div class="blog-create-help__panel" transition:scale={{ duration: 160, start: 0.97, opacity: 0, easing: cubicOut }}>
      <h3 id="blog-create-help-title" class="blog-create-help__title">Как повысить репутацию</h3>
      <p class="blog-create-help__body">
        У каждого пользователя существует свой уровень репутации, который отображается в профиле рядом с датой регистрации. Он может как повышаться, так и понижаться в зависимости от определенных действий.
      </p>
      <p class="blog-create-help__body">
        Чтобы повысить уровень репутации достаточно оставлять полезные комментарии к релизам, создавать интересные коллекции и заводить новых друзей. Однако в случае токсичного поведения уровень также может и понижаться.
      </p>
      <p class="blog-create-help__body">
        После того, как ты достигнешь {minLevel} уровня репутации, ты сможешь улучшить свой профиль и получить ряд преимуществ, которые в дальнейшем останутся с тобой даже в случае, если уровень понизится.
      </p>
      <p class="blog-create-help__body">
        А еще текущий уровень репутации влияет на доступные лимиты, например такие, как количество создаваемых записей, коллекций и комментариев. Чтобы узнать больше о преимуществах репутации, нажми на свой уровень в профиле.
      </p>
      <UiV2Button label="Понятно" variant="primary" block onclick={() => { helpOpen = false; }} />
    </div>
  </div>
{/if}
