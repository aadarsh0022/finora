import { afterAll, beforeAll, beforeEach, expect, it } from 'vitest';
import { z } from 'zod';
import {
  debtSchema,
  debtDetailSchema,
  debtEventSchema,
  accountWithBalanceSchema,
  reportSummarySchema,
  backupSchema,
} from '@finora/contracts';
import {
  call,
  clearDatabase,
  createUser,
  setupDatabase,
  teardownDatabase,
  password,
} from './setup';
import { data, fixture, headers } from './advanced-fixtures';
import { GET } from '../app/api/v1/[...path]/route';
import { database } from '../src/database/client';

beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);
const date = '2026-01-10';
async function backup(token: string) {
  const response = await GET(
    new Request('http://localhost:3000/api/v1/export/backup', {
      headers: { Authorization: `Bearer ${token}` },
    }),
  );
  expect(response.status).toBe(200);
  return backupSchema.parse(await response.json());
}

it('changes accounts for borrowed principal and repayments without inflating income or expenses', async () => {
  const { token, account } = await fixture();
  const body = {
    name: 'Test lender',
    direction: 'BORROWED',
    amountMinor: '900719925474099301',
    date,
    accountId: account.id,
    dueDate: '2026-01-20',
  };
  const key = headers();
  const created = await call('POST', 'debts', body, token, key);
  const debt = debtSchema.parse(data(created));
  expect(data(await call('POST', 'debts', body, token, key))).toEqual(data(created));
  expect(
    accountWithBalanceSchema.parse(
      data(await call('GET', `accounts/${account.id}`, undefined, token)),
    ).balanceMinor,
  ).toBe(body.amountMinor);
  const repayment = debtEventSchema.parse(
    data(
      await call(
        'POST',
        `debts/${debt.id}/repayments`,
        { amountMinor: '101', date, accountId: account.id, version: 1 },
        token,
        headers(),
      ),
    ),
  );
  const detail = debtDetailSchema.parse(
    data(await call('GET', `debts/${debt.id}`, undefined, token)),
  );
  expect(detail).toMatchObject({
    repaidMinor: '101',
    remainingMinor: '900719925474099200',
    status: 'OVERDUE',
    version: 2,
  });
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
  expect(report.cashflow).toMatchObject({ incomeMinor: '0', expensesMinor: '0', netMinor: '0' });
  expect(report.accounts[0]).toMatchObject({
    closingBalanceMinor: '900719925474099200',
    netMinor: '900719925474099200',
    debtInMinor: body.amountMinor,
    debtOutMinor: '101',
  });
  expect(
    (
      await call(
        'DELETE',
        `debts/${debt.id}/repayments/${repayment.id}`,
        { version: 2, confirmation: 'DELETE' },
        token,
        headers(),
      )
    ).status,
  ).toBe(200);
  expect(
    accountWithBalanceSchema.parse(
      data(await call('GET', `accounts/${account.id}`, undefined, token)),
    ).balanceMinor,
  ).toBe(body.amountMinor);
  expect(
    debtDetailSchema
      .parse(data(await call('GET', `debts/${debt.id}`, undefined, token)))
      .events.find((e) => e.id === repayment.id)?.reversedAt,
  ).toBeDefined();
});

