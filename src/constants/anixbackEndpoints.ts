export const ANIXBACK_LOCAL_ORIGIN = 'http://localhost:8787';
export const ANIXBACK_PROD_ORIGIN = 'https://anix.maks1mio.su';

export type AnixbackEndpointMode = 'local' | 'prod';

export const ANIXBACK_ENDPOINT_OPTIONS = [
  { value: 'local' as const, label: 'Локальный (localhost:8787)', origin: ANIXBACK_LOCAL_ORIGIN },
  { value: 'prod' as const, label: 'anix.maks1mio.su', origin: ANIXBACK_PROD_ORIGIN },
] as const;

export const DEFAULT_ANIXBACK_MODE: AnixbackEndpointMode = import.meta.env.DEV ? 'local' : 'prod';

export function originForMode(mode: AnixbackEndpointMode): string {
  return mode === 'local' ? ANIXBACK_LOCAL_ORIGIN : ANIXBACK_PROD_ORIGIN;
}
