/** Случайный релиз: запоминает, откуда его взяли, чтобы со страницы тайтла можно было выбрать следующий так же. */
import { writable } from 'svelte/store';
import { navigate } from './navigation';

type PickRelease = () => Promise<number | null | undefined>;

let lastPick: PickRelease | null = null;

/** Релиз, открытый кнопкой случайного выбора: кнопка повтора видна только на нём. */
export const randomReleaseId = writable<number | null>(null);

export async function openRandomRelease(pick: PickRelease): Promise<void> {
  const id = await pick();
  if (!id) return;
  lastPick = pick;
  randomReleaseId.set(id);
  navigate(`/release/${id}`);
}

export async function shuffleRandomRelease(): Promise<void> {
  if (lastPick) await openRandomRelease(lastPick);
}
