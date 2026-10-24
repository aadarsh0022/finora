import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { z } from 'zod';
import {
  budgetStatusSchema,
  monthlyLimitSchema,
  monthlyLimitStatusSchema,
  backupSchema,
} from '@finora/contracts';
import {
  setupDatabase,
  clearDatabase,
  teardownDatabase,
  call,
  createUser,
  password,
} from './setup';
import { fixture, data, headers } from './advanced-fixtures';
import { GET } from '../app/api/v1/[...path]/route';
import { database } from '../src/database/client';
beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);
it('copies missing budgets without overwriting and calculates opt-in rollover from real spending', async () => {
  const { token, account, expense } = await fixture();
  await call(
    'POST',
    'budgets',
    { month: '2026-01', categoryId: expense.id, amountMinor: '1000' },
    token,
    headers(),
  );
  await call(
    'POST',
    'transactions',
    {
      type: 'EXPENSE',
      accountId: account.id,
      categoryId: expense.id,
      amountMinor: '400',
      date: '2026-01-31T12:00:00Z',
    },
    token,
    headers(),
  );
  const copy = await call(
    'POST',
    'budgets/copy',
    { fromMonth: '2026-01', toMonth: '2026-02' },
    token,
    headers(),
  );
  expect(data(copy)).toMatchObject({ created: 1, skipped: 0 });
  expect(
    data(
      await call(
        'POST',
        'budgets/copy',
        { fromMonth: '2026-01', toMonth: '2026-02' },
        token,
        headers(),
      ),
    ),
  ).toMatchObject({ created: 0, skipped: 1 });
  const feb = z
    .array(budgetStatusSchema)
    .parse(data(await call('GET', 'budgets?month=2026-02', undefined, token)))[0]!;
  expect(feb.rollover).toBe(false);
  expect(feb.effectiveLimitMinor).toBe('1000');
  await call(
    'PATCH',
    `budgets/${feb.id}`,
    {
      categoryId: expense.id,
      month: '2026-02',
      amountMinor: '1000',
      rollover: true,
      version: feb.version,
    },
    token,
    headers(),
  );
  const status = z
    .array(budgetStatusSchema)
    .parse(data(await call('GET', 'budgets?month=2026-02', undefined, token)))[0]!;
  expect(status).toMatchObject({
    carriedMinor: '600',
    effectiveLimitMinor: '1600',
    remainingMinor: '1600',
  });
  const other = await createUser('other@example.com');
  expect(
    data(
      await call(
        'POST',
        'budgets/copy',
        { fromMonth: '2026-01', toMonth: '2026-02' },
        other.accessToken,
        headers(),
      ),
    ),
  ).toMatchObject({ created: 0 });
  const raw = await GET(
    new Request('http://localhost:3000/api/v1/export/backup', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
  const backup = backupSchema.parse(await raw.json());
  expect(backup.version).toBe(3);
  expect(backup.budgets.find((b) => b.id === feb.id)?.rollover).toBe(true);
});
it('versions an independent total limit, copies it once and includes it in restore and deletion', async () => {
  const { token, account, expense } = await fixture();
  const plan = monthlyLimitSchema.parse(
    data(
      await call(
        'POST',
        'budgets/total',
        { month: '2026-01', amountMinor: '1000' },
        token,
        headers(),
      ),
    ),
  );
  expect(
    (
      await call(
        'POST',
        'budgets/total',
        { month: '2026-01', amountMinor: '2000' },
        token,
        headers(),
      )
    ).status,
  ).toBe(409);
  await call(
    'POST',
    'transactions',
    {
      type: 'EXPENSE',
      accountId: account.id,
      categoryId: expense.id,
      amountMinor: '850',
      date: '2026-01-01T12:00:00Z',
    },
    token,
    headers(),
  );
  const status = monthlyLimitStatusSchema.parse(
    data(await call('GET', 'budgets/total?month=2026-01', undefined, token)),
  );
  expect(status).toMatchObject({ spentMinor: '850', remainingMinor: '150', warningReached: true });
  expect(
    data(
      await call(
        'POST',
        'budgets/copy',
        { fromMonth: '2026-01', toMonth: '2026-02' },
        token,
        headers(),
      ),
    ),
  ).toMatchObject({ totalCopied: true });
  const raw = await GET(
    new Request('http://localhost:3000/api/v1/export/backup', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
  const backup = backupSchema.parse(await raw.json());
  expect(backup.monthlyLimits).toHaveLength(2);
  expect(backup.version).toBe(3);
  const other = await createUser('restore@example.com');
  const preview = z
    .object({ previewId: z.uuid(), contentHash: z.string(), canImport: z.literal(true) })
    .parse(data(await call('POST', 'import/preview', { backup }, other.accessToken, headers())));
  expect(
    (
      await call(
        'POST',
        'import/commit',
        {
          backup,
          previewId: preview.previewId,
          contentHash: preview.contentHash,
          mode: 'merge',
          confirmation: 'IMPORT',
        },
        other.accessToken,
        headers(),
      )
    ).status,
  ).toBe(200);
  expect(
    monthlyLimitStatusSchema.parse(
      data(await call('GET', 'budgets/total?month=2026-01', undefined, other.accessToken)),
    ).plan?.amountMinor,
  ).toBe('1000');
  expect(
    (
      await call(
        'DELETE',
        'budgets/total',
        { month: '2026-01', version: plan.version, confirmation: 'DELETE' },
        token,
        headers(),
      )
    ).status,
  ).toBe(200);
  const { db } = await database();
  const user = await db.collection('users').findOne({ email: 'one@example.com' });
  await call('DELETE', 'auth/account', { password, confirmation: 'DELETE' }, token);
  expect(await db.collection('monthly_budget_limits').countDocuments({ userId: user?.id })).toBe(0);
});
