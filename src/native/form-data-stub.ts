/** Browser stub: anixapi uses form-data only for image uploads. */
export default class FormDataStub {
  append(_key: string, _value: unknown, _opts?: unknown): void {}
  setBoundary(_boundary: string): void {}
  getLengthSync(): number {
    return 0;
  }
  getBuffer(): Uint8Array {
    return new Uint8Array();
  }
  getHeaders(headers: Record<string, string> = {}): Record<string, string> {
    return headers;
  }
}
