import { z } from 'zod';
import { budgetSchema, budgetStatusSchema } from '@finora/contracts';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { call, clearDatabase, createUser, setupDatabase, teardownDatabase } from './setup';
import { data, headers, fixture } from './advanced-fixtures';
beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);

it('computes monthly category budget status with exact amounts, local boundary and configurable warnings', async () => {
  const { token, account, expense, income } = await fixture();
  const input = {
    categoryId: expense.id,
    month: '2026-10',
    amountMinor: '100000000000000000000000000000',
    warningThresholdBasisPoints: 7500,
  };
  const budget = budgetSchema.parse(data(await call('POST', 'budgets', input, token, headers())));
  expect(budget.rollover).toBe(false);
  for (const entry of [
    {
      type: 'EXPENSE',
      categoryId: expense.id,
      date: '2026-09-30T20:00:00Z',
      amountMinor: '75000000000000000000000000000',
    },
    { type: 'EXPENSE', categoryId: expense.id, date: '2026-10-31T20:00:00Z', amountMinor: '5000' },
    { type: 'INCOME', categoryId: income.id, date: '2026-10-01T12:00:00Z', amountMinor: '1000' },
  ])
    expect(
      (await call('POST', 'transactions', { ...entry, accountId: account.id }, token, headers()))
        .status,
    ).toBe(201);
  const status = z
    .array(budgetStatusSchema)
    .parse(data(await call('GET', 'budgets?month=2026-10', undefined, token)))[0]!;
  expect(status.spentMinor).toBe('75000000000000000000000000000');
  expect(status.remainingMinor).toBe('25000000000000000000000000000');
  expect(status.warningReached).toBe(true);
  expect(status.overBudget).toBe(false);
  expect((await call('POST', 'budgets', input, token, headers())).status).toBe(409);
  expect(
    (await call('POST', 'budgets', { ...input, rollover: 'yes' }, token, headers())).status,
  ).toBe(400);
  expect(
    (await call('PATCH', `budgets/${budget.id}`, { ...input, version: 9 }, token, headers()))
      .status,
  ).toBe(409);
  const updated = budgetSchema.parse(
    data(
      await call(
        'PATCH',
        `budgets/${budget.id}`,
        { ...input, amountMinor: '1', version: 1 },
        token,
        headers(),
      ),
    ),
  );
  expect(updated.version).toBe(2);
  expect(
    (await call('DELETE', `budgets/${budget.id}`, { version: 2 }, token, headers())).status,
  ).toBe(400);
  expect(
    (
      await call(
        'DELETE',
        `budgets/${budget.id}`,
        { version: 2, confirmation: 'DELETE' },
        token,
        headers(),
      )
    ).status,
  ).toBe(200);
});

it('rejects foreign budget references and requires authentication', async () => {
  const { token, expense } = await fixture();
  const other = await createUser('other@example.com');
  expect(
    (
      await call(
        'POST',
        'budgets',
        { categoryId: expense.id, month: '2026-10', amountMinor: '1' },
        other.accessToken,
        headers(),
      )
    ).status,
  ).toBe(400);
  expect((await call('GET', 'budgets')).status).toBe(401);
  expect((await call('GET', 'budgets?month=2026-13', undefined, token)).status).toBe(400);
});
