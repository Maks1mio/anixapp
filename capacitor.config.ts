import type { CapacitorConfig } from '@capacitor/cli';

// Единственная Android-цель форка — телефоны и планшеты (проект android-mobile/, веб-сборка dist-mobile).
// ТВ-сборка (android/, dist-android) удалена.
const config: CapacitorConfig = {
  appId: 'com.mobileapp.anix',
  appName: 'Anix Mobile',
  webDir: 'dist-mobile',
  android: {
    path: 'android-mobile',
    allowMixedContent: true,
    // Отладка WebView по chrome://inspect — только по явному флагу сборки (в релизе выключена)
    webContentsDebuggingEnabled: process.env.ANIXAPP_DEBUG_WEBVIEW === '1',
  },
  server: {
    androidScheme: 'https',
  },
  plugins: {
    CapacitorHttp: {
      enabled: true,
    },
  },
};

export default config;
