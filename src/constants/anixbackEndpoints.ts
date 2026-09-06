export const ANIXBACK_LOCAL_ORIGIN = 'http://localhost:8787';
export const ANIXBACK_PROD_ORIGIN = 'https://api.anixapp.com';

export type AnixbackEndpointMode = 'local' | 'prod';

export const ANIXBACK_ENDPOINT_OPTIONS = [
  { value: 'local' as const, label: 'Локальный (localhost:8787)', origin: ANIXBACK_LOCAL_ORIGIN },
  { value: 'prod' as const, label: 'api.anixapp.com', origin: ANIXBACK_PROD_ORIGIN },
] as const;

export const DEFAULT_ANIXBACK_MODE: AnixbackEndpointMode = import.meta.env.DEV ? 'local' : 'prod';

export function originForMode(mode: AnixbackEndpointMode): string {
  return mode === 'local' ? ANIXBACK_LOCAL_ORIGIN : ANIXBACK_PROD_ORIGIN;
}
