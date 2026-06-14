<script lang="ts">
  import { iconArrowUp, iconClipboardList, iconEye } from '../icons';

  interface Props {
    label?: string;
    placeholder?: string;
    busy?: boolean;
    replyToLogin?: string | null;
    onSubmit?: (payload: { message: string; isSpoiler: boolean }) => void | Promise<void>;
    onCancelReply?: () => void;
  }

  let {
    label = 'Ваш комментарий',
    placeholder = 'Напишите комментарий…',
    busy = false,
    replyToLogin = null,
    onSubmit,
    onCancelReply,
  }: Props = $props();

  let message = $state('');
  let isSpoiler = $state(false);

  async function submit() {
    const text = message.trim();
    if (!text || busy) return;
    await onSubmit?.({ message: text, isSpoiler });
    message = '';
    isSpoiler = false;
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
  {:else}
    <span class="anix-comment-composer__label">{label}</span>
  {/if}

  <div class="anix-comment-composer__row">
    <div class="anix-comment-composer__field">
      <textarea
        class="anix-comment-composer__textarea"
        {placeholder}
        bind:value={message}
        rows={2}
        disabled={busy}
        onkeydown={onKeydown}
      ></textarea>

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
        <button type="button" class="anix-comment-composer__tool" disabled title="Скоро">
          {@html iconClipboardList(16)}
          Правила
        </button>
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
