import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import {
  accountSchema,
  categorySchema,
  transactionSchema,
  type TransactionInput,
} from '@finora/contracts';
import {
  call,
  clearDatabase,
  createUser,
  password,
  setupDatabase,
  teardownDatabase,
} from './setup';
import { database } from '../src/database/client';
import { settingsSchema } from '@finora/contracts';

beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);
const headers = () => ({ 'Idempotency-Key': randomUUID() });
async function fixtures() {
  const user = await createUser();
  async function account(name: string) {
    const result = await call(
      'POST',
      'accounts',
      { name, type: 'CASH' },
      user.accessToken,
      headers(),
    );
    return accountSchema.parse(result.json.success ? result.json.data : null);
  }
  async function category(name: string, type: 'INCOME' | 'EXPENSE') {
    const result = await call('POST', 'categories', { name, type }, user.accessToken, headers());
    return categorySchema.parse(result.json.success ? result.json.data : null);
  }
  return {
    user,
    cash: await account('Cash'),
    savings: await account('Savings'),
    income: await category('Salary', 'INCOME'),
    expense: await category('Food', 'EXPENSE'),
  };
}
async function createEntry(token: string, input: Partial<TransactionInput>) {
  const result = await call(
    'POST',
    'transactions',
    { date: '2026-10-15T12:00:00Z', ...input },
    token,
    headers(),
  );
  expect(result.status).toBe(201);
  return transactionSchema.parse(result.json.success ? result.json.data : null);
}
type Overview = {
  totalBalanceMinor: string;
  incomeMinor: string;
  expensesMinor: string;
  accounts: { id: string; balanceMinor: string }[];
  categorySpending: Record<string, string>;
};
async function summary(token: string, month = '2026-10') {
  const result = await call<Overview>('GET', `reports/overview?month=${month}`, undefined, token);
  expect(result.status).toBe(200);
  if (!result.json.success) throw new Error('Summary failed');
  return result.json.data;
}

it('runs income, expense, transfer, edit, deletion and relogin with persisted balances', async () => {
  const { user, cash, savings, income, expense } = await fixtures();
  await createEntry(user.accessToken, {
    type: 'INCOME',
    accountId: cash.id,
    categoryId: income.id,
    amountMinor: '10000',
  });
  const spending = await createEntry(user.accessToken, {
    type: 'EXPENSE',
    accountId: cash.id,
    categoryId: expense.id,
    amountMinor: '2500',
    note: 'Lunch',
  });
  const before = await summary(user.accessToken);
  expect(before.totalBalanceMinor).toBe('7500');
  const transfer = await createEntry(user.accessToken, {
    type: 'TRANSFER',
    accountId: cash.id,
    destinationAccountId: savings.id,
    amountMinor: '3000',
  });
  const after = await summary(user.accessToken);
  expect(after.totalBalanceMinor).toBe(before.totalBalanceMinor);
  expect(after.incomeMinor).toBe('10000');
  expect(after.expensesMinor).toBe('2500');
  expect(after.accounts.find((account) => account.id === cash.id)?.balanceMinor).toBe('4500');
  expect(after.accounts.find((account) => account.id === savings.id)?.balanceMinor).toBe('3000');
  expect(
    (
      await call(
        'PATCH',
        `transactions/${spending.id}`,
        {
          type: spending.type,
          accountId: spending.accountId,
          categoryId: spending.categoryId,
          amountMinor: '1500',
          date: spending.date,
          version: 1,
        },
        user.accessToken,
        headers(),
      )
    ).status,
  ).toBe(200);
  expect((await summary(user.accessToken)).categorySpending[expense.id]).toBe('1500');
  expect(
    (
      await call(
        'DELETE',
        `transactions/${spending.id}`,
        { version: 2, confirmation: 'DELETE' },
        user.accessToken,
        headers(),
      )
    ).status,
  ).toBe(200);
  expect((await summary(user.accessToken)).expensesMinor).toBe('0');
  expect(
    (
      await call(
        'DELETE',
        `transactions/${transfer.id}`,
        { version: 1, confirmation: 'DELETE' },
        user.accessToken,
        headers(),
      )
    ).status,
  ).toBe(200);
  expect(
    (await summary(user.accessToken)).accounts.find((account) => account.id === savings.id)
      ?.balanceMinor,
  ).toBe('0');
  await call('POST', 'auth/logout', undefined, user.accessToken);
  const login = await call<{ accessToken: string }>('POST', 'auth/login', {
    email: user.user.email,
    password,
  });
  if (!login.json.success) throw new Error('Login failed');
  expect((await summary(login.json.data.accessToken)).totalBalanceMinor).toBe('10000');
});

