<script lang="ts">
  import googleIcon from '../assets/oauth/google.svg';
  import telegramIcon from '../assets/oauth/telegram.svg';
  import vkIcon from '../assets/oauth/vk.svg';
  import yandexIcon from '../assets/oauth/yandex.svg';

  type Provider = 'vk' | 'google' | 'telegram' | 'yandex';

  interface Props {
    provider: Provider;
    size?: number;
  }

  let { provider, size = 28 }: Props = $props();

  const icons: Record<Provider, string> = {
    vk: vkIcon,
    google: googleIcon,
    telegram: telegramIcon,
    yandex: yandexIcon,
  };

  const labels: Record<Provider, string> = {
    vk: 'VK',
    google: 'Google',
    telegram: 'Telegram',
    yandex: 'Яндекс',
  };
</script>

<img
  class="oauth-brand-icon oauth-brand-icon--{provider}"
  src={icons[provider]}
  alt=""
  width={size}
  height={size}
  draggable="false"
  data-provider={provider}
  aria-hidden="true"
  title={labels[provider]}
/>
