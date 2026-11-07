import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import {
  accountWithBalanceSchema,
  emiExtraPaymentSchema,
  emiIncomePeriodSchema,
  emiLoanSchema,
  emiOverviewSchema,
  emiPaymentSchema,
  settingsSchema,
} from '@finora/contracts';
import { getRemainingPayable, getCurrentMonthKey } from '@finora/finance-core';
import { call, clearDatabase, createUser, setupDatabase, teardownDatabase } from './setup';
import { data, fixture, headers } from './advanced-fixtures';
import { database } from '../src/database/client';

beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);

const loanBody = {
  name: 'Home loan',
  monthlyAmountMinor: '2500000',
  startMonth: '2026-01',
  endMonth: '2026-06',
  dueDay: 5,
  loanTag: 'large',
  interestRatePct: 8.5,
  principalRemainingMinor: '9000000',
};

async function addLoan(token: string, overrides: Record<string, unknown> = {}) {
  return emiLoanSchema.parse(
    data(await call('POST', 'emi/loans', { ...loanBody, ...overrides }, token, headers())),
  );
}
async function overview(token: string) {
  return emiOverviewSchema.parse(data(await call('GET', 'emi', undefined, token)));
}
async function balance(token: string, accountId: string) {
  return accountWithBalanceSchema.parse(
    data(await call('GET', `accounts/${accountId}`, undefined, token)),
  ).balanceMinor;
}
async function keepSeparate(token: string, value: boolean) {
  const settings = settingsSchema.parse(data(await call('GET', 'settings', undefined, token)));
  const response = await call(
    'PATCH',
    'settings',
    {
      preferences: { ...settings.preferences, keepDebtSeparate: value },
      version: settings.version,
    },
    token,
    headers(),
  );
  expect(response.status).toBe(200);
}

it('stores loans, dates the principal and rejects bad month ranges', async () => {
  const { token } = await fixture();
  const loan = await addLoan(token);
  expect(loan).toMatchObject({ isActive: true, version: 1, principalRemainingMinor: '9000000' });
  expect(loan.principalAsOf).not.toBeNull();
  expect(
    (await call('POST', 'emi/loans', { ...loanBody, endMonth: '2025-12' }, token, headers()))
      .status,
  ).toBe(400);
  expect(
    (await call('POST', 'emi/loans', { ...loanBody, startMonth: '2026-13' }, token, headers()))
      .status,
  ).toBe(400);
  const ongoing = await addLoan(token, {
    name: 'Card',
    endMonth: null,
    principalRemainingMinor: null,
  });
  expect(ongoing).toMatchObject({ endMonth: null, principalAsOf: null });
});

it('keeps the principal date when another field changes and moves it when the figure changes', async () => {
  const { token } = await fixture();
  const loan = await addLoan(token);
  const { db } = await database();
  await db
    .collection('emi_loans')
    .updateOne({ id: loan.id, userId: loan.userId }, { $set: { principalAsOf: '2026-01-01' } });
  const renamed = emiLoanSchema.parse(
    data(
      await call(
        'PATCH',
        `emi/loans/${loan.id}`,
        { ...loanBody, name: 'Renamed', isActive: true, version: 1 },
        token,
        headers(),
      ),
    ),
  );
  expect(renamed).toMatchObject({ name: 'Renamed', version: 2, principalAsOf: '2026-01-01' });
  const refreshed = emiLoanSchema.parse(
    data(
      await call(
        'PATCH',
        `emi/loans/${loan.id}`,
        { ...loanBody, principalRemainingMinor: '8000000', isActive: true, version: 2 },
        token,
        headers(),
      ),
    ),
  );
  expect(refreshed.principalAsOf).not.toBe('2026-01-01');
  expect(
    (
      await call(
        'PATCH',
        `emi/loans/${loan.id}`,
        { ...loanBody, isActive: true, version: 1 },
        token,
        headers(),
      )
    ).status,
  ).toBe(409);
});