it('rejects cross-user references, mismatched categories, nonpositive amounts and self transfers', async () => {
  const { user, cash, income, expense } = await fixtures();
  const other = await createUser('other@example.com');
  const input = {
    type: 'EXPENSE',
    accountId: cash.id,
    categoryId: expense.id,
    amountMinor: '100',
    date: '2026-10-01T00:00:00Z',
  };
  expect((await call('POST', 'transactions', input, other.accessToken, headers())).status).toBe(
    400,
  );
  expect(
    (
      await call(
        'POST',
        'transactions',
        { ...input, categoryId: income.id },
        user.accessToken,
        headers(),
      )
    ).status,
  ).toBe(400);
  for (const amountMinor of ['0', '-1', '1.01'])
    expect(
      (await call('POST', 'transactions', { ...input, amountMinor }, user.accessToken, headers()))
        .status,
    ).toBe(400);
  expect(
    (
      await call(
        'POST',
        'transactions',
        {
          type: 'TRANSFER',
          accountId: cash.id,
          destinationAccountId: cash.id,
          amountMinor: '1',
          date: input.date,
        },
        user.accessToken,
        headers(),
      )
    ).status,
  ).toBe(400);
  const entry = await createEntry(user.accessToken, input as TransactionInput);
  expect((await call('GET', `transactions/${entry.id}`, undefined, other.accessToken)).status).toBe(
    404,
  );
  expect(
    (
      await call(
        'DELETE',
        `transactions/${entry.id}`,
        { version: 1, confirmation: 'DELETE' },
        other.accessToken,
        headers(),
      )
    ).status,
  ).toBe(404);
  expect((await summary(other.accessToken)).totalBalanceMinor).toBe('0');
});

it('deduplicates financial creates and filters/sorts exact large amounts with literal text search', async () => {
  const { user, cash, savings, expense } = await fixtures();
  const input = {
    type: 'EXPENSE',
    accountId: cash.id,
    categoryId: expense.id,
    amountMinor: '900719925474099301',
    date: '2026-10-15T00:00:00Z',
    merchant: 'Cafe [one]',
  };
  const operationHeaders = headers();
  for (let i = 0; i < 2; i++)
    expect(
      (await call('POST', 'transactions', input, user.accessToken, operationHeaders)).status,
    ).toBe(201);
  await createEntry(user.accessToken, {
    type: 'EXPENSE',
    accountId: cash.id,
    categoryId: expense.id,
    amountMinor: '900719925474099302',
    merchant: 'Other',
  });
  await createEntry(user.accessToken, {
    type: 'TRANSFER',
    accountId: cash.id,
    destinationAccountId: savings.id,
    amountMinor: '10',
  });
  const result = await call<{ items: { amountMinor: string }[]; total: number }>(
    'GET',
    'transactions?sort=highest&pageSize=1',
    undefined,
    user.accessToken,
  );
  expect(result.json.success && result.json.data.items[0]?.amountMinor).toBe('900719925474099302');
  expect(result.json.success && result.json.data.total).toBe(3);
  const search = await call<{ total: number }>(
    'GET',
    'transactions?q=%5Bone%5D',
    undefined,
    user.accessToken,
  );
  expect(search.json.success && search.json.data.total).toBe(1);
  const incoming = await call<{ total: number }>(
    'GET',
    `transactions?accountId=${savings.id}`,
    undefined,
    user.accessToken,
  );
  expect(incoming.json.success && incoming.json.data.total).toBe(1);
  expect(
    (await call('GET', 'transactions?userId=victim', undefined, user.accessToken)).status,
  ).toBe(400);
});

it('uses the user timezone for month reports and blocks archived/new or stale references', async () => {
  const { user, cash, expense } = await fixtures();
  const entry = await createEntry(user.accessToken, {
    type: 'EXPENSE',
    accountId: cash.id,
    categoryId: expense.id,
    amountMinor: '99',
    date: '2026-09-30T20:00:00Z',
  });
  expect((await summary(user.accessToken)).expensesMinor).toBe('99');
  expect((await summary(user.accessToken, '2026-09')).expensesMinor).toBe('0');
  expect(
    (
      await call(
        'DELETE',
        `transactions/${entry.id}`,
        { version: 2, confirmation: 'DELETE' },
        user.accessToken,
        headers(),
      )
    ).status,
  ).toBe(409);
  await call('DELETE', `accounts/${cash.id}`, { version: 1 }, user.accessToken, headers());
  expect(
    (
      await call(
        'POST',
        'transactions',
        {
          type: 'EXPENSE',
          accountId: cash.id,
          categoryId: expense.id,
          amountMinor: '1',
          date: entry.date,
        },
        user.accessToken,
        headers(),
      )
    ).status,
  ).toBe(409);
  const { db } = await database();
  expect(await db.collection('transactions').countDocuments({ userId: user.user.id })).toBe(1);
});

it('persists preferences, rejects stale settings and locks currency once accounts exist', async () => {
  const { user } = await fixtures();
  const result = await call('GET', 'settings', undefined, user.accessToken);
  const settings = settingsSchema.parse(result.json.success ? result.json.data : null);
  const changed = {
    preferences: { ...settings.preferences, preferredTheme: 'dark' },
    version: settings.version,
  };
  expect((await call('PATCH', 'settings', changed, user.accessToken, headers())).status).toBe(200);
  expect((await call('PATCH', 'settings', changed, user.accessToken, headers())).status).toBe(409);
  expect(
    (
      await call(
        'PATCH',
        'settings',
        { preferences: { ...settings.preferences, baseCurrency: 'USD' }, version: 2 },
        user.accessToken,
        headers(),
      )
    ).status,
  ).toBe(409);
});
