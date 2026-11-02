<script lang="ts">
  /**
   * «Поддержать AnixApp» на телефоне — раздел настроек вместо desktop-модалки Anix+:
   * уровни списком (значок, перки, цена), предпросмотр ника со значком, ID для бота и кнопка оформления снизу.
   */
  import { onMount } from 'svelte';
  import UserAvatar from '../components/UserAvatar.svelte';
  import { fetchBadgeCatalog } from '../services/badges-api';
  import { requestOpenExternal } from '../utils/external-link';
  import { showToast } from '../stores/toast';
  import { SUPPORT_BOT_USERNAME, markSupportPromoSeen, supportModalUnseen } from '../stores/support-promo';
  import { SUPPORT_TIERS, mergeRemoteTiers, supportTierPerks, type SupportTier } from '../utils/support-tiers';
  import { iconCopy } from '../components/icons';
  import defaultBadgeImg from '../assets/media/default.png';

  let tiers = $state<SupportTier[]>(SUPPORT_TIERS);
  let selected = $state('teer-2');
  const current = $derived(tiers.find((t) => t.slug === selected) ?? tiers[0]);

  const profile = (window as { __anixProfile?: { id?: number; login?: string; avatar?: string | null } }).__anixProfile;
  const myId = Number(profile?.id ?? 0) > 0 ? Number(profile?.id) : null;
  const myLogin = profile?.login || 'Ваш ник';

  async function copyId() {
    if (!myId) return;
    try {
      await navigator.clipboard.writeText(String(myId));
      showToast('ID скопирован', 'ok');
    } catch { /* clipboard denied */ }
  }

  onMount(() => {
    markSupportPromoSeen();
    supportModalUnseen.set(false);
    void fetchBadgeCatalog().then((types) => { tiers = mergeRemoteTiers(types); });
  });
</script>

<div class="m-support">
  <p class="m-support__lead">
    AnixApp развивает небольшая команда, без рекламы. Поддержка идёт на развитие приложения,
    а у вашего ника навсегда появляется значок и открывается чат-агент.
  </p>

  <div class="m-support__tiers" role="radiogroup" aria-label="Уровень">
    {#each tiers as t (t.slug)}
      <button
        type="button"
        class="m-support__tier"
        class:m-support__tier--on={selected === t.slug}
        role="radio"
        aria-checked={selected === t.slug}
        onclick={() => (selected = t.slug)}
      >
        <img class="m-support__tier-img" src={t.image} alt="" width="40" height="40" />
        <span class="m-support__tier-main">
          <span class="m-support__tier-name">{t.name}</span>
          {#each supportTierPerks(t) as p (p)}<span class="m-support__perk">{p}</span>{/each}
        </span>
        <span class="m-support__tier-price">{t.price} ₽<small>навсегда</small></span>
      </button>
    {/each}
  </div>

  <h2 class="m-pref-cat">Как это будет выглядеть</h2>
  <div class="m-support__preview">
    <span class="m-support__avatar"><UserAvatar src={profile?.avatar ?? null} label={myLogin} /></span>
    <span class="m-support__preview-main">
      <span class="m-support__nick">
        {myLogin}
        <img src={defaultBadgeImg} alt="" width="16" height="16" />
        <img src={current.image} alt="" width="16" height="16" />
      </span>
      <span class="m-support__preview-text">Значок виден в комментариях, ленте, профиле и списках друзей.</span>
    </span>
  </div>

  <p class="m-support__how">
    Оформляется в Telegram-боте <b>@{SUPPORT_BOT_USERNAME}</b>: выберите уровень и укажите ID профиля.
    Можно оформить и в подарок другу.
  </p>
  {#if myId}
    <button type="button" class="m-pref" onclick={() => void copyId()}>
      <span class="m-pref__text">
        <span class="m-pref__title">ID профиля: {myId}</span>
        <span class="m-pref__summary">Нажмите, чтобы скопировать</span>
      </span>
      <span class="m-support__copy">{@html iconCopy(20)}</span>
    </button>
  {/if}

  <div class="m-support__cta">
    <button type="button" class="m-support__btn" onclick={() => requestOpenExternal(`https://t.me/${SUPPORT_BOT_USERNAME}`)}>
      Поддержать · {current.price} ₽
    </button>
  </div>
</div>
