<script lang="ts">
  /**
   * Line-art persona face (Ася — cat, Канна — dog), drawn from the brand marks.
   * Eyes and mouth are polylines with a fixed point count per feature, so every mood
   * is the same path with other coordinates: CSS `d` transitions morph one emotion
   * into the next. Ears, head and props animate with transforms / keyframes.
   */
  import { PERSONA_LOOKS, type FaceMood, type PersonaId } from './personas';

  interface Props {
    persona: PersonaId;
    mood?: FaceMood;
    size?: number;
    /** Soft tinted circle behind the face (avatars). */
    framed?: boolean;
  }

  let { persona, mood = 'idle', size = 32, framed = false }: Props = $props();

  type Pt = [number, number];
  type EyeKind = 'idle' | 'happy' | 'dot' | 'flat' | 'closed' | 'sad' | 'wink';
  type MouthKind = 'idle' | 'happy' | 'o' | 'flat' | 'smirk' | 'sad';

  interface Geometry {
    /** Places the mark in the shared 160×160 box. */
    offset: Pt;
    /** Eye anchor: horizontal center and baseline of the «^». */
    eyes: { l: Pt; r: Pt };
    idleEyes: { l: Pt[]; r: Pt[] };
    mouths: Record<MouthKind, Pt[]>;
  }

  /** Coordinates come from the original marks (dog 145×129, cat 139×147). */
  const GEOMETRY: Record<PersonaId, Geometry> = {
    kanna: {
      offset: [8, 15.5],
      eyes: { l: [41, 70.3], r: [96, 69.8] },
      idleEyes: {
        l: [[24, 70.28], [33.25, 63.28], [42.5, 56.28], [50.25, 63.28], [58, 70.28]],
        r: [[79, 69.78], [88.75, 61.28], [98.5, 52.78], [105.75, 61.28], [113, 69.78]],
      },
      mouths: {
        idle: [[44, 114.28], [53.5, 122.78], [68.5, 122.78], [75, 116.78], [81.5, 122.78], [92, 122.78], [100.5, 114.28]],
        happy: [[45, 111], [51, 120.5], [61, 126], [72.3, 127.5], [83.5, 126], [93.5, 120.5], [99.5, 111]],
        o: [[72.3, 110], [79.2, 114], [79.2, 122], [72.3, 126], [65.4, 122], [65.4, 114], [72.3, 110]],
        flat: [[54, 119], [60, 119], [66, 119], [72.3, 119], [78.5, 119], [84.5, 119], [90.5, 119]],
        smirk: [[55, 121], [62, 121], [69, 121], [76, 120], [83, 118], [89, 115], [94, 111]],
        sad: [[50, 126], [56, 120], [64, 116.5], [72.3, 115.5], [80.5, 116.5], [88.5, 120], [94.5, 126]],
      },
    },
    asya: {
      offset: [10.5, 5],
      eyes: { l: [35, 87.6], r: [101, 87.1] },
      idleEyes: {
        l: [[18, 87.63], [27.25, 80.63], [36.5, 73.63], [44.25, 80.63], [52, 87.63]],
        r: [[84, 87.13], [93.75, 77.13], [103.5, 67.13], [110.75, 77.13], [118, 87.13]],
      },
      mouths: {
        idle: [[45, 125.63], [59.34, 139.63], [70.15, 131.65], [81.66, 139.63], [96, 125.63]],
        happy: [[47, 123], [55, 136], [70.5, 141], [86, 136], [94, 123]],
        o: [[70.5, 122], [79.5, 131], [70.5, 140], [61.5, 131], [70.5, 122]],
        flat: [[56, 132], [63, 132], [70.5, 132], [78, 132], [85, 132]],
        smirk: [[55, 134], [63, 134], [71, 133], [80, 130], [88, 125]],
        sad: [[49, 138], [56, 131], [70.5, 127], [85, 131], [92, 138]],
      },
    },
  };

  /** Eye shapes relative to the anchor; drawn for the left eye, mirrored for the right. */
  const EYE_SHAPES: Record<Exclude<EyeKind, 'idle'>, Pt[]> = {
    happy: [[-16, 0], [-11, -11], [0, -16], [11, -11], [16, 0]],
    dot: [[0, -16], [0, -13], [0, -9.5], [0, -6], [0, -3]],
    flat: [[-15, -6], [-7.5, -6], [0, -6], [7.5, -6], [15, -6]],
    closed: [[-16, -10], [-9, -3], [0, -0.5], [9, -3], [16, -10]],
    sad: [[-15, -3], [-7.5, -6], [0, -9], [7.5, -12], [15, -15]],
    wink: [[-15, -15], [-6, -11], [4, -7], [-6, -3], [-15, 1]],
  };

  const geo = $derived(GEOMETRY[persona]);
  const accent = $derived(PERSONA_LOOKS[persona].accent);

  function eye(side: 'l' | 'r', kind: EyeKind): string {
    const pts = kind === 'idle'
      ? geo.idleEyes[side]
      : EYE_SHAPES[kind].map(([x, y]): Pt => [geo.eyes[side][0] + (side === 'r' ? -x : x), geo.eyes[side][1] + y]);
    return poly(pts);
  }

  function poly(pts: Pt[]): string {
    return pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x} ${y}`).join(' ');
  }

  const eyeKinds = $derived.by<[EyeKind, EyeKind]>(() => {
    switch (mood) {
      case 'think':
        return ['flat', 'dot'];
      case 'search':
      case 'read':
      case 'profile':
      case 'web':
      case 'app':
      case 'write':
        return ['dot', 'dot'];
      case 'cards':
      case 'happy':
        return ['happy', 'happy'];
      case 'wave':
        return ['happy', 'wink'];
      case 'sad':
        return ['sad', 'sad'];
      case 'sleep':
        return ['closed', 'closed'];
      default:
        return ['idle', 'idle'];
    }
  });

  const mouthKind = $derived.by<MouthKind>(() => {
    switch (mood) {
      case 'think':
        return 'smirk';
      case 'search':
        return persona === 'asya' ? 'flat' : 'o';
      case 'web':
      case 'write':
        return 'o';
      case 'cards':
      case 'happy':
      case 'wave':
        return 'happy';
      case 'sad':
        return 'sad';
      case 'sleep':
        return 'flat';
      default:
        return 'idle';
    }
  });

  /** Where the open («dot») eyes look. */
  const gaze = $derived.by<Pt>(() => {
    switch (mood) {
      case 'think':
        return [3, -4];
      case 'web':
        return [0, -4];
      case 'read':
      case 'profile':
      case 'write':
        return [0, 4];
      case 'app':
        return [4, 3];
      default:
        return [0, 0];
    }
  });

  const eyeL = $derived(eye('l', eyeKinds[0]));
  const eyeR = $derived(eye('r', eyeKinds[1]));
  const mouth = $derived(poly(geo.mouths[mouthKind]));
</script>

<span
  class="face face--{persona} face--{mood}"
  class:face--framed={framed}
  style:--face-size="{size}px"
  style:--face-accent={accent}
  aria-hidden="true"
>
  <svg viewBox="0 0 160 160" width={size} height={size} fill="none">
    <g class="tilt">
      <g class="motion">
        <g transform="translate({geo.offset[0]} {geo.offset[1]})">
          <!-- ears -->
          {#if persona === 'asya'}
            <g class="ear ear--l"><g class="ear__anim">
              <path class="line" d="M5.49 60.61 12.1 13.97 52.19 45.36" />
            </g></g>
            <g class="ear ear--r"><g class="ear__anim">
              <path class="line" d="M133.19 56.13 121 10.63 85 46.63" />
            </g></g>
          {:else}
            <g class="ear ear--l"><g class="ear__anim">
              <path class="fill" d="M0.4 57.6 26 0.9 56.3 10.8 65.8 35.9 60.6 38.5 49.8 26 38.1 36.8 39 42 10.8 64.1z" />
            </g></g>
            <g class="ear ear--r"><g class="ear__anim">
              <path class="fill" d="M144.15 57.6 118.55 0.9 88.25 10.8 78.75 35.9 83.95 38.5 94.75 26 106.45 36.8 105.55 42 133.75 64.1z" />
            </g></g>
          {/if}

          <!-- eyes -->
          <g class="gaze" style:transform="translate({gaze[0]}px, {gaze[1]}px)">
            <g class="scan">
              <path class="line eye" class:eye--open={eyeKinds[0] === 'dot'} d={eyeL} style:d={`path("${eyeL}")`} />
              <path class="line eye" class:eye--open={eyeKinds[1] === 'dot'} d={eyeR} style:d={`path("${eyeR}")`} />
            </g>
          </g>

          <!-- nose -->
          {#if persona === 'asya'}
            <path class="line line--round" d="M74 112.63 70.5 109.63 67 112.63" />
          {:else}
            <path class="line line--round" d="M69 92.28 72.5 95.28 76 92.28" />
          {/if}

          <!-- mouth -->
          <path class="line mouth" class:mouth--o={mouthKind === 'o'} d={mouth} style:d={`path("${mouth}")`} />

          <!-- tear (sad) -->
          <g class="prop" class:on={mood === 'sad'}>
            <path
              class="tear"
              d={persona === 'asya'
                ? 'M27 98c-3.6 5-5 7.6-5 9.6a5 5 0 0 0 10 0c0-2-1.4-4.6-5-9.6z'
                : 'M33 82c-3.6 5-5 7.6-5 9.6a5 5 0 0 0 10 0c0-2-1.4-4.6-5-9.6z'}
            />
          </g>
        </g>
      </g>
    </g>

    <!-- thinking dots -->
    <g class="prop prop--think" class:on={mood === 'think'}>
      <circle cx="80" cy="24" r="4" />
      <circle cx="89" cy="14" r="5" />
      <circle cx="99" cy="3" r="6.5" />
    </g>

    <!-- magnifier sweeping across the eyes -->
    <g class="prop" class:on={mood === 'search'}>
      <g class="lens">
        <circle class="line line--thin" cx="80" cy="80" r="15" />
        <path class="line line--round" d="M91 91l12 12" />
      </g>
    </g>

    <!-- globe -->
    <g class="prop" class:on={mood === 'web'}>
      <g class="globe">
        <circle class="line line--thin" cx="80" cy="14" r="12" />
        <path class="line line--hair" d="M68 14h24" />
        <ellipse class="line line--hair globe__meridian" cx="80" cy="14" rx="5" ry="12" />
      </g>
    </g>

    <!-- card / list -->
    <g class="prop" class:on={mood === 'read' || mood === 'profile'}>
      <g class="card">
        <rect class="line line--thin" x="118" y="116" width="34" height="28" rx="5" />
        {#if mood === 'profile'}
          <circle class="dot" cx="128" cy="126" r="3.5" />
          <path class="line line--hair" d="M136 125h9M126 136h19" />
        {:else}
          <path class="line line--hair" d="M126 125h19M126 135h12" />
        {/if}
      </g>
    </g>

    <!-- gear -->
    <g class="prop" class:on={mood === 'app'}>
      <g class="gear">
        <circle class="line gear__teeth" cx="137" cy="133" r="12" />
        <circle class="line line--hair" cx="137" cy="133" r="5" />
      </g>
    </g>

    <!-- pen -->
    <g class="prop" class:on={mood === 'write'}>
      <g class="pen">
        <path class="line line--thin line--round" d="M120 150l26-26M146 124l5 5" />
      </g>
    </g>

    <!-- sparkles -->
    <g class="prop prop--spark" class:on={mood === 'happy' || mood === 'cards' || mood === 'wave'}>
      <path class="line line--hair line--round" d="M14 92v18M5 101h18" />
      <path class="line line--hair line--round" d="M148 88v14M141 95h14" />
      <path class="line line--hair line--round" d="M80 2v12M74 8h12" />
    </g>

    <!-- sleep -->
    <g class="prop prop--zz" class:on={mood === 'sleep'}>
      <text x="80" y="30">z</text>
      <text x="96" y="16" class="zz--big">z</text>
    </g>
  </svg>
</span>

<style>
  .face {
    position: relative;
    display: inline-grid;
    place-items: center;
    flex: none;
    width: var(--face-size);
    height: var(--face-size);
  }

  .face--framed {
    border-radius: 50%;
    background: color-mix(in srgb, var(--face-accent) 13%, transparent);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--face-accent) 24%, transparent);
    transition:
      background 0.4s ease,
      box-shadow 0.4s ease;
  }

  .face--framed svg {
    width: 70%;
    height: 70%;
  }

  svg {
    display: block;
    overflow: visible;
  }

  svg * {
    transform-box: view-box;
  }

  /* ── strokes ── */
  .line {
    stroke: var(--face-accent);
    stroke-width: 11;
    fill: none;
    transition: stroke 0.4s ease;
  }

  .line--round {
    stroke-linecap: round;
    stroke-linejoin: round;
  }

  .line--thin {
    stroke-width: 7;
  }

  .line--hair {
    stroke-width: 5;
  }

  .fill,
  .dot {
    fill: var(--face-accent);
    transition: fill 0.4s ease;
  }

  .tear {
    fill: #7cc4ff;
  }

  /* morphing features */
  .eye,
  .mouth {
    stroke-linejoin: round;
    transition:
      d 0.42s cubic-bezier(0.34, 1.36, 0.64, 1),
      stroke 0.4s ease;
  }

  .mouth--o {
    stroke-width: 8;
    stroke-linecap: round;
  }

  .eye--open {
    stroke-width: 12;
    stroke-linecap: round;
  }

  /* ── head pose (transition) + motion (loop) ── */
  .tilt {
    transform-origin: 80px 120px;
    transition: transform 0.5s cubic-bezier(0.34, 1.4, 0.64, 1);
  }

  .motion {
    transform-origin: 80px 120px;
    animation: face-breathe 3.6s ease-in-out infinite;
  }

  .face--think .tilt {
    transform: rotate(-7deg);
  }

  .face--read .tilt,
  .face--profile .tilt {
    transform: rotate(-3deg) translateY(2px);
  }

  .face--sad .tilt {
    transform: translateY(4px) rotate(3deg);
  }

  .face--sleep .tilt {
    transform: rotate(7deg) translateY(3px);
  }

  .face--search .motion {
    animation: face-sway 1.8s ease-in-out infinite;
  }

  .face--write .motion {
    animation: face-nod 0.6s ease-in-out infinite;
  }

  .face--happy .motion,
  .face--cards .motion {
    animation: face-bounce 0.9s cubic-bezier(0.5, 0, 0.5, 1) infinite;
  }

  .face--wave .motion {
    animation: face-hello 2.6s ease-in-out infinite;
  }

  .face--sleep .motion {
    animation: face-breathe 5s ease-in-out infinite;
  }

  .face--sad .motion {
    animation: face-sob 2.8s ease-in-out infinite;
  }

  /* ── eyes ── */
  .gaze {
    transition: transform 0.4s ease;
  }

  .face--search .scan {
    animation: eye-scan 1.8s ease-in-out infinite;
  }

  .face--read .scan,
  .face--profile .scan {
    animation: eye-read 1.5s ease-in-out infinite;
  }

  /* blink: «^» eyes squash, open eyes close */
  .face--idle .eye,
  .face--app .eye,
  .face--web .eye {
    transform-box: fill-box;
    transform-origin: 50% 70%;
    animation: eye-blink 4.8s infinite;
  }

  .face--asya .eye {
    animation-duration: 5.6s;
    animation-delay: -1.4s;
  }

  .mouth {
    transform-box: fill-box;
    transform-origin: center;
  }

  .face--write .mouth {
    animation: mouth-talk 0.48s ease-in-out infinite;
  }

  /* ── ears ── */
  .ear {
    transition: transform 0.5s cubic-bezier(0.34, 1.56, 0.64, 1);
  }

  .face--asya .ear--l,
  .face--asya .ear--l .ear__anim {
    transform-origin: 28px 52px;
  }

  .face--asya .ear--r,
  .face--asya .ear--r .ear__anim {
    transform-origin: 109px 50px;
  }

  .face--kanna .ear--l,
  .face--kanna .ear--l .ear__anim {
    transform-origin: 44px 17px;
  }

  .face--kanna .ear--r,
  .face--kanna .ear--r .ear__anim {
    transform-origin: 100px 17px;
  }

  /* Ася: a twitch now and then; perked when curious/happy, flattened when sad or sleepy */
  .face--asya .ear--r .ear__anim {
    animation: cat-twitch 5.4s ease-in-out infinite;
  }

  .face--asya.face--think .ear--l,
  .face--asya.face--search .ear--l {
    transform: rotate(-9deg);
  }

  .face--asya.face--happy .ear,
  .face--asya.face--cards .ear,
  .face--asya.face--wave .ear {
    transform: translateY(-4px) scale(1.04);
  }

  .face--asya.face--sad .ear--l,
  .face--asya.face--sleep .ear--l {
    transform: translate(-2px, 7px) rotate(-13deg);
  }

  .face--asya.face--sad .ear--r,
  .face--asya.face--sleep .ear--r {
    transform: translate(2px, 7px) rotate(13deg);
  }

  /* Канна: ears flap, fly up when happy, droop when sad */
  .face--kanna .ear--l .ear__anim {
    animation: dog-flap-l 3.6s ease-in-out infinite;
  }

  .face--kanna .ear--r .ear__anim {
    animation: dog-flap-r 3.6s ease-in-out infinite;
  }

  .face--kanna.face--happy .ear--l,
  .face--kanna.face--cards .ear--l,
  .face--kanna.face--wave .ear--l {
    transform: rotate(16deg);
  }

  .face--kanna.face--happy .ear--r,
  .face--kanna.face--cards .ear--r,
  .face--kanna.face--wave .ear--r {
    transform: rotate(-16deg);
  }

  .face--kanna.face--happy .ear__anim,
  .face--kanna.face--cards .ear__anim {
    animation-duration: 0.45s;
  }

  .face--kanna.face--think .ear--r,
  .face--kanna.face--search .ear--r {
    transform: rotate(-12deg);
  }

  .face--kanna.face--sad .ear--l,
  .face--kanna.face--sleep .ear--l {
    transform: translate(-4px, 5px) rotate(-7deg);
  }

  .face--kanna.face--sad .ear--r,
  .face--kanna.face--sleep .ear--r {
    transform: translate(4px, 5px) rotate(7deg);
  }

  /* ── props ── */
  .prop {
    opacity: 0;
    transform: scale(0.6);
    transform-origin: 80px 80px;
    transition:
      opacity 0.3s ease,
      transform 0.4s cubic-bezier(0.34, 1.56, 0.64, 1);
    pointer-events: none;
  }

  .prop.on {
    opacity: 1;
    transform: none;
  }

  .prop--think circle {
    fill: var(--face-accent);
    transform-box: fill-box;
    transform-origin: center;
    animation: think-dot 1.2s ease-in-out infinite;
  }

  .prop--think circle:nth-child(2) {
    animation-delay: 0.18s;
  }

  .prop--think circle:nth-child(3) {
    animation-delay: 0.36s;
  }

  .lens {
    animation: lens-sweep 1.8s ease-in-out infinite;
  }

  .globe {
    animation: globe-bob 2s ease-in-out infinite;
  }

  .globe__meridian {
    transform-box: fill-box;
    transform-origin: center;
    animation: globe-spin 1.6s linear infinite;
  }

  .card {
    transform-origin: 135px 130px;
    animation: card-bob 1.5s ease-in-out infinite;
  }

  .gear__teeth {
    stroke-width: 8;
    stroke-dasharray: 5 4.4;
  }

  .gear {
    transform-origin: 137px 133px;
    animation: gear-spin 2.6s linear infinite;
  }

  .pen {
    animation: pen-write 0.9s ease-in-out infinite;
  }

  .prop--spark path {
    transform-box: fill-box;
    transform-origin: center;
    animation: spark 1.3s ease-in-out infinite;
  }

  .prop--spark path:nth-child(2) {
    animation-delay: 0.4s;
  }

  .prop--spark path:nth-child(3) {
    animation-delay: 0.8s;
  }

  .tear {
    animation: tear-fall 2s ease-in infinite;
  }

  .prop--zz text {
    fill: var(--face-accent);
    font: 900 22px/1 var(--uikit-v2-font, sans-serif);
    animation: zz-float 2.6s ease-in-out infinite;
  }

  .prop--zz .zz--big {
    font-size: 30px;
    animation-delay: 1s;
  }

  /* ── keyframes ── */
  @keyframes face-breathe {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-2px);
    }
  }

  @keyframes face-sway {
    0%,
    100% {
      transform: rotate(-3deg);
    }
    50% {
      transform: rotate(3deg);
    }
  }

  @keyframes face-nod {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(2.5px);
    }
  }

  @keyframes face-bounce {
    0%,
    100% {
      transform: translateY(0) scale(1);
    }
    30% {
      transform: translateY(-7px) scale(1.02, 0.99);
    }
    55% {
      transform: translateY(0) scale(1.03, 0.96);
    }
  }

  @keyframes face-hello {
    0%,
    55%,
    100% {
      transform: rotate(0);
    }
    65% {
      transform: rotate(-7deg);
    }
    77% {
      transform: rotate(6deg);
    }
    89% {
      transform: rotate(-3deg);
    }
  }

  @keyframes face-sob {
    0%,
    70%,
    100% {
      transform: translateY(0);
    }
    78% {
      transform: translateY(1.5px);
    }
    86% {
      transform: translateY(-0.5px);
    }
  }

  @keyframes eye-scan {
    0%,
    100% {
      transform: translateX(-6px);
    }
    50% {
      transform: translateX(6px);
    }
  }

  @keyframes eye-read {
    0% {
      transform: translateX(-5px);
    }
    75% {
      transform: translateX(5px);
    }
    100% {
      transform: translateX(-5px);
    }
  }

  @keyframes eye-blink {
    0%,
    92%,
    100% {
      transform: scaleY(1);
    }
    95% {
      transform: scaleY(0.15);
    }
  }

  @keyframes mouth-talk {
    0%,
    100% {
      transform: scaleY(0.55);
    }
    50% {
      transform: scaleY(1.05);
    }
  }

  @keyframes cat-twitch {
    0%,
    78%,
    90%,
    100% {
      transform: rotate(0);
    }
    82% {
      transform: rotate(12deg);
    }
    86% {
      transform: rotate(-4deg);
    }
  }

  @keyframes dog-flap-l {
    0%,
    100% {
      transform: rotate(0);
    }
    50% {
      transform: rotate(4deg);
    }
  }

  @keyframes dog-flap-r {
    0%,
    100% {
      transform: rotate(0);
    }
    50% {
      transform: rotate(-4deg);
    }
  }

  @keyframes think-dot {
    0%,
    100% {
      opacity: 0.35;
      transform: scale(0.8);
    }
    50% {
      opacity: 1;
      transform: scale(1.1);
    }
  }

  @keyframes lens-sweep {
    0%,
    100% {
      transform: translate(-30px, 0) rotate(-6deg);
    }
    50% {
      transform: translate(30px, -2px) rotate(6deg);
    }
  }

  @keyframes globe-bob {
    0%,
    100% {
      transform: translateY(0);
    }
    50% {
      transform: translateY(-3px);
    }
  }

  @keyframes globe-spin {
    0% {
      transform: scaleX(1);
    }
    50% {
      transform: scaleX(0.1);
    }
    100% {
      transform: scaleX(1);
    }
  }

  @keyframes card-bob {
    0%,
    100% {
      transform: translateY(0) rotate(-4deg);
    }
    50% {
      transform: translateY(-4px) rotate(2deg);
    }
  }

  @keyframes gear-spin {
    to {
      transform: rotate(360deg);
    }
  }

  @keyframes pen-write {
    0%,
    100% {
      transform: translate(0, 0);
    }
    25% {
      transform: translate(-5px, 2px);
    }
    50% {
      transform: translate(2px, -1px);
    }
    75% {
      transform: translate(-3px, 3px);
    }
  }

  @keyframes spark {
    0%,
    100% {
      opacity: 0.2;
      transform: scale(0.5) rotate(0);
    }
    50% {
      opacity: 1;
      transform: scale(1.1) rotate(45deg);
    }
  }

  @keyframes tear-fall {
    0% {
      transform: translateY(-2px);
      opacity: 0;
    }
    20% {
      opacity: 1;
    }
    100% {
      transform: translateY(16px);
      opacity: 0;
    }
  }

  @keyframes zz-float {
    0% {
      transform: translate(0, 4px);
      opacity: 0;
    }
    40% {
      opacity: 1;
    }
    100% {
      transform: translate(8px, -12px);
      opacity: 0;
    }
  }

  @media (prefers-reduced-motion: reduce) {
    .face * {
      animation: none !important;
    }
  }
</style>
