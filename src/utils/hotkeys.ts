/** Физическая клавиша (`e.code`) — не зависит от языка раскладки. */

export function isKeyCode(e: KeyboardEvent, code: string): boolean {
  return e.code === code;
}

/** Буква A–Z по позиции QWERTY, например `isLetterKey(e, 'z')` → KeyZ. */
export function isLetterKey(e: KeyboardEvent, letter: string): boolean {
  const ch = letter.trim().toUpperCase();
  if (!/^[A-Z]$/.test(ch)) return false;
  return e.code === `Key${ch}`;
}
