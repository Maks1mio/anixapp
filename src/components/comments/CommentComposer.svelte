<script lang="ts">
  import UiV2CommentComposer from '../uikit-v2/UiV2CommentComposer.svelte';

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
</script>

<UiV2CommentComposer
  fieldLabel={label}
  {busy}
  {replyToLogin}
  {autofocus}
  {initialMessage}
  {initialIsSpoiler}
  {resetOnSubmit}
  {onSubmit}
  {onCancelReply}
  {onCancel}
/>
