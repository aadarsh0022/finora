import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Finora',
  slug: 'finora',
  scheme: 'finora',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'automatic',
  icon: './assets/brand/icon.png',
  android: {
    package: 'app.finora.money',
    versionCode: 1,
    allowBackup: false,
    adaptiveIcon: {
      foregroundImage: './assets/brand/adaptive-foreground.png',
      monochromeImage: './assets/brand/adaptive-monochrome.png',
      backgroundColor: '#173F32',
    },
    blockedPermissions: [
      'android.permission.READ_EXTERNAL_STORAGE',
      'android.permission.WRITE_EXTERNAL_STORAGE',
      'android.permission.SYSTEM_ALERT_WINDOW',
      'android.permission.VIBRATE',
    ],
  },
  ios: { bundleIdentifier: 'app.finora.money' },
  plugins: [
    'expo-router',
    'expo-secure-store',
    'expo-status-bar',
    [
      'expo-splash-screen',
      {
        image: './assets/brand/splash-light.png',
        imageWidth: 200,
        resizeMode: 'contain',
        backgroundColor: '#F7F9F8',
        dark: { image: './assets/brand/splash-dark.png', backgroundColor: '#0E1512' },
      },
    ],
    'expo-font',
    'expo-sharing',
    [
      'expo-local-authentication',
      { faceIDPermission: 'Use Face ID to unlock your Finora financial details.' },
    ],
    './plugins/with-release-signing.cjs',
  ],
};
export default config;