it('supports existing debts, lent money, partial settlement, archive and corrections', async () => {
  const { token, account } = await fixture();
  const debt = debtSchema.parse(
    data(
      await call(
        'POST',
        'debts',
        {
          name: 'Test borrower',
          direction: 'LENT',
          amountMinor: '5000',
          date,
          accountId: account.id,
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
  ).toBe('-5000');
  expect(
    (
      await call(
        'POST',
        `debts/${debt.id}/repayments`,
        { amountMinor: '5001', date, version: 1 },
        token,
        headers(),
      )
    ).status,
  ).toBe(409);
  const repayment = debtEventSchema.parse(
    data(
      await call(
        'POST',
        `debts/${debt.id}/repayments`,
        { amountMinor: '5000', date, version: 1, accountId: account.id },
        token,
        headers(),
      ),
    ),
  );
  expect(
    debtDetailSchema.parse(data(await call('GET', `debts/${debt.id}`, undefined, token))).status,
  ).toBe('SETTLED');
  expect(
    accountWithBalanceSchema.parse(
      data(await call('GET', `accounts/${account.id}`, undefined, token)),
    ).balanceMinor,
  ).toBe('0');
  expect(
    (
      await call(
        'DELETE',
        `debts/${debt.id}/repayments/${repayment.id}`,
        { version: 2, confirmation: 'DELETE' },
        token,
        headers(),
      )
    ).status,
  ).toBe(200);
  const archived = debtSchema.parse(
    data(
      await call(
        'PATCH',
        `debts/${debt.id}`,
        { name: debt.name, note: '', archived: true, version: 3 },
        token,
        headers(),
      ),
    ),
  );
  expect(
    (
      await call(
        'POST',
        `debts/${debt.id}/repayments`,
        { amountMinor: '1', date, version: archived.version },
        token,
        headers(),
      )
    ).status,
  ).toBe(409);
  expect(
    (
      await call(
        'POST',
        `debts/${debt.id}/cancel`,
        { version: archived.version, confirmation: 'CANCEL' },
        token,
        headers(),
      )
    ).status,
  ).toBe(200);
  expect(
    accountWithBalanceSchema.parse(
      data(await call('GET', `accounts/${account.id}`, undefined, token)),
    ).balanceMinor,
  ).toBe('0');
  const existing = debtSchema.parse(
    data(
      await call(
        'POST',
        'debts',
        { name: 'Existing lender', direction: 'BORROWED', amountMinor: '700', date },
        token,
        headers(),
      ),
    ),
  );
  await call(
    'POST',
    `debts/${existing.id}/repayments`,
    { amountMinor: '200', date, version: 1 },
    token,
    headers(),
  );
  expect(
    accountWithBalanceSchema.parse(
      data(await call('GET', `accounts/${account.id}`, undefined, token)),
    ).balanceMinor,
  ).toBe('0');
  const exported = await backup(token);
  expect(exported.version).toBe(4);
  expect(exported.debts).toHaveLength(2);
});

it('rejects cross-user access, invalid dates, stale writes and racing overpayments', async () => {
  const { token, account } = await fixture();
  const other = await createUser('other@example.com');
  expect((await call('GET', 'debts')).status).toBe(401);
  expect(
    (
      await call(
        'POST',
        'debts',
        { name: 'Test', direction: 'LENT', amountMinor: '1', date, accountId: account.id },
        other.accessToken,
        headers(),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await call(
        'POST',
        'debts',
        { name: 'Test', direction: 'LENT', amountMinor: '1', date: '2099-01-01' },
        token,
        headers(),
      )
    ).status,
  ).toBe(400);
  const debt = debtSchema.parse(
    data(
      await call(
        'POST',
        'debts',
        { name: 'Test', direction: 'BORROWED', amountMinor: '100', date },
        token,
        headers(),
      ),
    ),
  );
  expect((await call('GET', `debts/${debt.id}`, undefined, other.accessToken)).status).toBe(404);
  expect(
    (
      await call(
        'POST',
        `debts/${debt.id}/repayments`,
        { amountMinor: '1', date: '2026-01-09', version: 1 },
        token,
        headers(),
      )
    ).status,
  ).toBe(400);
  const replies = await Promise.all(
    [1, 2].map(() =>
      call(
        'POST',
        `debts/${debt.id}/repayments`,
        { amountMinor: '80', date, version: 1 },
        token,
        headers(),
      ),
    ),
  );
  expect(replies.map((r) => r.status).sort()).toEqual([201, 409]);
  expect(
    debtDetailSchema.parse(data(await call('GET', `debts/${debt.id}`, undefined, token)))
      .remainingMinor,
  ).toBe('20');
});

it('restores exact debt history, rejects inconsistent backups and deletes all debt records with the account', async () => {
  const { token, account } = await fixture();
  const debt = debtSchema.parse(
    data(
      await call(
        'POST',
        'debts',
        { name: 'Test', direction: 'LENT', amountMinor: '5000', date, accountId: account.id },
        token,
        headers(),
      ),
    ),
  );
  await call(
    'POST',
    `debts/${debt.id}/repayments`,
    { amountMinor: '123', date, version: 1, accountId: account.id },
    token,
    headers(),
  );
  const saved = await backup(token);
  expect(JSON.stringify(saved)).not.toContain('userId');
  expect(
    backupSchema.safeParse({
      ...saved,
      debtEvents: saved.debtEvents.map((e) =>
        e.kind === 'REPAYMENT' ? { ...e, amountMinor: '9999' } : e,
      ),
    }).success,
  ).toBe(false);
  const other = await createUser('restored@example.com');
  const preview = z
    .object({ previewId: z.uuid(), contentHash: z.string(), canImport: z.literal(true) })
    .parse(
      data(await call('POST', 'import/preview', { backup: saved }, other.accessToken, headers())),
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
        other.accessToken,
        headers(),
      )
    ).status,
  ).toBe(200);
  expect(
    debtDetailSchema.parse(
      data(await call('GET', `debts/${debt.id}`, undefined, other.accessToken)),
    ).remainingMinor,
  ).toBe('4877');
  expect(
    accountWithBalanceSchema.parse(
      data(await call('GET', `accounts/${account.id}`, undefined, other.accessToken)),
    ).balanceMinor,
  ).toBe('-4877');
  expect(
    (await call('DELETE', 'auth/account', { password, confirmation: 'DELETE' }, token)).status,
  ).toBe(200);
  const { db } = await database();
  expect(await db.collection('debts').countDocuments({ userId: debt.userId })).toBe(0);
  expect(await db.collection('debt_events').countDocuments({ userId: debt.userId })).toBe(0);
});
