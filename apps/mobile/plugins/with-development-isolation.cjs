/* global require, module */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo loads config plugins as CommonJS.
const { withAppBuildGradle, withAndroidManifest, AndroidConfig } = require('expo/config-plugins');

module.exports = function withDevelopmentIsolation(config) {
  config = withAppBuildGradle(config, (value) => {
    const marker = '// Finora isolated development identity';
    if (value.modResults.language !== 'groovy')
      throw new Error('Review the Android build template before generating Finora.');
    if (!value.modResults.contents.includes(marker))
      value.modResults.contents += `\n${marker}\nandroid.buildTypes.debug.applicationIdSuffix = ".dev"\nandroid.buildTypes.debug.resValue "string", "app_name", "Finora Dev"\n`;
    return value;
  });
  return withAndroidManifest(config, (value) => {
    const application = AndroidConfig.Manifest.getMainApplicationOrThrow(value.modResults);
    // Local reminders do not require remote push registration or analytics.
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      'firebase_messaging_auto_init_enabled',
      'false',
    );
    AndroidConfig.Manifest.addMetaDataItemToMainApplication(
      application,
      'firebase_analytics_collection_enabled',
      'false',
    );
    return value;
  });
};
