import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { onboardingSyncResultSchema, userSchema } from '@finora/contracts';
import { call, clearDatabase, createUser, setupDatabase, teardownDatabase } from './setup';
import { data, headers } from './advanced-fixtures';
import { database } from '../src/database/client';
beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);

it('completes setup for the session owner without creating finance records and survives repeat requests', async () => {
  const first = await createUser();
  const second = await createUser('second@example.com');
  expect((await call('POST', 'onboarding/complete', {})).status).toBe(401);
  expect(
    (
      await call(
        'POST',
        'onboarding/complete',
        { userId: second.user.id },
        first.accessToken,
        headers(),
      )
    ).status,
  ).toBe(400);
  const operation = headers();
  const result = userSchema.parse(
    data(await call('POST', 'onboarding/complete', {}, first.accessToken, operation)),
  );
  expect(result.onboardingCompletedAt).toBeDefined();
  expect(data(await call('POST', 'onboarding/complete', {}, first.accessToken, operation))).toEqual(
    result,
  );
  expect(
    userSchema.parse(
      data(await call('POST', 'onboarding/complete', {}, first.accessToken, headers())),
    ).onboardingCompletedAt,
  ).toBe(result.onboardingCompletedAt);
  expect(
    userSchema.parse(data(await call('GET', 'auth/me', undefined, first.accessToken)))
      .onboardingCompletedAt,
  ).toBe(result.onboardingCompletedAt);
  expect(
    userSchema.parse(data(await call('GET', 'auth/me', undefined, second.accessToken)))
      .onboardingCompletedAt,
  ).toBeUndefined();
  const { db } = await database();
  expect(await db.collection('accounts').countDocuments()).toBe(0);
  expect(await db.collection('transactions').countDocuments()).toBe(0);
});

it('atomically syncs offline setup, preserving the client account ID and replaying a lost response', async () => {
  const first = await createUser();
  const body = {
    baseline: first.user.preferences,
    preferences: { ...first.user.preferences, preferredTheme: 'dark' },
    account: {
      id: '22222222-2222-4222-8222-222222222222',
      name: 'Everyday',
      type: 'CASH',
      openingBalanceMinor: '12550',
    },
  };
  const operation = headers();
  expect((await call('POST', 'onboarding/sync', body)).status).toBe(401);
  const result = onboardingSyncResultSchema.parse(
    data(await call('POST', 'onboarding/sync', body, first.accessToken, operation)),
  );
  expect(result.account?.id).toBe(body.account.id);
  expect(result.account?.openingBalanceMinor).toBe('12550');
  expect(result.account?.userId).toBe(first.user.id);
  expect(result.user.preferences.preferredTheme).toBe('dark');
  expect(data(await call('POST', 'onboarding/sync', body, first.accessToken, operation))).toEqual(
    result,
  );
  const { db } = await database();
  expect(await db.collection('accounts').countDocuments({ userId: first.user.id })).toBe(1);
  expect(await db.collection('transactions').countDocuments()).toBe(0);
  expect(
    (
      await call(
        'POST',
        'onboarding/sync',
        { ...body, userId: first.user.id },
        first.accessToken,
        headers(),
      )
    ).status,
  ).toBe(400);
});
it('rolls back setup on a currency conflict and isolates identical client IDs across owners', async () => {
  const first = await createUser();
  const second = await createUser('second@example.com');
  const id = '22222222-2222-4222-8222-222222222222';
  const body = {
    baseline: first.user.preferences,
    preferences: first.user.preferences,
    account: { id, name: 'Everyday', type: 'CASH', openingBalanceMinor: '100' },
  };
  data(await call('POST', 'onboarding/sync', body, first.accessToken, headers()));
  data(await call('POST', 'onboarding/sync', body, second.accessToken, headers()));
  const { db } = await database();
  expect(await db.collection('accounts').countDocuments({ id })).toBe(2);
  expect(
    (
      await call(
        'POST',
        'onboarding/sync',
        { ...body, account: undefined, preferences: { ...body.preferences, baseCurrency: 'USD' } },
        first.accessToken,
        headers(),
      )
    ).status,
  ).toBe(409);
  expect(
    userSchema.parse(data(await call('GET', 'auth/me', undefined, first.accessToken))).preferences
      .baseCurrency,
  ).toBe('INR');
  expect(await db.collection('accounts').countDocuments({ userId: first.user.id })).toBe(1);
});

it('replays a completion without an account after the original settings change', async () => {
  const first = await createUser();
  const operation = headers();
  const body = {
    baseline: first.user.preferences,
    preferences: { ...first.user.preferences, preferredTheme: 'dark' },
  };
  const original = onboardingSyncResultSchema.parse(
    data(await call('POST', 'onboarding/sync', body, first.accessToken, operation)),
  );
  expect(
    onboardingSyncResultSchema.parse(
      data(await call('POST', 'onboarding/sync', body, first.accessToken, operation)),
    ),
  ).toEqual(original);
});
