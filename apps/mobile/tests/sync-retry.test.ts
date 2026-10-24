import { expect, it } from 'vitest';
import { ClientError } from '../src/api/client';
import { retryDelay, shouldRetrySync } from '../src/storage/sync-retry';
it('backs off transient failures up to five minutes and excludes conflicts and auth errors', () => {
  expect([0, 1, 2, 20].map(retryDelay)).toEqual([2000, 4000, 8000, 300000]);
  expect(shouldRetrySync(new ClientError('NETWORK', 'Offline'))).toBe(true);
  expect(shouldRetrySync(new ClientError('SERVICE_UNAVAILABLE', 'Retry', 503))).toBe(true);
  expect(shouldRetrySync(new ClientError('RATE_LIMITED', 'Retry', 429))).toBe(true);
  expect(shouldRetrySync(new ClientError('VERSION_CONFLICT', 'Review', 409))).toBe(false);
  expect(shouldRetrySync(new ClientError('UNAUTHORIZED', 'Sign in', 401))).toBe(false);
});
