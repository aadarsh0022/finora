/* global require, module */
// eslint-disable-next-line @typescript-eslint/no-require-imports -- Expo loads local config plugins as CommonJS.
const { withAppBuildGradle } = require('expo/config-plugins');

const marker = '// Finora release signing: managed by with-release-signing';
function applyReleaseSigning(contents) {
  if (contents.includes(marker)) return contents;
  const pattern = /(\brelease\s*\{[\s\S]*?)signingConfig\s+signingConfigs\.debug\b/;
  if (!pattern.test(contents))
    throw new Error(
      'Expo release signing template changed. Refuse prebuild until the Finora signing plugin is reviewed.',
    );
  return (
    contents.replace(pattern, '$1signingConfig null') +
    `\n${marker}\napply from: new File(rootDir.parentFile, "plugins/android-release-signing.gradle")\n`
  );
}
function withReleaseSigning(config) {
  return withAppBuildGradle(config, (value) => {
    if (value.modResults.language !== 'groovy')
      throw new Error('Finora release signing requires the reviewed Groovy template.');
    value.modResults.contents = applyReleaseSigning(value.modResults.contents);
    return value;
  });
}
module.exports = withReleaseSigning;
module.exports.applyReleaseSigning = applyReleaseSigning;
