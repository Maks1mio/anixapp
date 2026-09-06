import { getAnixbackDirectOrigin, getAnixbackOrigin, getAnixbackEndpointMode } from '../services/anixback-endpoint';

export function getFluoHttpBase(): string {
  return `${getAnixbackOrigin()}/fluo`;
}

export function getFluoWsBase(): string {
  if (
    import.meta.env.DEV
    && typeof window !== 'undefined'
    && getAnixbackEndpointMode() === 'local'
  ) {
    const host = window.location.hostname;
    if (host === '127.0.0.1' || host === 'localhost') {
      return 'ws://127.0.0.1:8787/fluo/ws';
    }
    const proto = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    return `${proto}//${window.location.host}/fluo/ws`;
  }
  const origin = getAnixbackDirectOrigin();
  if (origin.startsWith('https://')) {
    return `${origin.replace('https://', 'wss://')}/fluo/ws`;
  }
  return `${origin.replace('http://', 'ws://')}/fluo/ws`;
}