it('records an EMI as a normal expense from the chosen account when debt is not kept separate', async () => {
  const { token, account, expense } = await fixture();
  const loan = await addLoan(token);
  const path = `emi/loans/${loan.id}/payments/2026-02`;
  // The account and category are required, because the payment also reduces a balance.
  expect((await call('POST', path, { amountMinor: null }, token, headers())).status).toBe(400);
  const payment = emiPaymentSchema.parse(
    data(
      await call(
        'POST',
        path,
        { amountMinor: null, accountId: account.id, categoryId: expense.id },
        token,
        headers(),
      ),
    ),
  );
  expect(payment).toMatchObject({
    amountDueMinor: '2500000',
    amountPaidMinor: '2500000',
    paid: true,
    version: 1,
  });
  expect(payment.transactionId).not.toBeNull();
  expect(await balance(token, account.id)).toBe('-2500000');
  const { db } = await database();
  expect(await db.collection('transactions').countDocuments({ userId: loan.userId })).toBe(1);
  // Marking it unpaid removes the linked expense, so nothing is counted twice.
  expect((await call('DELETE', path, { version: 1 }, token, headers())).status).toBe(200);
  expect(await balance(token, account.id)).toBe('0');
  expect(await db.collection('transactions').countDocuments({ userId: loan.userId })).toBe(0);
  expect((await overview(token)).payments).toEqual([]);
});

it('changing a logged amount updates the same expense instead of adding another', async () => {
  const { token, account, expense } = await fixture();
  const loan = await addLoan(token);
  const path = `emi/loans/${loan.id}/payments/2026-03`;
  const link = { accountId: account.id, categoryId: expense.id };
  const first = emiPaymentSchema.parse(
    data(await call('POST', path, { amountMinor: '1000000', ...link }, token, headers())),
  );
  const second = emiPaymentSchema.parse(
    data(await call('POST', path, { amountMinor: '2500000', ...link }, token, headers())),
  );
  expect(second).toMatchObject({ id: first.id, transactionId: first.transactionId, version: 2 });
  expect(second.amountDueMinor).toBe('2500000');
  expect(await balance(token, account.id)).toBe('-2500000');
  const { db } = await database();
  expect(await db.collection('transactions').countDocuments({ userId: loan.userId })).toBe(1);
});

it('keeps the EMI only in the tracker when debt is kept separate', async () => {
  const { token, account, expense } = await fixture();
  await keepSeparate(token, true);
  const loan = await addLoan(token);
  const payment = emiPaymentSchema.parse(
    data(
      await call(
        'POST',
        `emi/loans/${loan.id}/payments/2026-02`,
        { amountMinor: '1200000', accountId: account.id, categoryId: expense.id },
        token,
        headers(),
      ),
    ),
  );
  expect(payment).toMatchObject({ amountPaidMinor: '1200000', transactionId: null });
  expect(await balance(token, account.id)).toBe('0');
  const { db } = await database();
  expect(await db.collection('transactions').countDocuments({ userId: loan.userId })).toBe(0);
});

it('rejects payments outside the loan dates and accounts that are not the user’s', async () => {
  const { token, account, expense } = await fixture();
  const other = await fixture2();
  const loan = await addLoan(token);
  const link = { accountId: account.id, categoryId: expense.id };
  expect(
    (await call('POST', `emi/loans/${loan.id}/payments/2025-12`, link, token, headers())).status,
  ).toBe(400);
  expect(
    (await call('POST', `emi/loans/${loan.id}/payments/2026-07`, link, token, headers())).status,
  ).toBe(400);
  expect(
    (
      await call(
        'POST',
        `emi/loans/${loan.id}/payments/2026-02`,
        { accountId: other.account.id, categoryId: expense.id },
        token,
        headers(),
      )
    ).status,
  ).toBe(400);
});

async function fixture2() {
  const user = await createUser('two@example.com');
  const token = user.accessToken;
  const response = await call(
    'POST',
    'accounts',
    { name: 'Other', type: 'CASH' },
    token,
    headers(),
  );
  return { token, account: data(response) as { id: string } };
}

