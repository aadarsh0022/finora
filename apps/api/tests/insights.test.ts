import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { spendingInsightsSchema } from '@finora/contracts';
import { setupDatabase, clearDatabase, teardownDatabase, call, createUser } from './setup';
import { fixture, data, headers } from './advanced-fixtures';
beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);
it('uses owned calendar-day spending and excludes borrowing from insights', async () => {
  const { token, account, expense } = await fixture();
  for (const [date, amountMinor] of [
    ['2025-12-31T20:00:00Z', '100'],
    ['2025-12-30T20:00:00Z', '50'],
    ['2026-01-31T20:00:00Z', '9999'],
  ])
    await call(
      'POST',
      'transactions',
      { type: 'EXPENSE', accountId: account.id, categoryId: expense.id, amountMinor, date },
      token,
      headers(),
    );
  await call(
    'POST',
    'debts',
    {
      name: 'Test lender',
      direction: 'BORROWED',
      amountMinor: '999999',
      date: '2026-01-01',
      accountId: account.id,
    },
    token,
    headers(),
  );
  const result = spendingInsightsSchema.parse(
    data(await call('GET', 'reports/insights?month=2026-01', undefined, token)),
  );
  expect(result).toMatchObject({
    spentMinor: '100',
    previousSpentMinor: '50',
    changeMinor: '50',
    changeBasisPoints: '10000',
    dailyAverageMinor: '3',
    days: 31,
  });
  expect(result.categoryChanges[0]).toMatchObject({
    categoryId: expense.id,
    name: 'Food',
    changeMinor: '50',
  });
  const other = await createUser('other@example.com');
  expect(
    spendingInsightsSchema.parse(
      data(await call('GET', 'reports/insights?month=2026-01', undefined, other.accessToken)),
    ).spentMinor,
  ).toBe('0');
  expect((await call('GET', 'reports/insights')).status).toBe(401);
  expect((await call('GET', 'reports/insights?month=2099-01', undefined, token)).status).toBe(400);
  expect((await call('GET', 'reports/insights?month=2026-13', undefined, token)).status).toBe(400);
});
