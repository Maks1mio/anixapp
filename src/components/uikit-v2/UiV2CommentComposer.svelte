<script lang="ts">
  import { untrack } from 'svelte';
  import { iconArrowUp, iconClipboardList, iconEye } from '../icons';
  import { requireAuth } from '../../stores/auth';
  import { COMMENT_RULES_FORBIDDEN, COMMENT_RULES_FOOTER_LINK_LABEL, COMMENT_RULES_FOOTER_PREFIX, COMMENT_RULES_URL } from '../../utils/commentRules';
  import { COMMENT_MIN_LENGTH, COMMENT_MAX_LENGTH } from '../../utils/comment';
  import UiV2OutlinedField from './UiV2OutlinedField.svelte';
  import UiV2Button from './UiV2Button.svelte';
  import UiV2RoundButton from './UiV2RoundButton.svelte';

  export type UiV2CommentComposerPayload = {
    message: string;
    isSpoiler: boolean;
  };

  type Props = {
    fieldLabel?: string;
    busy?: boolean;
    replyToLogin?: string | null;
    autofocus?: boolean;
    initialMessage?: string;
    initialIsSpoiler?: boolean;
    resetOnSubmit?: boolean;
    requireLogin?: boolean;
    onSubmit?: (payload: UiV2CommentComposerPayload) => void | Promise<void>;
    onCancelReply?: () => void;
    /** Отмена редактирования / общий cancel */
    onCancel?: () => void;
  };

  let {
    fieldLabel = 'Комментарий',
    busy = false,
    replyToLogin = null,
    autofocus = false,
    initialMessage = '',
    initialIsSpoiler = false,
    resetOnSubmit = true,
    requireLogin = false,
    onSubmit,
    onCancelReply,
    onCancel,
  }: Props = $props();

  const showCancel = $derived(!!onCancel || (!!replyToLogin && !!onCancelReply));
  function handleCancel() {
    onCancel?.();
    onCancelReply?.();
  }

  let message = $state(untrack(() => initialMessage));
  let isSpoiler = $state(untrack(() => initialIsSpoiler));
  let validationError = $state('');
  let rulesOpen = $state(false);
  const fieldId = `uiv2-composer-${Math.random().toString(36).slice(2, 9)}`;

  $effect(() => {
    if (!autofocus && !replyToLogin) return;
    queueMicrotask(() => {
      const el = document.getElementById(fieldId) as HTMLTextAreaElement | null;
      el?.focus();
    });
  });

  $effect(() => {
    message;
    validationError = '';
  });

  async function submit() {
    if (requireLogin && !requireAuth()) return;
    const text = message.trim();
    validationError = '';
    if (!text || busy) return;
    if (text.length < COMMENT_MIN_LENGTH) {
      validationError = `Минимум ${COMMENT_MIN_LENGTH} символов`;
      return;
    }
    if (text.length > COMMENT_MAX_LENGTH) {
      validationError = `Максимум ${COMMENT_MAX_LENGTH} символов`;
      return;
    }
    await onSubmit?.({ message: text, isSpoiler });
    if (resetOnSubmit) {
      message = '';
      isSpoiler = false;
    }
  }

  function onFieldInput() {
    if (requireLogin && !requireAuth()) {
      const el = document.getElementById(fieldId) as HTMLTextAreaElement | null;
      el?.blur();
      message = '';
    }
  }

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
    if (e.key === 'Escape' && rulesOpen) {
      rulesOpen = false;
    }
  }
</script>

<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class="uiv2-comment-composer" onkeydown={onKeydown}>
  {#if replyToLogin || showCancel}
    <div class="uiv2-comment-composer__label">
      {#if replyToLogin}
        <span>
          Ответ для <span class="uiv2-comment-composer__reply-name">{replyToLogin}</span>
        </span>
      {:else}
        <span>{fieldLabel}</span>
      {/if}
      {#if showCancel}
        <span class="uiv2-comment-composer__sep" aria-hidden="true">·</span>
        <button type="button" class="uiv2-comment-composer__cancel" onclick={handleCancel}>
          Отмена
        </button>
      {/if}
    </div>
  {/if}

  <div class="uiv2-comment-composer__row">
    <div class="uiv2-comment-composer__field">
      <UiV2OutlinedField
        id={fieldId}
        class="uiv2-comment-composer__outlined"
        label={fieldLabel}
        bind:value={message}
        multiline={true}
        rows={3}
        disabled={busy}
        error={!!validationError}
        hint={validationError}
        hintTone="error"
        oninput={onFieldInput}
      />

      <div class="uiv2-comment-composer__tools">
        <UiV2Button
          size="sm"
          variant={isSpoiler ? 'primary' : 'chrome'}
          label="Спойлер"
          disabled={busy}
          class="uiv2-comment-composer__tool-btn"
          onclick={() => {
            isSpoiler = !isSpoiler;
          }}
        >
          {#snippet icon()}
            {@html iconEye(14)}
          {/snippet}
        </UiV2Button>

        <div class="uiv2-comment-composer__rules">
          <UiV2Button
            size="sm"
            variant="chrome"
            label="Правила"
            disabled={busy}
            class="uiv2-comment-composer__tool-btn"
            onclick={() => {
              rulesOpen = !rulesOpen;
            }}
          >
            {#snippet icon()}
              {@html iconClipboardList(14)}
            {/snippet}
          </UiV2Button>

          {#if rulesOpen}
            <!-- svelte-ignore a11y_no_static_element_interactions -->
            <div
              class="uiv2-comment-composer__rules-panel"
              role="dialog"
              aria-label="Правила комментариев"
              onpointerdown={(e) => e.stopPropagation()}
            >
              <p class="uiv2-comment-composer__rules-heading">Запрещено</p>
              <ul class="uiv2-comment-composer__rules-list">
                {#each COMMENT_RULES_FORBIDDEN as rule}
                  <li>{rule}</li>
                {/each}
              </ul>
              <p class="uiv2-comment-composer__rules-footer">
                {COMMENT_RULES_FOOTER_PREFIX}
                <a
                  class="uiv2-comment-composer__rules-link"
                  href={COMMENT_RULES_URL}
                  target="_blank"
                  rel="noopener noreferrer"
                  onclick={(e) => {
                    if (window.electron?.openExternal) {
                      e.preventDefault();
                      window.electron.openExternal(COMMENT_RULES_URL);
                    }
                  }}
                >{COMMENT_RULES_FOOTER_LINK_LABEL}</a>.
              </p>
            </div>
          {/if}
        </div>
      </div>
    </div>

    <UiV2RoundButton
      size="md"
      label="Отправить"
      disabled={busy || !message.trim()}
      class="uiv2-comment-composer__submit"
      onclick={() => void submit()}
    >
      {@html iconArrowUp(18)}
    </UiV2RoundButton>
  </div>
</div>

<svelte:window
  onpointerdown={(e) => {
    if (!rulesOpen) return;
    const t = e.target;
    if (t instanceof Element && t.closest('.uiv2-comment-composer__rules')) return;
    rulesOpen = false;
  }}
/>
