import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { assistantChangeSchema, assistantRecordsResultSchema } from '@finora/contracts';
import { call, clearDatabase, createUser, setupDatabase, teardownDatabase } from './setup';
import { data, fixture, headers } from './advanced-fixtures';
import { database } from '../src/database/client';
import { authenticate } from '../src/modules/auth/service';
import { reserveAssistantMessage, usageDay } from '../src/modules/assistant/usage';
import { operationCatalog } from '../src/modules/assistant/operation-catalog';
import { assistantOperationSchema } from '@finora/contracts';
beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);
const prepare = async (
  token: string,
  operation: string,
  values: { field: string; value: string }[],
  record: string | null = null,
  parent: string | null = null,
) =>
  assistantChangeSchema.parse(
    data(
      await call(
        'POST',
        'assistant/v3/changes/prepare',
        { operation, record, parent, values },
        token,
      ),
    ),
  );
const confirm = (token: string, review: { token: string | null }) =>
  call('POST', 'assistant/v3/changes/confirm', { token: review.token, confirmed: true }, token);
it('allows reads without confirmation and prepares missing details without financial writes', async () => {
  const { token } = await fixture();
  const review = await prepare(token, 'create_goal', [{ field: 'name', value: 'Trip' }]);
  expect(review.token).toBeNull();
  expect(review.questions.some((q) => q.key === 'target')).toBe(true);
  const { db } = await database();
  expect(await db.collection('savings_goals').countDocuments()).toBe(0);
  const read = await call(
    'POST',
    'assistant/tools/run',
    {
      name: 'read_records',
      arguments: {
        feature: 'accounts',
        record: null,
        query: null,
        month: null,
        from: null,
        to: null,
        type: null,
      },
    },
    token,
  );
  expect(assistantRecordsResultSchema.parse(data(read)).data.total).toBe(1);
  expect(Object.keys(operationCatalog).sort()).toEqual(
    [...assistantOperationSchema.options].sort(),
  );
});
it('binds confirmation to the owner, rejects tampering and creates exactly one goal on replay', async () => {
  const first = await createUser();
  const second = await createUser('second@example.com');
  const review = await prepare(first.accessToken, 'create_goal', [
    { field: 'name', value: 'Trip' },
    { field: 'target', value: '123.45' },
  ]);
  expect(review.questions).toEqual([]);
  expect(review.token).not.toBeNull();
  expect((await confirm(second.accessToken, review)).status).toBe(403);
  expect(
    (
      await call(
        'POST',
        'assistant/v3/changes/confirm',
        { token: review.token, confirmed: false },
        first.accessToken,
      )
    ).status,
  ).toBe(400);
  expect((await confirm(first.accessToken, { token: `${review.token}x` })).status).toBe(400);
  expect((await confirm(first.accessToken, review)).status).toBe(200);
  expect((await confirm(first.accessToken, review)).status).toBe(200);
  const { db } = await database();
  expect(await db.collection('savings_goals').countDocuments({ userId: first.user.id })).toBe(1);
  expect(
    (await db.collection('savings_goals').findOne({ userId: first.user.id }))?.targetMinor,
  ).toBe('12345');
});
it('rejects stale updates instead of overwriting another device and supports exact transaction edits', async () => {
  const { token, account, expense } = await fixture();
  const transaction = data(
    await call(
      'POST',
      'transactions',
      {
        type: 'EXPENSE',
        accountId: account.id,
        categoryId: expense.id,
        amountMinor: '100',
        date: '2026-10-24T10:00:00Z',
      },
      token,
      headers(),
    ),
  ) as { id: string; version: number };
  const stale = await prepare(
    token,
    'update_transaction',
    [{ field: 'amount', value: '2.50' }],
    transaction.id,
  );
  const current = await prepare(
    token,
    'update_transaction',
    [{ field: 'amount', value: '3.00' }],
    transaction.id,
  );
  expect((await confirm(token, current)).status).toBe(200);
  expect((await confirm(token, stale)).status).toBe(409);
  const record = data(await call('GET', `transactions/${transaction.id}`, undefined, token)) as {
    amountMinor: string;
  };
  expect(record.amountMinor).toBe('300');
  const deletion = await prepare(token, 'delete_transaction', [], transaction.id);
  expect((await confirm(token, deletion)).status).toBe(200);
});
it('prepares supported creates across finance domains without writing until confirmed', async () => {
  const { token, account, expense } = await fixture();
  const cases: [string, { field: string; value: string }[]][] = [
    [
      'create_account',
      [
        { field: 'name', value: 'Cash' },
        { field: 'type', value: 'CASH' },
      ],
    ],
    [
      'create_category',
      [
        { field: 'name', value: 'Travel' },
        { field: 'type', value: 'EXPENSE' },
      ],
    ],
    [
      'create_budget',
      [
        { field: 'category', value: expense.id },
        { field: 'month', value: '2026-11' },
        { field: 'amount', value: '500' },
      ],
    ],
    [
      'create_debt',
      [
        { field: 'name', value: 'Loan' },
        { field: 'direction', value: 'BORROWED' },
        { field: 'amount', value: '1000' },
      ],
    ],
    [
      'create_recurring',
      [
        { field: 'name', value: 'Bill' },
        { field: 'type', value: 'EXPENSE' },
        { field: 'account', value: account.id },
        { field: 'category', value: expense.id },
        { field: 'amountMode', value: 'FIXED' },
        { field: 'amount', value: '50' },
        { field: 'frequency', value: 'MONTHLY' },
        { field: 'startDate', value: '2026-11-01' },
      ],
    ],
  ];
  for (const [operation, fields] of cases) {
    const review = await prepare(token, operation, fields);
    expect(review.questions, operation).toEqual([]);
    expect(review.token, operation).not.toBeNull();
    expect((await confirm(token, review)).status, operation).toBe(200);
  }
});
it('enforces the daily allowance atomically under concurrency while the admin has no daily cap', async () => {
  const user = await createUser();
  const admin = await createUser('aadarsh0022@gmail.com');
  const context = await authenticate(
    new Request('http://local', { headers: { Authorization: `Bearer ${user.accessToken}` } }),
  );
  const attempts = await Promise.allSettled(
    Array.from({ length: 30 }, () => reserveAssistantMessage(context)),
  );
  expect(attempts.filter((r) => r.status === 'fulfilled')).toHaveLength(20);
  const adminContext = await authenticate(
    new Request('http://local', { headers: { Authorization: `Bearer ${admin.accessToken}` } }),
  );
  await Promise.all(Array.from({ length: 25 }, () => reserveAssistantMessage(adminContext)));
  const usage = data(await call('GET', 'assistant/usage', undefined, user.accessToken)) as {
    used: number;
    limit: number;
  };
  expect(usage).toMatchObject({ used: 20, limit: 20 });
  expect(data(await call('GET', 'assistant/usage', undefined, admin.accessToken))).toMatchObject({
    used: 25,
    limit: null,
  });
  expect(usageDay(new Date('2026-10-24T23:59:59Z'))).toEqual({
    day: '2026-10-24',
    resetsAt: '2026-10-25T00:00:00.000Z',
  });
});
it('protects admin metadata, never exposes credential fields and preserves the legacy chat capability version', async () => {
  const admin = await createUser('aadarsh0022@gmail.com');
  const regular = await createUser();
  expect((await call('GET', 'admin/users')).status).toBe(401);
  expect((await call('GET', 'admin/users', undefined, regular.accessToken)).status).toBe(403);
  const result = data(await call('GET', 'admin/users', undefined, admin.accessToken));
  expect(result).toMatchObject({ totalUsers: 2 });
  const serialized = JSON.stringify(result);
  expect(serialized).not.toContain('passwordHash');
  expect(serialized).not.toContain(admin.accessToken);
  expect(serialized).not.toContain('refreshHash');
  expect(
    data(await call('GET', 'assistant/capabilities', undefined, regular.accessToken)),
  ).toMatchObject({ policyVersion: '2026-10-23-v2', readOnly: true });
});
