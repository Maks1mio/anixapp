/** Chat personas: look (face colors, accent) lives here, character lives on anixback (agent/prompt.ts). */

export type PersonaId = 'kanna' | 'asya';

/** What the face is doing — tool activities from the stream plus a few UI states. */
export type FaceMood =
  | 'idle'
  | 'think'
  | 'search'
  | 'read'
  | 'web'
  | 'profile'
  | 'cards'
  | 'app'
  | 'write'
  | 'happy'
  | 'wave'
  | 'sad'
  | 'sleep';

export interface PersonaLook {
  id: PersonaId;
  name: string;
  /** Face line color and accent for the chat UI (buttons, caret, user bubble tint). */
  accent: string;
  tagline: string;
  /** Kind word for the switcher tooltip. */
  kind: string;
  /** Fallback when anixback doesn't send per-persona starters yet. */
  starters: string[];
}

export const PERSONA_LOOKS: Record<PersonaId, PersonaLook> = {
  kanna: {
    id: 'kanna',
    name: 'Канна',
    accent: '#e08d52',
    tagline: 'Девочка-пёсик · тёплая и энергичная',
    kind: 'пёсик',
    starters: [
      'Посоветуй что-нибудь уютное на вечер',
      'Что посмотреть с учётом моих списков?',
      'Что сегодня выходит по расписанию?',
      'Найди похожее на «Магическую битву»',
    ],
  },
  asya: {
    id: 'asya',
    name: 'Ася',
    accent: '#ff5b5d',
    tagline: 'Девочка-кошка · ироничная и точная',
    kind: 'кошка',
    starters: [
      'Что-нибудь с крутой режиссурой и атмосферой',
      'Разбери мои оценки: какой у меня вкус?',
      'Почему серия тормозит и как это исправить?',
      'Какие новости у AnixApp?',
    ],
  },
};

export const PERSONA_ORDER: PersonaId[] = ['kanna', 'asya'];

export function personaId(value: unknown): PersonaId {
  return value === 'asya' ? 'asya' : 'kanna';
}

/** Stream activity (anixback tools.ts toolActivity) → face mood. */
export function moodFromActivity(activity: string | undefined): FaceMood {
  switch (activity) {
    case 'search':
    case 'read':
    case 'web':
    case 'profile':
    case 'cards':
    case 'app':
    case 'think':
      return activity;
    default:
      return 'think';
  }
}
