import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { userSchema } from '@finora/contracts';
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
