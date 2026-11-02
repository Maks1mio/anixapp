<script lang="ts">
  /** Крупная плитка-переход TV (расписание, коллекции, друзья…). */
  interface Props {
    title: string;
    sub?: string;
    icon?: string;
    /** Картинка вместо иконки (аватар, обложка). */
    image?: string | null;
    round?: boolean;
    disabled?: boolean;
    onclick: () => void;
  }

  let { title, sub = '', icon = '', image = null, round = false, disabled = false, onclick }: Props = $props();
</script>

<button type="button" class="tv-shortcut" class:tv-shortcut--round={round} {disabled} {onclick}>
  {#if image}
    <img class="tv-shortcut__image" src={image} alt="" loading="lazy" decoding="async" />
  {:else if icon}
    <span class="tv-shortcut__icon" aria-hidden="true">{@html icon}</span>
  {:else}
    <span class="tv-shortcut__letter" aria-hidden="true">{title.charAt(0).toUpperCase()}</span>
  {/if}
  <span class="tv-shortcut__text">
    <span class="tv-shortcut__title">{title}</span>
    {#if sub}<span class="tv-shortcut__sub">{sub}</span>{/if}
  </span>
</button>
