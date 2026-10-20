import { z } from 'zod';
import {
  recurringOccurrenceSchema,
  recurringRuleSchema,
  transactionSchema,
} from '@finora/contracts';
import { calendarDate, nextOccurrence } from '@finora/finance-core';
import { database } from '../src/database/client';
import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { call, clearDatabase, createUser, setupDatabase, teardownDatabase } from './setup';
import { data, headers, fixture } from './advanced-fixtures';
beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);

it('generates month-end dates once, honors pause and requires exact confirmation before posting', async () => {
  const { token, account, expense } = await fixture();
  const year = new Date().getUTCFullYear() - 1;
  const input = {
    name: 'Rent',
    type: 'EXPENSE',
    accountId: account.id,
    categoryId: expense.id,
    startDate: `${year}-01-31`,
    endDate: `${year}-03-31`,
    frequency: 'MONTHLY',
    amountMode: 'FIXED',
    amountMinor: '500',
    postingPolicy: 'CONFIRM_EACH',
  };
  const rule = recurringRuleSchema.parse(
    data(await call('POST', 'recurring', input, token, headers())),
  );
  expect(
    (await call('POST', `recurring/${rule.id}/pause`, { version: 1 }, token, headers())).status,
  ).toBe(200);
  expect(
    (
      data(await call('POST', 'recurring/generate', {}, token, headers())) as {
        occurrences: unknown[];
      }
    ).occurrences,
  ).toHaveLength(0);
  expect(
    (await call('POST', `recurring/${rule.id}/resume`, { version: 2 }, token, headers())).status,
  ).toBe(200);
  const key = headers();
  const generated = await call('POST', 'recurring/generate', {}, token, key);
  const occurrences = z
    .array(recurringOccurrenceSchema)
    .parse((data(generated) as { occurrences: unknown }).occurrences);
  expect(occurrences.map((item) => item.dueDate)).toEqual(
    [0, 1, 2].map((index) => nextOccurrence(input.startDate, 'MONTHLY', index)),
  );
  expect(data(await call('POST', 'recurring/generate', {}, token, key))).toEqual(data(generated));
  expect(
    (
      data(await call('POST', 'recurring/generate', {}, token, headers())) as {
        occurrences: unknown[];
      }
    ).occurrences,
  ).toHaveLength(0);
  const { db } = await database();
  expect(await db.collection('transactions').countDocuments({ accountId: account.id })).toBe(0);
  const occurrence = occurrences[0]!;
  const confirm = { version: 1, amountMinor: '500', date: `${occurrence.dueDate}T12:00:00Z` };
  expect(
    (
      await call(
        'POST',
        `recurring-occurrences/${occurrence.id}/confirm`,
        { ...confirm, amountMinor: '501' },
        token,
        headers(),
      )
    ).status,
  ).toBe(400);
  const other = await createUser('other@example.com');
  expect(
    (
      await call(
        'POST',
        `recurring-occurrences/${occurrence.id}/confirm`,
        confirm,
        other.accessToken,
        headers(),
      )
    ).status,
  ).toBe(404);
  const results = await Promise.all([
    call('POST', `recurring-occurrences/${occurrence.id}/confirm`, confirm, token, headers()),
    call('POST', `recurring-occurrences/${occurrence.id}/confirm`, confirm, token, headers()),
  ]);
  expect(results.map((result) => result.status).sort()).toEqual([200, 409]);
  expect(await db.collection('transactions').countDocuments({ accountId: account.id })).toBe(1);
  const posted = results.find((result) => result.status === 200)!;
  expect(
    transactionSchema.parse((data(posted) as { transaction: unknown }).transaction).amountMinor,
  ).toBe('500');
  expect(
    (
      await call(
        'DELETE',
        `recurring/${rule.id}`,
        { version: 4, confirmation: 'DELETE' },
        token,
        headers(),
      )
    ).status,
  ).toBe(409);
  const transaction = transactionSchema.parse(
    (data(posted) as { transaction: unknown }).transaction,
  );
  expect(
    (
      await call(
        'PATCH',
        `transactions/${transaction.id}`,
        {
          type: transaction.type,
          accountId: transaction.accountId,
          categoryId: transaction.categoryId,
          date: transaction.date,
          amountMinor: '700',
          version: 1,
        },
        token,
        headers(),
      )
    ).status,
  ).toBe(200);
  let linked = recurringOccurrenceSchema.parse(
    await db
      .collection('recurring_occurrences')
      .findOne({ userId: rule.userId, id: occurrence.id }),
  );
  expect(linked).toMatchObject({ status: 'POSTED', amountMinor: '700', version: 3 });
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
  linked = recurringOccurrenceSchema.parse(
    await db
      .collection('recurring_occurrences')
      .findOne({ userId: rule.userId, id: occurrence.id }),
  );
  expect(linked).toMatchObject({ status: 'PENDING', version: 4 });
  expect(linked.transactionId).toBeUndefined();
  expect(
    (
      await call(
        'POST',
        `recurring-occurrences/${linked.id}/confirm`,
        { ...confirm, amountMinor: '700', version: 4 },
        token,
        headers(),
      )
    ).status,
  ).toBe(200);
  expect(
    (await call('POST', 'recurring', { ...input, postingPolicy: 'AUTO_POST' }, token, headers()))
      .status,
  ).toBe(400);
});

it('requires user chosen variable amount and date in the occurrence timezone', async () => {
  const { token, account, expense } = await fixture();
  const day = calendarDate(new Date(Date.now() - 86400000), 'Asia/Kolkata');
  const rule = recurringRuleSchema.parse(
    data(
      await call(
        'POST',
        'recurring',
        {
          name: 'Utility',
          type: 'EXPENSE',
          accountId: account.id,
          categoryId: expense.id,
          startDate: day,
          endDate: day,
          frequency: 'DAILY',
          amountMode: 'VARIABLE',
          postingPolicy: 'CONFIRM_EACH',
        },
        token,
        headers(),
      ),
    ),
  );
  const generated = data(await call('POST', 'recurring/generate', {}, token, headers())) as {
    occurrences: unknown;
  };
  const [occurrence] = z.array(recurringOccurrenceSchema).parse(generated.occurrences);
  expect(occurrence?.ruleId).toBe(rule.id);
  expect(
    (
      await call(
        'POST',
        `recurring-occurrences/${occurrence!.id}/confirm`,
        { version: 1, date: `${day}T12:00:00Z` },
        token,
        headers(),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await call(
        'POST',
        `recurring-occurrences/${occurrence!.id}/confirm`,
        { version: 1, amountMinor: '123', date: `${day}T23:30:00Z` },
        token,
        headers(),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await call(
        'POST',
        `recurring-occurrences/${occurrence!.id}/confirm`,
        { version: 1, amountMinor: '123', date: `${day}T12:00:00Z` },
        token,
        headers(),
      )
    ).status,
  ).toBe(200);
});
