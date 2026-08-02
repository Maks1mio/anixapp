<script lang="ts">
  import { untrack } from 'svelte';
  import { iconArrowUp, iconClipboardList, iconEye } from '../icons';
  import { requireAuth } from '../../stores/auth';
  import { COMMENT_RULES_FORBIDDEN, COMMENT_RULES_FOOTER } from '../../utils/commentRules';
  import { COMMENT_MIN_LENGTH, COMMENT_MAX_LENGTH } from '../../utils/comment';

  interface Props {
    label?: string;
    placeholder?: string;
    busy?: boolean;
    replyToLogin?: string | null;
    autofocus?: boolean;
    initialMessage?: string;
    initialIsSpoiler?: boolean;
    resetOnSubmit?: boolean;
    onSubmit?: (payload: { message: string; isSpoiler: boolean }) => void | Promise<void>;
    onCancelReply?: () => void;
    onCancel?: () => void;
  }

  let {
    label = 'Ваш комментарий',
    placeholder = 'Напишите комментарий…',
    busy = false,
    replyToLogin = null,
    autofocus = false,
    initialMessage = '',
    initialIsSpoiler = false,
    resetOnSubmit = true,
    onSubmit,
    onCancelReply,
    onCancel,
  }: Props = $props();

  let message = $state(untrack(() => initialMessage));
  let isSpoiler = $state(untrack(() => initialIsSpoiler));
  let validationError = $state('');
  let textareaEl = $state<HTMLTextAreaElement | null>(null);

  $effect(() => {
    if (!autofocus && !replyToLogin) return;
    queueMicrotask(() => textareaEl?.focus());
  });

  $effect(() => {
    message;
    validationError = '';
  });

  async function submit() {
    if (!requireAuth()) return;
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

  function onKeydown(e: KeyboardEvent) {
    if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      void submit();
    }
  }
</script>

<div class="anix-comment-composer">
  {#if replyToLogin}
    <div class="anix-comment-composer__label">
      Ответ для {replyToLogin}
      {#if onCancelReply}
        · <button type="button" class="anix-comment__reply" onclick={onCancelReply}>Отмена</button>
      {/if}
    </div>
  {:else if onCancel}
    <div class="anix-comment-composer__label">
      {label}
      · <button type="button" class="anix-comment__reply" onclick={onCancel}>Отмена</button>
    </div>
  {:else}
    <span class="anix-comment-composer__label">{label}</span>
  {/if}

  <div class="anix-comment-composer__row">
    <div class="anix-comment-composer__field">
      <textarea
        class="anix-comment-composer__textarea"
        {placeholder}
        bind:value={message}
        bind:this={textareaEl}
        rows={2}
        disabled={busy}
        onkeydown={onKeydown}
        onfocus={() => {
          if (!requireAuth()) textareaEl?.blur();
        }}
      ></textarea>

      {#if validationError}
        <p class="anix-comment-composer__error">{validationError}</p>
      {/if}

      <div class="anix-comment-composer__tools">
        <button
          type="button"
          class="anix-comment-composer__tool"
          class:anix-comment-composer__tool--active={isSpoiler}
          onclick={() => { isSpoiler = !isSpoiler; }}
        >
          {@html iconEye(16)}
          Спойлер
        </button>
        <span class="anix-comment-composer__rules-trigger tooltip-trigger">
          <button type="button" class="anix-comment-composer__tool">
            {@html iconClipboardList(16)}
            Правила
          </button>
          <span
            class="tooltip tooltip--animated comment-rules-popover"
            role="tooltip"
            aria-hidden="true"
          >
            <span class="comment-rules-popover__inner">
              <p class="comment-rules-popover__heading">Запрещено:</p>
              <ul class="comment-rules-popover__list">
                {#each COMMENT_RULES_FORBIDDEN as rule}
                  <li>{rule}</li>
                {/each}
              </ul>
              <p class="comment-rules-popover__footer">{COMMENT_RULES_FOOTER}</p>
            </span>
          </span>
        </span>
      </div>
    </div>

    <button
      type="button"
      class="anix-comment-composer__submit"
      aria-label="Отправить"
      disabled={busy || !message.trim()}
      onclick={() => void submit()}
    >
      {@html iconArrowUp(20)}
    </button>
  </div>
</div>
