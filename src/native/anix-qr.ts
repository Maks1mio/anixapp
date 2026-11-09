/** Сканер QR-кода для входа на другом устройстве (плагин AnixQr в мобильной сборке). */
type QrScanResult = { key?: string; cancelled?: boolean; denied?: boolean };
type QrPlugin = { scan: () => Promise<QrScanResult> };

function plugin(): QrPlugin | undefined {
  return (window as unknown as { Capacitor?: { Plugins?: { AnixQr?: QrPlugin } } }).Capacitor?.Plugins?.AnixQr;
}

export function hasQrScanner(): boolean {
  return !!plugin();
}

export async function scanQrSignIn(): Promise<QrScanResult> {
  return (await plugin()?.scan()) ?? { cancelled: true };
}
