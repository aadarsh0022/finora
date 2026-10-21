import { afterEach, expect, it, vi } from 'vitest';
import { getEnv } from '../src/config/env';

afterEach(() => vi.unstubAllEnvs());
function production() {
  vi.stubEnv('NODE_ENV', 'production');
  vi.stubEnv('MONGODB_URI', 'mongodb://127.0.0.1:27017');
  vi.stubEnv('MONGODB_DB', 'finora_configuration_test');
  vi.stubEnv('APP_URL', 'https://finora.example.test');
  vi.stubEnv('RATE_LIMIT_SECRET', 'configuration-test-secret-at-least-32-characters');
  vi.stubEnv('TRUST_PROXY', 'true');
  vi.stubEnv('RESEND_API_KEY', undefined);
  vi.stubEnv('EMAIL_FROM', undefined);
}
it('requires an explicit disabled-email choice while retaining production HTTPS and proxy guards', () => {
  production();
  vi.stubEnv('EMAIL_TRANSPORT', 'local');
  expect(() => getEnv()).toThrow('Production email must use Resend or be explicitly disabled');
  vi.stubEnv('EMAIL_TRANSPORT', 'disabled');
  expect(getEnv().EMAIL_TRANSPORT).toBe('disabled');
  vi.stubEnv('APP_URL', 'http://localhost:3000');
  expect(() => getEnv()).toThrow('Production requires HTTPS');
  vi.stubEnv('APP_URL', 'https://finora.example.test');
  vi.stubEnv('TRUST_PROXY', 'false');
  expect(() => getEnv()).toThrow('Production requires a trusted reverse proxy');
});
it('still requires the configured email credentials when production Resend is selected', () => {
  production();
  vi.stubEnv('EMAIL_TRANSPORT', 'resend');
  expect(() => getEnv()).toThrow('Production email is not configured');
  vi.stubEnv('RESEND_API_KEY', 'test-only-key');
  expect(() => getEnv()).toThrow('Production email is not configured');
  vi.stubEnv('EMAIL_FROM', 'test@example.test');
  expect(getEnv().EMAIL_TRANSPORT).toBe('resend');
});
