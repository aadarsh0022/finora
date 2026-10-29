import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import {
  backupSchema,
  debtSchema,
  debtDetailSchema,
  accountWithBalanceSchema,
  reportSummarySchema,
} from '@finora/contracts';
import { call, clearDatabase, createUser, setupDatabase, teardownDatabase } from './setup';
import { data, fixture, headers } from './advanced-fixtures';
import { GET } from '../app/api/v1/[...path]/route';
beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);
const day = '2026-01-10';
it('tracks a refund without duplicating its original expense, supports partial receipts and preserves the type in restore', async () => {
  const { token, account, expense } = await fixture();
  await call(
    'POST',
    'transactions',
    {
      type: 'EXPENSE',
      accountId: account.id,
      categoryId: expense.id,
      amountMinor: '1000',
      date: `${day}T12:00:00+05:30`,
    },
    token,
    headers(),
  );
  const claim = debtSchema.parse(
    data(
      await call(
        'POST',
        'debts',
        {
          name: 'Demo refund',
          kind: 'REFUND',
          direction: 'LENT',
          amountMinor: '1000',
          date: day,
          dueDate: '2026-01-20',
        },
        token,
        headers(),
      ),
    ),
  );
  expect(
    accountWithBalanceSchema.parse(
      data(await call('GET', `accounts/${account.id}`, undefined, token)),
    ).balanceMinor,
  ).toBe('-1000');
  const key = headers();
  const body = { amountMinor: '400', date: day, accountId: account.id, version: 1 };
  expect((await call('POST', `debts/${claim.id}/repayments`, body, token, key)).status).toBe(201);
  await call('POST', `debts/${claim.id}/repayments`, body, token, key);
  expect(
    debtDetailSchema.parse(data(await call('GET', `debts/${claim.id}`, undefined, token))),
  ).toMatchObject({ kind: 'REFUND', repaidMinor: '400', remainingMinor: '600' });
  expect(
    accountWithBalanceSchema.parse(
      data(await call('GET', `accounts/${account.id}`, undefined, token)),
    ).balanceMinor,
  ).toBe('-600');
  const report = reportSummarySchema.parse(
    data(
      await call(
        'GET',
        'reports/summary?range=custom&from=2026-01-01&to=2026-01-31',
        undefined,
        token,
      ),
    ),
  );
  expect(report.cashflow).toMatchObject({ incomeMinor: '0', expensesMinor: '1000' });
  expect(
    (
      await call(
        'POST',
        `debts/${claim.id}/repayments`,
        { ...body, version: 2, amountMinor: '601' },
        token,
        headers(),
      )
    ).status,
  ).toBe(409);
  const response = await GET(
    new Request('http://localhost:3000/api/v1/export/backup', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
  const saved = backupSchema.parse(await response.json());
  expect(saved.version).toBe(4);
  expect(saved.debts[0]?.kind).toBe('REFUND');
  expect(backupSchema.safeParse({ ...saved, version: 3 }).success).toBe(false);
  const target = await createUser('restore@example.com');
  const preview = z
    .object({ previewId: z.uuid(), contentHash: z.string(), canImport: z.literal(true) })
    .parse(
      data(await call('POST', 'import/preview', { backup: saved }, target.accessToken, headers())),
    );
  expect(
    (
      await call(
        'POST',
        'import/commit',
        {
          backup: saved,
          previewId: preview.previewId,
          contentHash: preview.contentHash,
          mode: 'merge',
          confirmation: 'IMPORT',
        },
        target.accessToken,
        headers(),
      )
    ).status,
  ).toBe(200);
  expect(
    debtDetailSchema.parse(
      data(await call('GET', `debts/${claim.id}`, undefined, target.accessToken)),
    ),
  ).toMatchObject({ kind: 'REFUND', remainingMinor: '600' });
  expect(
    accountWithBalanceSchema.parse(
      data(await call('GET', `accounts/${account.id}`, undefined, target.accessToken)),
    ).balanceMinor,
  ).toBe('-600');
});
it('rejects borrowed or initially account-linked non-loan claims and reads old debt types safely', async () => {
  const { token, account } = await fixture();
  const body = {
    name: 'Deposit',
    kind: 'DEPOSIT',
    direction: 'LENT',
    amountMinor: '100',
    date: day,
  };
  expect(
    (await call('POST', 'debts', { ...body, direction: 'BORROWED' }, token, headers())).status,
  ).toBe(400);
  expect(
    (await call('POST', 'debts', { ...body, accountId: account.id }, token, headers())).status,
  ).toBe(400);
  const old = debtSchema.parse(
    data(
      await call(
        'POST',
        'debts',
        { name: 'Old loan', direction: 'BORROWED', amountMinor: '100', date: day },
        token,
        headers(),
      ),
    ),
  );
  expect(old.kind).toBe('PERSONAL_LOAN');
});
