import { createHash } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { assistantToolResultSchema, accountSchema, debtSchema } from '@finora/contracts';
import { call, clearDatabase, createUser, setupDatabase, teardownDatabase } from './setup';
import { data, fixture, headers } from './advanced-fixtures';
import { database } from '../src/database/client';

beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);

async function run(token: string, name: string, args: unknown) {
  return assistantToolResultSchema.parse(
    data(await call('POST', 'assistant/tools/run', { name, arguments: args }, token)),
  );
}
async function financeDigest() {
  const { db } = await database();
  const rows = [];
  for (const name of [
    'accounts',
    'categories',
    'transactions',
    'debts',
    'debt_events',
    'budgets',
    'monthly_budget_limits',
    'savings_goals',
    'savings_contributions',
    'recurring_rules',
    'recurring_occurrences',
  ])
    rows.push([name, await db.collection(name).find({}).sort({ _id: 1 }).toArray()]);
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex');
}

it('requires authentication and rejects identity overrides, mutations and arbitrary queries', async () => {
  expect((await call('GET', 'assistant/tools')).status).toBe(401);
  expect(
    (
      await call('POST', 'assistant/tools/run', {
        name: 'get_balance',
        arguments: { accountId: null },
      })
    ).status,
  ).toBe(401);
  const { accessToken: token } = await createUser();
  for (const body of [
    { name: 'delete_transaction', arguments: {} },
    { name: 'get_balance', arguments: { accountId: null, userId: 'someone-else' } },
    { name: 'get_balance', arguments: { accountId: null }, userId: 'someone-else' },
    { name: 'get_debt_summary', arguments: { $where: 'anything' } },
  ])
    expect((await call('POST', 'assistant/tools/run', body, token)).status).toBe(400);
  expect((await call('PATCH', 'assistant/tools', {}, token)).status).toBe(405);
});

it('returns exact owned balances including archived accounts and refuses another owner account', async () => {
  const { token, account, income } = await fixture();
  const large = '90071992547409931234567890';
  expect(
    (
      await call(
        'POST',
        'transactions',
        {
          type: 'INCOME',
          accountId: account.id,
          categoryId: income.id,
          amountMinor: large,
          date: '2026-01-01T00:00:00Z',
          note: 'private fixture',
          merchant: 'private fixture',
        },
        token,
        headers(),
      )
    ).status,
  ).toBe(201);
  expect(
    (await call('DELETE', `accounts/${account.id}`, { version: account.version }, token, headers()))
      .status,
  ).toBe(200);
  const other = await createUser('other@example.com');
  const foreign = accountSchema.parse(
    data(
      await call(
        'POST',
        'accounts',
        { name: 'Private', type: 'CASH', openingBalanceMinor: '1234' },
        other.accessToken,
        headers(),
      ),
    ),
  );
  const before = await financeDigest();
  const result = await run(token, 'get_balance', { accountId: null });
  expect(result).toMatchObject({
    source: 'server-recorded',
    readOnly: true,
    includesLocalPending: false,
    currency: 'INR',
    data: {
      totalBalanceMinor: large,
      includesArchived: true,
      accounts: [{ id: account.id, archived: true, balanceMinor: large }],
    },
  });
  expect(JSON.stringify(result)).not.toContain('private fixture');
  expect(JSON.stringify(result)).not.toContain('userId');
  expect(
    (
      await call(
        'POST',
        'assistant/tools/run',
        { name: 'get_balance', arguments: { accountId: foreign.id } },
        token,
      )
    ).status,
  ).toBe(404);
  expect(await financeDigest()).toBe(before);
  await call('POST', 'auth/logout', {}, token);
  expect((await call('GET', 'assistant/tools', undefined, token)).status).toBe(401);
});

it('uses local calendar boundaries, excludes transfers and retains exact cashflow and category totals', async () => {
  const { token, account, expense, income } = await fixture();
  const savings = accountSchema.parse(
    data(await call('POST', 'accounts', { name: 'Savings', type: 'SAVINGS' }, token, headers())),
  );
  const large = '90071992547409931234567890';
  for (const entry of [
    { type: 'INCOME', categoryId: income.id, amountMinor: '100', date: '2025-12-31T18:29:59Z' },
    { type: 'INCOME', categoryId: income.id, amountMinor: large, date: '2025-12-31T18:30:00Z' },
    { type: 'EXPENSE', categoryId: expense.id, amountMinor: '250', date: '2026-01-02T00:00:00Z' },
    {
      type: 'TRANSFER',
      destinationAccountId: savings.id,
      amountMinor: '50',
      date: '2026-01-03T00:00:00Z',
    },
  ])
    expect(
      (await call('POST', 'transactions', { accountId: account.id, ...entry }, token, headers()))
        .status,
    ).toBe(201);
  const args = { from: '2026-01-01', to: '2026-01-31' };
  const before = await financeDigest();
  expect(await run(token, 'get_cashflow', args)).toMatchObject({
    timezone: 'Asia/Kolkata',
    data: {
      ...args,
      incomeMinor: large,
      expensesMinor: '250',
      netMinor: (BigInt(large) - 250n).toString(),
    },
  });
  expect(await run(token, 'get_category_spending', args)).toMatchObject({
    data: {
      totalExpensesMinor: '250',
      categories: [{ categoryId: expense.id, amountMinor: '250', shareBasisPoints: 10000 }],
    },
  });
  expect(await financeDigest()).toBe(before);
  for (const dates of [
    { from: '2026-02-30', to: '2026-03-01' },
    { from: '2026-02-02', to: '2026-02-01' },
    { from: '2025-01-01', to: '2026-01-02' },
  ])
    expect(
      (await call('POST', 'assistant/tools/run', { name: 'get_cashflow', arguments: dates }, token))
        .status,
    ).toBe(400);
});

