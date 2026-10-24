import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { outlookSchema, recurringRuleSchema, recurringOccurrenceSchema } from '@finora/contracts';
import { calendarDate, nextOccurrence } from '@finora/finance-core';
import { setupDatabase, clearDatabase, teardownDatabase, call, createUser } from './setup';
import { fixture, data, headers } from './advanced-fixtures';
import { database } from '../src/database/client';
beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);
const today = () => calendarDate(new Date(), 'Asia/Kolkata');
it('takes an owned as-of-today snapshot without changing financial data', async () => {
  const { token, account, expense, income } = await fixture();
  await call(
    'POST',
    'transactions',
    {
      type: 'INCOME',
      accountId: account.id,
      categoryId: income.id,
      amountMinor: '10000',
      date: `${today()}T00:00:00+05:30`,
    },
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
      amountMinor: '200',
      date: `${nextOccurrence(today(), 'DAILY', 2)}T12:00:00+05:30`,
    },
    token,
    headers(),
  );
  const debt = data<{ id: string }>(
    await call(
      'POST',
      'debts',
      {
        name: 'Synthetic lender',
        direction: 'BORROWED',
        amountMinor: '500',
        date: today(),
        dueDate: nextOccurrence(today(), 'DAILY', 4),
      },
      token,
      headers(),
    ),
  );
  await call(
    'POST',
    `debts/${debt.id}/repayments`,
    { amountMinor: '100', date: today(), version: 1 },
    token,
    headers(),
  );
  const { db } = await database();
  const before = await db.collection('transactions').countDocuments();
  const result = outlookSchema.parse(data(await call('GET', 'planning/outlook', undefined, token)));
  expect(result.accounts.find((a) => a.id === account.id)?.balanceMinor).toBe('10000');
  expect(result.flows.filter((f) => f.source === 'DEBT')[0]?.amountMinor).toBe('400');
  expect(result.flows.filter((f) => f.source === 'RECORDED')).toHaveLength(1);
  expect(await db.collection('transactions').countDocuments()).toBe(before);
  const other = await createUser('other@example.com');
  const foreign = outlookSchema.parse(
    data(await call('GET', 'planning/outlook', undefined, other.accessToken)),
  );
  expect(foreign.accounts).toEqual([]);
  expect(foreign.flows).toEqual([]);
  expect((await call('GET', 'planning/outlook')).status).toBe(401);
  expect(
    (await call('GET', `planning/outlook?userId=${account.userId}`, undefined, token)).status,
  ).toBe(400);
  expect((await call('POST', 'planning/outlook', {}, token)).status).toBe(405);
});
it('deduplicates generated and posted recurrence, including a payment recorded today', async () => {
  const { token, account, expense } = await fixture();
  const rule = recurringRuleSchema.parse(
    data(
      await call(
        'POST',
        'recurring',
        {
          name: 'Monthly bill',
          type: 'EXPENSE',
          accountId: account.id,
          categoryId: expense.id,
          amountMode: 'FIXED',
          amountMinor: '400',
          postingPolicy: 'CONFIRM_EACH',
          startDate: today(),
          frequency: 'MONTHLY',
        },
        token,
        headers(),
      ),
    ),
  );
  await call('POST', 'recurring/generate', {}, token, headers());
  const occurrence = recurringOccurrenceSchema.parse(
    data<unknown[]>(await call('GET', 'recurring-occurrences?status=PENDING', undefined, token))[0],
  );
  const pending = outlookSchema.parse(
    data(await call('GET', 'planning/outlook', undefined, token)),
  );
  expect(pending.flows.filter((f) => f.id === `recurring:${rule.id}:0`)).toHaveLength(1);
  await call(
    'POST',
    `recurring-occurrences/${occurrence.id}/confirm`,
    { amountMinor: '400', date: `${today()}T00:00:00+05:30`, version: 1 },
    token,
    headers(),
  );
  const posted = outlookSchema.parse(data(await call('GET', 'planning/outlook', undefined, token)));
  expect(posted.flows.some((f) => f.id === `recurring:${rule.id}:0`)).toBe(false);
  expect(posted.accounts[0]?.balanceMinor).toBe('-400');
});
it('discloses variable bills and undated outstanding debts', async () => {
  const { token, account, expense } = await fixture();
  await call(
    'POST',
    'recurring',
    {
      name: 'Variable bill',
      type: 'EXPENSE',
      accountId: account.id,
      categoryId: expense.id,
      amountMode: 'VARIABLE',
      postingPolicy: 'CONFIRM_EACH',
      startDate: nextOccurrence(today(), 'DAILY', 1),
      frequency: 'MONTHLY',
    },
    token,
    headers(),
  );
  await call(
    'POST',
    'debts',
    { name: 'Undated loan', direction: 'BORROWED', amountMinor: '100', date: today() },
    token,
    headers(),
  );
  const result = outlookSchema.parse(data(await call('GET', 'planning/outlook', undefined, token)));
  expect(result.undatedDebts).toBe(1);
  expect(result.flows.some((f) => f.direction === 'OUT' && f.amountMinor === null)).toBe(true);
});
