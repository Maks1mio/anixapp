import type { CapacitorConfig } from '@capacitor/cli';

// Цель сборки: tv (по умолчанию) | mobile (ANIXAPP_TARGET=mobile).
// Capacitor CLI не принимает --config, поэтому мобильная цель выбирается переменной окружения
// и живёт в отдельной платформе android-mobile с отдельным applicationId.
const target = (process.env.ANIXAPP_TARGET || 'tv').trim();
const isMobile = target === 'mobile';

// Remote UI только для live APK (ANIXAPP_TV_LIVE_URL). Prod APK — bundled dist-android / dist-mobile.
const remoteUrl = (process.env.ANIXAPP_TV_LIVE_URL || process.env.ANIXAPP_TV_REMOTE_URL || '')
  .trim()
  .replace(/\/$/, '');

const config: CapacitorConfig = {
  // Временный placeholder-id мобильной сборки; финальный id и название будут заданы отдельно.
  appId: isMobile ? 'com.mobileapp.anix' : 'com.anixapp.tv',
  appName: isMobile ? 'Anix Mobile' : 'AnixApp',
  webDir: isMobile ? 'dist-mobile' : 'dist-android',
  android: {
    path: isMobile ? 'android-mobile' : 'android',
    allowMixedContent: true,
    // Отладка WebView по chrome://inspect — только по явному флагу сборки (в релизе выключена)
    webContentsDebuggingEnabled: process.env.ANIXAPP_DEBUG_WEBVIEW === '1',
  },
  server: {
    androidScheme: 'https',
    ...(remoteUrl
      ? {
          url: remoteUrl,
          ...(remoteUrl.startsWith('http://') ? { cleartext: true } : {}),
        }
      : {}),
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
