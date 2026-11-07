import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  assistantChangeSchema,
  assistantRecordsResultSchema,
  emiOverviewSchema,
  settingsSchema,
} from '@finora/contracts';
import { getCurrentMonthKey } from '@finora/finance-core';
import { call, clearDatabase, setupDatabase, teardownDatabase } from './setup';
import { data, fixture, headers } from './advanced-fixtures';

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
const read = async (
  token: string,
  feature: string,
  record: string | null = null,
  query: string | null = null,
) =>
  assistantRecordsResultSchema.parse(
    data(
      await call(
        'POST',
        'assistant/tools/run',
        {
          name: 'read_records',
          arguments: { feature, record, query, month: null, from: null, to: null, type: null },
        },
        token,
      ),
    ),
  ).data;
const overview = async (token: string) =>
  emiOverviewSchema.parse(data(await call('GET', 'emi', undefined, token)));

const month = getCurrentMonthKey('Asia/Kolkata');

it('adds a loan, pays a month with a linked expense, then reverses it, all through confirmed changes', async () => {
  const { token, account, expense } = await fixture();
  const added = await prepare(token, 'create_emi_loan', [
    { field: 'name', value: 'Car loan' },
    { field: 'monthlyAmount', value: '5000' },
    { field: 'startMonth', value: month },
    { field: 'endMonth', value: '2099-12' },
  ]);
  expect(added.questions).toEqual([]);
  expect((await confirm(token, added)).status).toBe(200);
  const loan = (await overview(token)).loans[0]!;
  expect(loan).toMatchObject({ name: 'Car loan', monthlyAmountMinor: '500000' });

  // Not kept separate (default): the review asks which account and category.
  const ask = await prepare(token, 'pay_emi', [{ field: 'month', value: month }], null, 'Car loan');
  expect(ask.token).toBeNull();
  expect(ask.questions.map((q) => q.key).sort()).toEqual(['account', 'category']);

  const pay = await prepare(
    token,
    'pay_emi',
    [
      { field: 'month', value: month },
      { field: 'account', value: account.name },
      { field: 'category', value: expense.name },
    ],
    null,
    'Car loan',
  );
  expect(pay.questions).toEqual([]);
  expect(pay.rows.find((r) => r.label === 'Amount')?.value).toBe('Full EMI');
  expect((await confirm(token, pay)).status).toBe(200);
  const afterPay = await overview(token);
  expect(afterPay.payments).toHaveLength(1);
  expect(afterPay.payments[0]).toMatchObject({ amountPaidMinor: '500000', paid: true });
  expect(afterPay.payments[0]!.transactionId).not.toBeNull();

  const undo = await prepare(
    token,
    'unpay_emi',
    [{ field: 'month', value: month }],
    null,
    'Car loan',
  );
  expect((await confirm(token, undo)).status).toBe(200);
  expect((await overview(token)).payments).toHaveLength(0);
});

it('skips the account question when debt is kept separate and reads the tracker back', async () => {
  const { token } = await fixture();
  const settings = settingsSchema.parse(data(await call('GET', 'settings', undefined, token)));
  expect(
    (
      await call(
        'PATCH',
        'settings',
        {
          preferences: { ...settings.preferences, keepDebtSeparate: true },
          version: settings.version,
        },
        token,
        headers(),
      )
    ).status,
  ).toBe(200);
  const added = await prepare(token, 'create_emi_loan', [
    { field: 'name', value: 'Phone' },
    { field: 'monthlyAmount', value: '1000' },
    { field: 'startMonth', value: month },
    { field: 'endMonth', value: '2099-12' },
    { field: 'interestRatePct', value: '12' },
  ]);
  expect((await confirm(token, added)).status).toBe(200);
  const pay = await prepare(token, 'pay_emi', [{ field: 'month', value: month }], null, 'Phone');
  expect(pay.questions).toEqual([]);
  expect((await confirm(token, pay)).status).toBe(200);
  expect((await overview(token)).payments[0]!.transactionId).toBeNull();

  const prepay = await prepare(
    token,
    'add_emi_prepayment',
    [{ field: 'amount', value: '2000' }],
    null,
    'Phone',
  );
  expect((await confirm(token, prepay)).status).toBe(200);
  expect((await overview(token)).extraPayments).toHaveLength(1);

  expect((await read(token, 'emi_summary')).items.length).toBeGreaterThan(1);
  expect((await read(token, 'emi_loans')).total).toBe(1);
  expect((await read(token, 'emi_history', 'Phone')).total).toBeGreaterThan(0);
  expect((await read(token, 'emi_payoff', null, 'avalanche')).items[0]!.detail).toContain('12%');
  expect((await read(token, 'emi_schedule', 'Phone')).total).toBeGreaterThan(0);
  expect((await read(token, 'emi_forecast')).total).toBe(12);
  expect((await read(token, 'emi_prepayments')).total).toBe(1);
  expect((await read(token, 'emi_upcoming')).summary).toContain('unpaid');
});
