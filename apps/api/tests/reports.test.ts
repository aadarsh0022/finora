import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  accountSchema,
  reportSummarySchema,
  transactionSchema,
  reportRangeSchema,
} from '@finora/contracts';
import { call, clearDatabase, createUser, setupDatabase, teardownDatabase } from './setup';
import { data, fixture, headers } from './advanced-fixtures';
import { reportPeriod } from '../src/modules/reports/service';
import { authenticate } from '../src/modules/auth/service';

beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);
it('reports exact custom-day cashflow, category shares, transfer-aware balances and zero monthly buckets', async () => {
  const { token, account, expense, income } = await fixture();
  const savings = accountSchema.parse(
    data(
      await call(
        'POST',
        'accounts',
        { name: 'Savings', type: 'SAVINGS', openingBalanceMinor: '100' },
        token,
        headers(),
      ),
    ),
  );
  const amount = '90071992547409931234567890';
  const transactions = [
    { type: 'INCOME', categoryId: income.id, amountMinor: '1000', date: '2025-12-31T18:00:00Z' },
    { type: 'INCOME', categoryId: income.id, amountMinor: amount, date: '2025-12-31T18:30:00Z' },
    { type: 'EXPENSE', categoryId: expense.id, amountMinor: '250', date: '2026-01-02T12:00:00Z' },
    {
      type: 'TRANSFER',
      destinationAccountId: savings.id,
      amountMinor: '50',
      date: '2026-01-03T12:00:00Z',
    },
    { type: 'EXPENSE', categoryId: expense.id, amountMinor: '999', date: '2026-03-31T18:30:00Z' },
  ];
  for (const entry of transactions)
    expect(
      (await call('POST', 'transactions', { accountId: account.id, ...entry }, token, headers()))
        .status,
    ).toBe(201);
  const report = reportSummarySchema.parse(
    data(
      await call(
        'GET',
        'reports/summary?range=custom&from=2026-01-01&to=2026-03-31',
        undefined,
        token,
      ),
    ),
  );
  expect(report.period).toMatchObject({
    from: '2026-01-01',
    to: '2026-03-31',
    timezone: 'Asia/Kolkata',
    currency: 'INR',
  });
  expect(report.cashflow).toMatchObject({
    incomeMinor: amount,
    expensesMinor: '250',
    netMinor: (BigInt(amount) - 250n).toString(),
  });
  expect(report.categories.find((row) => row.type === 'EXPENSE')).toMatchObject({
    name: 'Food',
    amountMinor: '250',
    shareBasisPoints: 10000,
  });
  expect(report.categories.find((row) => row.type === 'INCOME')).toMatchObject({
    name: 'Refund',
    amountMinor: amount,
    shareBasisPoints: 10000,
  });
  expect(report.trends).toEqual([
    {
      month: '2026-01',
      incomeMinor: amount,
      expensesMinor: '250',
      netMinor: (BigInt(amount) - 250n).toString(),
    },
    { month: '2026-02', incomeMinor: '0', expensesMinor: '0', netMinor: '0' },
    { month: '2026-03', incomeMinor: '0', expensesMinor: '0', netMinor: '0' },
  ]);
  const cash = report.accounts.find((row) => row.accountId === account.id)!;
  expect(cash).toMatchObject({
    openingBalanceMinor: '1000',
    closingBalanceMinor: (BigInt(amount) + 700n).toString(),
    transferInMinor: '0',
    transferOutMinor: '50',
  });
  const saved = report.accounts.find((row) => row.accountId === savings.id)!;
  expect(saved).toMatchObject({
    openingBalanceMinor: '100',
    closingBalanceMinor: '150',
    transferInMinor: '50',
    transferOutMinor: '0',
  });
  expect(report.accounts.reduce((sum, row) => sum + BigInt(row.netMinor), 0n).toString()).toBe(
    report.cashflow.netMinor,
  );
  for (const resource of ['cashflow', 'categories', 'accounts', 'trends'] as const) {
    const specific = data(
      await call<{ [key: string]: unknown }>(
        'GET',
        `reports/${resource}?range=custom&from=2026-01-01&to=2026-03-31`,
        undefined,
        token,
      ),
    );
    expect(specific[resource]).toEqual(report[resource]);
  }
});
it('calculates preset periods from local month boundaries, including leap years and year rollover', async () => {
  const user = await createUser();
  const context = await authenticate(
    new Request('http://localhost/api/v1/reports/summary', {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    }),
  );
  const now = new Date('2024-02-29T20:00:00Z'); // March 1 in Kolkata.
  expect(reportPeriod(context, reportRangeSchema.parse({}), now)).toMatchObject({
    from: '2024-03-01',
    to: '2024-03-31',
  });
  expect(
    reportPeriod(context, reportRangeSchema.parse({ range: 'previous-month' }), now),
  ).toMatchObject({ from: '2024-02-01', to: '2024-02-29' });
  expect(
    reportPeriod(context, reportRangeSchema.parse({ range: 'last-3-months' }), now),
  ).toMatchObject({ from: '2024-01-01', to: '2024-03-31' });
  expect(
    reportPeriod(context, reportRangeSchema.parse({ range: 'last-6-months' }), now),
  ).toMatchObject({ from: '2023-10-01', to: '2024-03-31' });
});
it('handles DST days and reflects transaction edits and deletion without counting transfers as income', async () => {
  const user = await createUser();
  const token = user.accessToken;
  expect(
    (
      await call(
        'PATCH',
        'settings',
        { version: 1, preferences: { ...user.user.preferences, timezone: 'America/New_York' } },
        token,
        headers(),
      )
    ).status,
  ).toBe(200);
  const account = accountSchema.parse(
    data(await call('POST', 'accounts', { name: 'Cash', type: 'CASH' }, token, headers())),
  );
  const category = data(
    await call<{ id: string }>(
      'POST',
      'categories',
      { name: 'Food', type: 'EXPENSE' },
      token,
      headers(),
    ),
  );
  const entry = {
    accountId: account.id,
    categoryId: category.id,
    amountMinor: '10',
    type: 'EXPENSE',
    date: '2026-03-08T05:00:00Z',
  };
  const transaction = transactionSchema.parse(
    data(await call('POST', 'transactions', entry, token, headers())),
  );
  for (const date of ['2026-03-08T04:59:59Z', '2026-03-09T04:00:00Z'])
    expect(
      (await call('POST', 'transactions', { ...entry, date, amountMinor: '999' }, token, headers()))
        .status,
    ).toBe(201);
  const path = 'reports/summary?range=custom&from=2026-03-08&to=2026-03-08';
  let report = reportSummarySchema.parse(data(await call('GET', path, undefined, token)));
  expect(report.cashflow).toMatchObject({
    incomeMinor: '0',
    expensesMinor: '10',
    savingsRateBasisPoints: null,
  });
  expect(
    (
      await call(
        'PATCH',
        `transactions/${transaction.id}`,
        { ...entry, amountMinor: '25', version: 1 },
        token,
        headers(),
      )
    ).status,
  ).toBe(200);
  report = reportSummarySchema.parse(data(await call('GET', path, undefined, token)));
  expect(report.cashflow.expensesMinor).toBe('25');
  expect(
    (
      await call(
        'DELETE',
        `transactions/${transaction.id}`,
        { version: 2, confirmation: 'DELETE' },
        token,
        headers(),
      )
    ).status,
  ).toBe(200);
  report = reportSummarySchema.parse(data(await call('GET', path, undefined, token)));
  expect(report.cashflow.expensesMinor).toBe('0');
});
it('returns isolated empty reports, validates range limits, and requires a verified session', async () => {
  const { token } = await fixture();
  const other = await createUser('other@example.com');
  const empty = reportSummarySchema.parse(
    data(await call('GET', 'reports/summary?range=last-6-months', undefined, other.accessToken)),
  );
  expect(empty.accounts).toHaveLength(0);
  expect(empty.categories).toHaveLength(0);
  expect(empty.trends).toHaveLength(6);
  expect(empty.cashflow).toMatchObject({
    incomeMinor: '0',
    expensesMinor: '0',
    netMinor: '0',
    savingsRateBasisPoints: null,
  });
  for (const query of [
    'range=custom',
    'range=custom&from=2026-02-30&to=2026-03-01',
    'range=custom&from=2026-03-01&to=2026-02-01',
    'range=custom&from=2000-01-01&to=2010-01-01',
    'from=2026-01-01',
    'range=other',
    'userId=anything',
  ])
    expect((await call('GET', `reports/summary?${query}`, undefined, token)).status).toBe(400);
  expect((await call('GET', 'reports/summary')).status).toBe(401);
  expect((await call('POST', 'reports/summary', {}, token, headers())).status).toBe(405);
  const extreme = reportSummarySchema.parse(
    data(
      await call(
        'GET',
        'reports/summary?range=custom&from=9999-12-01&to=9999-12-31',
        undefined,
        token,
      ),
    ),
  );
  expect(extreme.trends).toEqual([
    { month: '9999-12', incomeMinor: '0', expensesMinor: '0', netMinor: '0' },
  ]);
});
