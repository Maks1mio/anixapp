import type { CapacitorConfig } from '@capacitor/cli';

// Remote UI только для live APK (ANIXAPP_TV_LIVE_URL). Prod APK — bundled dist-android.
const remoteUrl = (process.env.ANIXAPP_TV_LIVE_URL || process.env.ANIXAPP_TV_REMOTE_URL || '')
  .trim()
  .replace(/\/$/, '');

const config: CapacitorConfig = {
  appId: 'com.anixapp.tv',
  appName: 'AnixApp',
  webDir: 'dist-android',
  android: {
    allowMixedContent: true,
    webContentsDebuggingEnabled: true,
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