it('keeps total and category budget limits independent and represents an absent limit as null', async () => {
  const { token, account, expense } = await fixture();
  expect(
    (
      await call(
        'POST',
        'budgets',
        { categoryId: expense.id, month: '2026-01', amountMinor: '10000' },
        token,
        headers(),
      )
    ).status,
  ).toBe(201);
  expect(
    (
      await call(
        'POST',
        'transactions',
        {
          type: 'EXPENSE',
          accountId: account.id,
          categoryId: expense.id,
          amountMinor: '2500',
          date: '2026-01-01T00:00:00Z',
        },
        token,
        headers(),
      )
    ).status,
  ).toBe(201);
  expect(
    (
      await call(
        'POST',
        'budgets/total',
        { month: '2026-01', amountMinor: '8000' },
        token,
        headers(),
      )
    ).status,
  ).toBe(201);
  const before = await financeDigest();
  expect(await run(token, 'get_budget_status', { month: '2026-01' })).toMatchObject({
    data: {
      total: { limitMinor: '8000', spentMinor: '2500', remainingMinor: '5500' },
      categories: [
        {
          categoryId: expense.id,
          effectiveLimitMinor: '10000',
          spentMinor: '2500',
          remainingMinor: '7500',
        },
      ],
    },
  });
  expect(await run(token, 'get_budget_status', { month: '2026-02' })).toMatchObject({
    data: { total: { limitMinor: null, spentMinor: '0', remainingMinor: null }, categories: [] },
  });
  expect(await financeDigest()).toBe(before);
});

it('separates borrowing, personal lending and expected receipts without exposing debt notes or names', async () => {
  const { token } = await fixture();
  for (const input of [
    { direction: 'BORROWED', kind: 'PERSONAL_LOAN', amountMinor: '3000' },
    { direction: 'LENT', kind: 'PERSONAL_LOAN', amountMinor: '2000' },
    { direction: 'LENT', kind: 'REFUND', amountMinor: '800' },
  ])
    expect(
      (
        await call(
          'POST',
          'debts',
          {
            name: 'Private person',
            note: 'Private note',
            date: '2026-01-01',
            dueDate: '2026-01-02',
            ...input,
          },
          token,
          headers(),
        )
      ).status,
    ).toBe(201);
  const archived = debtSchema.parse(
    data(
      await call(
        'POST',
        'debts',
        { name: 'Archived', direction: 'BORROWED', amountMinor: '1000', date: '2026-01-01' },
        token,
        headers(),
      ),
    ),
  );
  expect(
    (
      await call(
        'PATCH',
        `debts/${archived.id}`,
        { name: archived.name, note: '', archived: true, version: archived.version },
        token,
        headers(),
      )
    ).status,
  ).toBe(200);
  const before = await financeDigest();
  const result = await run(token, 'get_debt_summary', {});
  expect(result).toMatchObject({
    data: {
      owedByYouMinor: '3000',
      personalLoansOwedToYouMinor: '2000',
      expectedReceiptsMinor: '800',
      overdueOwedByYouMinor: '3000',
      overduePersonalLoansOwedToYouMinor: '2000',
      overdueExpectedReceiptsMinor: '800',
      openRecordCount: 3,
      excludesArchivedAndCancelled: true,
    },
  });
  expect(JSON.stringify(result)).not.toContain('Private');
  expect(await financeDigest()).toBe(before);
});

it('publishes strict allowlisted definitions and limits calls independently per signed-in user', async () => {
  const first = await createUser();
  const second = await createUser('second@example.com');
  for (let i = 0; i < 30; i++) {
    const result = await call<{
      tools: { name: string; strict: boolean; parameters: { additionalProperties: boolean } }[];
    }>('GET', 'assistant/tools', undefined, first.accessToken);
    expect(result.status).toBe(200);
    for (const tool of data(result).tools) {
      expect(tool.strict).toBe(true);
      expect(tool.parameters.additionalProperties).toBe(false);
    }
    expect(data(result).tools).toHaveLength(5);
    expect(result.headers.get('cache-control')).toBe('no-store');
  }
  expect((await call('GET', 'assistant/tools', undefined, first.accessToken)).status).toBe(429);
  expect((await call('GET', 'assistant/tools', undefined, second.accessToken)).status).toBe(200);
});
