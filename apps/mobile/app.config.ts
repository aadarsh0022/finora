import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Finora',
  slug: 'finora',
  scheme: 'finora',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  android: {
    package: 'com.aadarshchandanvandan.finora',
    versionCode: 1,
    allowBackup: false,
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.VIBRATE',
    ],
  },
  ios: { bundleIdentifier: 'com.aadarshchandanvandan.finora' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-status-bar',
    'expo-splash-screen',
    'expo-font',
    'expo-sharing',
  ],
};
export default config;
