<script lang="ts">
  /** AAWA avatar: soft gradient orb with a face-ish highlight; pulses while thinking. */
  interface Props {
    size?: number;
    thinking?: boolean;
  }
  let { size = 32, thinking = false }: Props = $props();
</script>

<span class="aawa-orb" class:aawa-orb--thinking={thinking} style:--orb-size="{size}px" aria-hidden="true">
  <span class="aawa-orb__core"></span>
  <span class="aawa-orb__eyes"><i></i><i></i></span>
</span>

<style>
  .aawa-orb {
    position: relative;
    flex: none;
    width: var(--orb-size);
    height: var(--orb-size);
    border-radius: 50%;
    background: conic-gradient(from 210deg, #ff7eb3, #8f7bff, #4fd1ff, #ffd36e, #ff7eb3);
    box-shadow: 0 0 calc(var(--orb-size) * 0.35) rgba(143, 123, 255, 0.35);
    overflow: hidden;
  }

  .aawa-orb__core {
    position: absolute;
    inset: 9%;
    border-radius: 50%;
    background: radial-gradient(circle at 35% 30%, rgba(255, 255, 255, 0.55), rgba(20, 16, 40, 0.15) 45%, rgba(20, 16, 40, 0.55));
  }

  .aawa-orb__eyes {
    position: absolute;
    left: 50%;
    top: 46%;
    display: flex;
    gap: calc(var(--orb-size) * 0.16);
    transform: translate(-50%, -50%);
  }

  .aawa-orb__eyes i {
    display: block;
    width: calc(var(--orb-size) * 0.11);
    height: calc(var(--orb-size) * 0.17);
    border-radius: 999px;
    background: #fff;
    animation: aawa-blink 5s infinite;
  }

  .aawa-orb--thinking {
    animation: aawa-spin 2.4s linear infinite;
  }

  .aawa-orb--thinking .aawa-orb__eyes {
    animation: aawa-unspin 2.4s linear infinite;
  }

  @keyframes aawa-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes aawa-unspin {
    from {
      transform: translate(-50%, -50%) rotate(0deg);
    }
    to {
      transform: translate(-50%, -50%) rotate(-360deg);
    }
  }

  @keyframes aawa-blink {
    0%,
    92%,
    100% {
      transform: scaleY(1);
    }
    95% {
      transform: scaleY(0.15);
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .aawa-orb--thinking,
    .aawa-orb--thinking .aawa-orb__eyes,
    .aawa-orb__eyes i {
      animation: none;
    }
  }
</style>