it('nets prepayments off the remaining total and removes their expense when deleted', async () => {
  const { token, account, expense } = await fixture();
  const loan = await addLoan(token);
  const extra = emiExtraPaymentSchema.parse(
    data(
      await call(
        'POST',
        `emi/loans/${loan.id}/extra-payments`,
        {
          amountMinor: '5000000',
          date: '2026-02-10',
          note: 'Bonus',
          accountId: account.id,
          categoryId: expense.id,
        },
        token,
        headers(),
      ),
    ),
  );
  expect(await balance(token, account.id)).toBe('-5000000');
  const state = await overview(token);
  const remaining = getRemainingPayable(
    {
      id: loan.id,
      name: loan.name,
      monthlyAmount: BigInt(loan.monthlyAmountMinor),
      startMonth: loan.startMonth,
      endMonth: loan.endMonth,
      dueDay: loan.dueDay,
      isActive: loan.isActive,
      loanTag: loan.loanTag,
      interestRatePct: loan.interestRatePct,
      principalRemaining: null,
      principalAsOf: null,
    },
    [],
    state.extraPayments.map((p) => ({
      id: p.id,
      debtId: p.loanId,
      amount: BigInt(p.amountMinor),
      dateIso: p.date,
      note: p.note,
    })),
    getCurrentMonthKey('Asia/Kolkata'),
  );
  // Six EMIs of 25,000.00 less a 50,000.00 prepayment.
  expect(remaining).toBe(6n * 2500000n - 5000000n);
  expect(
    (
      await call(
        'POST',
        `emi/loans/${loan.id}/extra-payments`,
        { amountMinor: '100', date: '2999-01-01', accountId: account.id, categoryId: expense.id },
        token,
        headers(),
      )
    ).status,
  ).toBe(400);
  expect(
    (await call('DELETE', `emi/extra-payments/${extra.id}`, { version: 1 }, token, headers()))
      .status,
  ).toBe(200);
  expect(await balance(token, account.id)).toBe('0');
});

it('manages income periods and deletes a loan with its history but keeps recorded expenses', async () => {
  const { token, account, expense } = await fixture();
  const period = emiIncomePeriodSchema.parse(
    data(
      await call(
        'POST',
        'emi/income-periods',
        { kind: 'salary', amountMinor: '7500000', startMonth: '2026-01', endMonth: null },
        token,
        headers(),
      ),
    ),
  );
  expect(period).toMatchObject({ kind: 'salary', endMonth: null, note: '' });
  const edited = emiIncomePeriodSchema.parse(
    data(
      await call(
        'PATCH',
        `emi/income-periods/${period.id}`,
        {
          kind: 'salary',
          amountMinor: '9000000',
          startMonth: '2026-01',
          endMonth: null,
          note: '',
          version: 1,
        },
        token,
        headers(),
      ),
    ),
  );
  expect(edited).toMatchObject({ amountMinor: '9000000', version: 2 });
  const loan = await addLoan(token);
  await call(
    'POST',
    `emi/loans/${loan.id}/payments/2026-02`,
    { accountId: account.id, categoryId: expense.id },
    token,
    headers(),
  );
  expect(
    (
      await call(
        'DELETE',
        `emi/loans/${loan.id}`,
        { version: 1, confirmation: 'DELETE' },
        token,
        headers(),
      )
    ).status,
  ).toBe(200);
  const state = await overview(token);
  expect(state.loans).toEqual([]);
  expect(state.payments).toEqual([]);
  expect(state.incomePeriods).toHaveLength(1);
  // The recorded expense is real money spent, so it stays.
  expect(await balance(token, account.id)).toBe('-2500000');
});

it('isolates every record by user', async () => {
  const { token } = await fixture();
  const loan = await addLoan(token);
  const stranger = await createUser('three@example.com');
  expect((await overview(stranger.accessToken)).loans).toEqual([]);
  expect(
    (
      await call(
        'POST',
        `emi/loans/${loan.id}/payments/2026-02`,
        {},
        stranger.accessToken,
        headers(),
      )
    ).status,
  ).toBe(404);
  expect(
    (
      await call(
        'DELETE',
        `emi/loans/${loan.id}`,
        { version: 1, confirmation: 'DELETE' },
        stranger.accessToken,
        headers(),
      )
    ).status,
  ).toBe(404);
  expect((await overview(token)).loans).toHaveLength(1);
});
