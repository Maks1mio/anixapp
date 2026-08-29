import path from 'node:path';
import { existsSync } from 'node:fs';

export const sdkDir = process.env.ANDROID_HOME
  || process.env.ANDROID_SDK_ROOT
  || path.join(process.env.LOCALAPPDATA || '', 'Android', 'Sdk');

export const javaHome = process.env.JAVA_HOME
  || 'C:\\Program Files\\Android\\Android Studio\\jbr';

export const sdkEnv = {
  ...process.env,
  ANDROID_HOME: sdkDir,
  ANDROID_SDK_ROOT: sdkDir,
  JAVA_HOME: javaHome,
};

export const AVD_NAME = 'AnixAppTV';
export const TV_IMAGE_CANDIDATES = [
  'system-images;android-34;android-tv;x86_64',
  'system-images;android-36;android-tv;x86_64',
  'system-images;android-35;android-tv;x86_64',
  'system-images;android-34;google-tv;x86_64',
  'system-images;android-34;android-tv;x86',
];

export function tool(rel) {
  const full = path.join(sdkDir, ...rel);
  if (!existsSync(full)) return null;
  return full;
}

export function sdkmanagerBin() {
  return tool(['cmdline-tools', 'latest', 'bin', process.platform === 'win32' ? 'sdkmanager.bat' : 'sdkmanager'])
    || tool(['cmdline-tools', '11.0', 'bin', process.platform === 'win32' ? 'sdkmanager.bat' : 'sdkmanager']);
}

export function avdmanagerBin() {
  return tool(['cmdline-tools', 'latest', 'bin', process.platform === 'win32' ? 'avdmanager.bat' : 'avdmanager'])
    || tool(['cmdline-tools', '11.0', 'bin', process.platform === 'win32' ? 'avdmanager.bat' : 'avdmanager']);
}

export function emulatorBin() {
  return tool(['emulator', process.platform === 'win32' ? 'emulator.exe' : 'emulator']);
}

export function adbBin() {
  return tool(['platform-tools', process.platform === 'win32' ? 'adb.exe' : 'adb']);
}
