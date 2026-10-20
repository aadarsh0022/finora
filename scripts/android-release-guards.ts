import { isIP } from 'node:net';

export function releaseApiOrigin(value: string | undefined): string {
  let url: URL;
  try {
    url = new URL(value ?? '');
  } catch {
    throw new Error('Set EXPO_PUBLIC_API_URL to your deployed HTTPS API origin.');
  }
  const host = url.hostname.toLowerCase();
  if (
    url.protocol !== 'https:' ||
    url.username ||
    url.password ||
    url.search ||
    url.hash ||
    url.pathname !== '/' ||
    isIP(host.replace(/^\[|\]$/g, '')) ||
    !host.includes('.') ||
    /(^|\.)(localhost|local|internal|invalid|example|test)$/.test(host) ||
    /(^|\.)example\.(com|org|net)$/.test(host)
  )
    throw new Error(
      'Release API must be a deployed public HTTPS origin without credentials, a path or placeholders.',
    );
  return url.origin;
}
export function requireSigningInputs(input: Record<string, string | undefined>) {
  const names = [
    'FINORA_ANDROID_KEYSTORE',
    'FINORA_ANDROID_KEY_ALIAS',
    'FINORA_ANDROID_STORE_PASSWORD',
    'FINORA_ANDROID_KEY_PASSWORD',
  ] as const;
  for (const name of names) if (!input[name]?.trim()) throw new Error(`Missing ${name}.`);
  if (/^androiddebugkey$/i.test(input.FINORA_ANDROID_KEY_ALIAS!))
    throw new Error('Android debug keys cannot sign releases.');
  if (
    input.FINORA_ANDROID_STORE_PASSWORD!.length < 12 ||
    input.FINORA_ANDROID_KEY_PASSWORD!.length < 12
  )
    throw new Error('Release keystore and key passwords must contain at least 12 characters.');
  return {
    keystore: input.FINORA_ANDROID_KEYSTORE!,
    alias: input.FINORA_ANDROID_KEY_ALIAS!,
    storePassword: input.FINORA_ANDROID_STORE_PASSWORD!,
    keyPassword: input.FINORA_ANDROID_KEY_PASSWORD!,
  };
}
