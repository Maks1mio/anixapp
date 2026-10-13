<script lang="ts">
  type Props = {
    avatarUrl?: string;
    placeholder?: string;
    disabled?: boolean;
    onOpen?: () => void;
  };

  let {
    avatarUrl = '',
    placeholder = 'Расскажите о чём-нибудь…',
    disabled = false,
    onOpen,
  }: Props = $props();
</script>

<div class="feed-compose-prompt">
  <span
    class="feed-compose-prompt__avatar"
    class:feed-compose-prompt__avatar--empty={!avatarUrl}
    style={avatarUrl ? `background-image:url('${avatarUrl}')` : undefined}
    aria-hidden="true"
  ></span>
  <button
    type="button"
    class="feed-compose-prompt__field"
    {disabled}
    onclick={() => onOpen?.()}
  >
    {placeholder}
  </button>
</div>
