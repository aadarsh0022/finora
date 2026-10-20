import { createRequire } from 'node:module';
import { expect, it } from 'vitest';
import { releaseApiOrigin, requireSigningInputs } from '../../../scripts/android-release-guards';

const require = createRequire(import.meta.url);
const { applyReleaseSigning } =
  require('../../../apps/mobile/plugins/with-release-signing.cjs') as {
    applyReleaseSigning: (value: string) => string;
  };
it('refuses missing/non-HTTPS/emulator/local/placeholder/credential-bearing release API origins', () => {
  // Parser-only fixture: this documentation host is never used as a Finora API.
  expect(releaseApiOrigin('https://developer.android.com/')).toBe('https://developer.android.com');
  for (const value of [
    undefined,
    '',
    'http://api.finora.invalid',
    'https://10.0.2.2',
    'https://127.0.0.1',
    'https://localhost',
    'https://[::1]',
    'https://api.internal',
    'https://api.example.com',
    'https://api.example.org',
    'https://api.example.net',
    'https://host.test',
    'https://host.local',
    'https://host.invalid',
    'https://u:p@developer.android.com',
    'https://developer.android.com/api/v1',
    'https://developer.android.com?token=value',
    'https://developer.android.com#hash',
  ])
    expect(() => releaseApiOrigin(value)).toThrow();
});
it('requires all distinct signing inputs and rejects the generated Android debug alias', () => {
  const input = {
    FINORA_ANDROID_KEYSTORE: '/private/upload.p12',
    FINORA_ANDROID_KEY_ALIAS: 'upload',
    FINORA_ANDROID_STORE_PASSWORD: 'synthetic-test-password',
    FINORA_ANDROID_KEY_PASSWORD: 'synthetic-test-password',
  };
  expect(requireSigningInputs(input).alias).toBe('upload');
  for (const name of Object.keys(input))
    expect(() => requireSigningInputs({ ...input, [name]: undefined })).toThrow();
  expect(() =>
    requireSigningInputs({ ...input, FINORA_ANDROID_KEY_ALIAS: 'AndroidDebugKey' }),
  ).toThrow();
  expect(() =>
    requireSigningInputs({ ...input, FINORA_ANDROID_STORE_PASSWORD: 'android' }),
  ).toThrow();
});
it('removes only release debug signing and reapplies the tracked guard idempotently', () => {
  const source = `android {
    signingConfigs { debug { keyAlias 'androiddebugkey' } }
    buildTypes {
      debug { signingConfig signingConfigs.debug }
      release { signingConfig signingConfigs.debug }
    }
  }`;
  const result = applyReleaseSigning(source);
  expect(result).toContain('debug { signingConfig signingConfigs.debug }');
  expect(result).toContain('release { signingConfig null }');
  expect(result).toContain('plugins/android-release-signing.gradle');
  expect(applyReleaseSigning(result)).toBe(result);
  expect(() =>
    applyReleaseSigning('android { buildTypes { release { signingConfig other } } }'),
  ).toThrow('template changed');
});
