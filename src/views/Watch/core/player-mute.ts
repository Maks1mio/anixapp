/** Обход цепочки Svelte-пропсов: кнопка mute зовёт это напрямую. */

type MuteToggle = () => void;

let toggleFn: MuteToggle | null = null;

export function registerPlayerMuteToggle(fn: MuteToggle): () => void {
  toggleFn = fn;
  return () => {
    if (toggleFn === fn) toggleFn = null;
  };
}

/** @returns true если обработчик был зарегистрирован и вызван */
export function requestPlayerMuteToggle(): boolean {
  if (!toggleFn) return false;
  toggleFn();
  return true;
}
