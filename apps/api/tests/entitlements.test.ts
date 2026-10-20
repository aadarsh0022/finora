import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { entitlementSchema } from '@finora/contracts';
import { call, clearDatabase, createUser, setupDatabase, teardownDatabase } from './setup';
import { data, headers } from './advanced-fixtures';
import { authenticate } from '../src/modules/auth/service';
import { getEntitlement } from '../src/modules/entitlements/service';

beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);
it('provides authenticated free access without accepting client purchase claims', async () => {
  const user = await createUser();
  const response = await call('GET', 'entitlements', undefined, user.accessToken);
  expect(entitlementSchema.parse(data(response))).toEqual({
    tier: 'FREE',
    source: 'NONE',
    expiresAt: null,
    billingAvailable: false,
    manualTrackingAvailable: true,
  });
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect((await call('GET', 'entitlements')).status).toBe(401);
  expect((await call('GET', 'entitlements?tier=PREMIUM', undefined, user.accessToken)).status).toBe(
    400,
  );
  expect(
    (await call('POST', 'entitlements', { tier: 'PREMIUM' }, user.accessToken, headers())).status,
  ).toBe(405);
  expect(
    (
      await call(
        'POST',
        'accounts',
        { name: 'Free cash', type: 'CASH' },
        user.accessToken,
        headers(),
      )
    ).status,
  ).toBe(201);
});
it('expires trusted server grants and never asks a provider about a client supplied identity', async () => {
  const user = await createUser();
  const context = await authenticate(
    new Request('http://localhost/api/v1/entitlements', {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    }),
  );
  const identities: string[] = [];
  const future = '2099-01-01T00:00:00Z';
  const premium = await getEntitlement(
    context,
    {
      async verifiedGrant(userId) {
        identities.push(userId);
        return { expiresAt: future };
      },
    },
    new Date('2026-01-01T00:00:00Z'),
  );
  expect(premium.tier).toBe('PREMIUM');
  expect(identities).toEqual([user.user.id]);
  expect(
    (
      await getEntitlement(context, {
        async verifiedGrant() {
          return { expiresAt: '2020-01-01T00:00:00Z' };
        },
      })
    ).tier,
  ).toBe('FREE');
  expect(
    (
      await getEntitlement(context, {
        async verifiedGrant() {
          return { expiresAt: 'invalid' };
        },
      })
    ).tier,
  ).toBe('FREE');
  expect(entitlementSchema.safeParse({ ...premium, source: 'NONE' }).success).toBe(false);
});
