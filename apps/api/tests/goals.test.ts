import { goalSchema, contributionSchema } from '@finora/contracts';
import { calendarDate } from '@finora/finance-core';
import { database } from '../src/database/client';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { call, clearDatabase, createUser, setupDatabase, teardownDatabase } from './setup';
import { data, headers, fixture } from './advanced-fixtures';
beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);

it('keeps savings contributions independent from accounts, idempotent and version safe', async () => {
  const { token, account } = await fixture();
  const goal = goalSchema.parse(
    data(await call('POST', 'goals', { name: 'Emergency', targetMinor: '1000' }, token, headers())),
  );
  const date = calendarDate(new Date(), 'Asia/Kolkata');
  const key = headers();
  const body = { amountMinor: '1500', date, version: 1 };
  const response = await call('POST', `goals/${goal.id}/contributions`, body, token, key);
  const repeated = await call('POST', `goals/${goal.id}/contributions`, body, token, key);
  expect(data(repeated)).toEqual(data(response));
  const contribution = contributionSchema.parse(
    (data(response) as { contribution: unknown }).contribution,
  );
  const detail = data(
    await call<{ savedMinor: string; remainingMinor: string; complete: boolean }>(
      'GET',
      `goals/${goal.id}`,
      undefined,
      token,
    ),
  );
  expect(detail).toMatchObject({ savedMinor: '1500', remainingMinor: '-500', complete: true });
  const accountDetail = data(
    await call<{ balanceMinor: string }>('GET', `accounts/${account.id}`, undefined, token),
  );
  expect(accountDetail.balanceMinor).toBe('0');
  expect(
    (await call('POST', `goals/${goal.id}/contributions`, body, token, headers())).status,
  ).toBe(409);
  const other = await createUser('other@example.com');
  expect(
    (
      await call(
        'DELETE',
        `goals/${goal.id}/contributions/${contribution.id}`,
        { version: 2, confirmation: 'DELETE' },
        other.accessToken,
        headers(),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await call(
        'DELETE',
        `goals/${goal.id}/contributions/${contribution.id}`,
        { version: 2, confirmation: 'DELETE' },
        token,
        headers(),
      )
    ).status,
  ).toBe(200);
  const archived = goalSchema.parse(
    data(
      await call(
        'PATCH',
        `goals/${goal.id}`,
        { name: 'Emergency', targetMinor: '1000', archived: true, version: 3 },
        token,
        headers(),
      ),
    ),
  );
  expect(archived.version).toBe(4);
  expect(
    (
      await call(
        'POST',
        `goals/${goal.id}/contributions`,
        { ...body, version: 4 },
        token,
        headers(),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await call(
        'DELETE',
        `goals/${goal.id}`,
        { version: 4, confirmation: 'DELETE' },
        token,
        headers(),
      )
    ).status,
  ).toBe(200);
  const { db } = await database();
  expect(await db.collection('savings_contributions').countDocuments({ goalId: goal.id })).toBe(0);
});

it('requires authentication for savings goals', async () => {
  expect((await call('GET', 'goals')).status).toBe(401);
});
