/**
 * Приложение рисует под системными панелями, поэтому цвет их значков зависит от темы приложения,
 * а не от темы системы: светлая тема AnixApp при тёмной системе иначе оставила бы светлые значки на светлом фоне.
 */
type BarsPlugin = { setStyle: (o: { style: 'DARK' | 'LIGHT' }) => Promise<void> };

function plugin(): BarsPlugin | undefined {
  return (window as unknown as { Capacitor?: { Plugins?: { SystemBars?: BarsPlugin } } }).Capacitor?.Plugins?.SystemBars;
}

/** Фон страницы как его видит браузер: тема может задавать его и hex, и через color-mix. */
function backgroundIsDark(): boolean {
  const match = getComputedStyle(document.body).backgroundColor.match(/[\d.]+/g);
  if (!match || match.length < 3) return true;
  const [r, g, b] = match.map(Number);
  return 0.299 * r + 0.587 * g + 0.114 * b < 128;
}

export function bindSystemBarsToTheme(): void {
  const bars = plugin();
  if (!bars) return;
  let last = '';
  const sync = () => {
    // В Capacitor DARK — панель с тёмным фоном, то есть светлые значки
    const style = backgroundIsDark() ? 'DARK' : 'LIGHT';
    if (style === last) return;
    last = style;
    void bars.setStyle({ style }).catch(() => {});
  };
  sync();
  new MutationObserver(sync).observe(document.documentElement, { attributes: true, attributeFilter: ['class', 'style', 'data-theme'] });
  window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', sync);
}
