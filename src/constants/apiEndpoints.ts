export const API_ENDPOINT_OPTIONS = [
  { value: 'https://api-s.anixsekai.com', label: 'api-s.anixsekai.com' },
  { value: 'https://api.anixart.app', label: 'api.anixart.app' },
  { value: 'https://api.anixart.tv', label: 'api.anixart.tv (заблокирован в РФ)' },
] as const;

export const DEFAULT_API_ENDPOINT = API_ENDPOINT_OPTIONS[0].value;
