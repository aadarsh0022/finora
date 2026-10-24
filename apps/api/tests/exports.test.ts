import { randomUUID } from 'node:crypto';
import { z } from 'zod';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import {
  accountSchema,
  categorySchema,
  backupSchema,
  goalSchema,
  recurringOccurrenceSchema,
  type Backup,
} from '@finora/contracts';
import { GET, POST } from '../app/api/v1/[...path]/route';
import { database } from '../src/database/client';
import { commitImport, csvCell, previewImport } from '../src/modules/exports/service';
import { authenticate } from '../src/modules/auth/service';
import { call, clearDatabase, createUser, setupDatabase, teardownDatabase } from './setup';

beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);
const key = () => ({ 'Idempotency-Key': randomUUID() });
const previewResultSchema = z.object({
  previewId: z.uuid(),
  contentHash: z.string(),
  canImport: z.boolean(),
});

async function raw(path: string, token?: string) {
  return GET(
    new Request(`http://localhost:3000/api/v1/${path}`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    }),
  );
}
async function fixture(token: string) {
  const accountResult = await call(
    'POST',
    'accounts',
    { name: 'Cash', type: 'CASH', openingBalanceMinor: '900719925474099301' },
    token,
    key(),
  );
  const account = accountSchema.parse(accountResult.json.success ? accountResult.json.data : null);
  const categoryResult = await call(
    'POST',
    'categories',
    { name: 'Food', type: 'EXPENSE' },
    token,
    key(),
  );
  const category = categorySchema.parse(
    categoryResult.json.success ? categoryResult.json.data : null,
  );
  expect(
    (
      await call(
        'POST',
        'transactions',
        {
          type: 'EXPENSE',
          accountId: account.id,
          categoryId: category.id,
          amountMinor: '101',
          date: '2026-01-01T00:00:00Z',
          merchant: '=HYPERLINK("bad")',
          note: 'hello,"quoted"\nline',
        },
        token,
        key(),
      )
    ).status,
  ).toBe(201);
  return { account, category };
}
async function backupFor(token: string): Promise<Backup> {
  const result = await raw('export/backup', token);
  expect(result.status).toBe(200);
  return backupSchema.parse(await result.json());
}
async function preview(token: string, backup: Backup) {
  const response = await call('POST', 'import/preview', { backup }, token, key());
  expect(response.status).toBe(200);
  return previewResultSchema.parse(response.json.success ? response.json.data : null);
}

it('exports only owned actual finance records with no identities or authentication secrets', async () => {
  const user = await createUser();
  const other = await createUser('other@example.com');
  await fixture(user.accessToken);
  const empty = await backupFor(other.accessToken);
  expect(empty.accounts).toHaveLength(0);
  expect(empty.transactions).toHaveLength(0);
  const backup = await backupFor(user.accessToken);
  expect(backup.accounts).toHaveLength(1);
  expect(backup.categories).toHaveLength(1);
  expect(backup.transactions).toHaveLength(1);
  expect(backup.accounts[0]?.openingBalanceMinor).toBe('900719925474099301');
  const serialized = JSON.stringify(backup);
  for (const secret of [
    'userId',
    'passwordHash',
    'accessHash',
    'refreshHash',
    user.accessToken,
    user.refreshToken,
    user.user.email,
    user.user.id,
  ])
    expect(serialized).not.toContain(secret);
  expect((await raw('export/backup')).status).toBe(401);
  expect((await raw('export/backup?userId=anything', user.accessToken)).status).toBe(400);
});

it('quotes CSV, prevents spreadsheet formulas, supports filters and exact amounts, and rejects pagination', async () => {
  const user = await createUser();
  const other = await createUser('other@example.com');
  const { account } = await fixture(user.accessToken);
  const response = await raw(
    `export/transactions?accountId=${account.id}&minAmount=101`,
    user.accessToken,
  );
  expect(response.status).toBe(200);
  expect(response.headers.get('cache-control')).toBe('no-store');
  expect(response.headers.get('content-disposition')).toContain('.csv');
  const csv = await response.text();
  expect(csv).toContain('"\'=HYPERLINK(""bad"")"');
  expect(csv).toContain('"hello,""quoted""\nline"');
  expect(csv).toContain('"101"');
  expect(
    (await (await raw('export/transactions?minAmount=102', user.accessToken)).text())
      .trim()
      .split('\r\n'),
  ).toHaveLength(1);
  expect(
    (await (await raw('export/transactions', other.accessToken)).text()).trim().split('\r\n'),
  ).toHaveLength(1);
  expect((await raw('export/transactions?page=1', user.accessToken)).status).toBe(400);
  expect(
    (await raw('export/transactions?minAmount=200&maxAmount=1', user.accessToken)).status,
  ).toBe(400);
  for (const value of ['+cmd', '-1+2', '@SUM(1)', '\tcmd', '\r=cmd', '  =cmd'])
    expect(csvCell(value)).toContain('"\'');
});

it('previews and atomically merges a portable backup under server identity with replay-safe commits', async () => {
  const source = await createUser();
  const target = await createUser('target@example.com');
  await fixture(source.accessToken);
  const backup = await backupFor(source.accessToken);
  const proposed = await preview(target.accessToken, backup);
  expect(proposed.canImport).toBe(true);
  expect((await backupFor(target.accessToken)).transactions).toHaveLength(0);
  const input = {
    backup,
    ...proposed,
    canImport: undefined,
    mode: 'merge',
    confirmation: 'IMPORT',
  };
  const operation = key();
  const committed = await call('POST', 'import/commit', input, target.accessToken, operation);
  expect(committed.status).toBe(200);
  const replay = await call('POST', 'import/commit', input, target.accessToken, operation);
  expect(replay.status).toBe(200);
  expect(replay.json.success && replay.json.data).toEqual(
    committed.json.success && committed.json.data,
  );
  expect((await call('POST', 'import/commit', input, target.accessToken, key())).status).toBe(409);
  const restored = await backupFor(target.accessToken);
  expect(restored.transactions).toEqual(backup.transactions);
  expect(restored.accounts).toEqual(backup.accounts);
  const { db } = await database();
  expect(await db.collection('transactions').countDocuments({ userId: target.user.id })).toBe(1);
  expect(await db.collection('transactions').countDocuments({ userId: source.user.id })).toBe(1);
  const list = await call('GET', 'transactions?minAmount=101', undefined, target.accessToken);
  expect(list.status).toBe(200); // imported Decimal128 supports normal financial filters
  const second = await preview(target.accessToken, backup);
  const noop = await call(
    'POST',
    'import/commit',
    {
      backup,
      previewId: second.previewId,
      contentHash: second.contentHash,
      mode: 'merge',
      confirmation: 'IMPORT',
    },
    target.accessToken,
    key(),
  );
  expect(noop.status).toBe(200);
  expect(await db.collection('transactions').countDocuments({ userId: target.user.id })).toBe(1);
});

it('binds preview to owner and exact content and requires confirmation and merge mode', async () => {
  const source = await createUser();
  const target = await createUser('target@example.com');
  await fixture(source.accessToken);
  const backup = await backupFor(source.accessToken);
  const proposed = await preview(target.accessToken, backup);
  const input = {
    backup,
    previewId: proposed.previewId,
    contentHash: proposed.contentHash,
    mode: 'merge',
    confirmation: 'IMPORT',
  };
  expect((await call('POST', 'import/commit', input, source.accessToken, key())).status).toBe(409);
  const altered = structuredClone(backup);
  altered.accounts[0]!.openingBalanceMinor = '999';
  expect(
    (await call('POST', 'import/commit', { ...input, backup: altered }, target.accessToken, key()))
      .status,
  ).toBe(409);
  expect(
    (
      await call(
        'POST',
        'import/commit',
        { ...input, confirmation: 'yes' },
        target.accessToken,
        key(),
      )
    ).status,
  ).toBe(400);
  expect(
    (await call('POST', 'import/commit', { ...input, mode: 'replace' }, target.accessToken, key()))
      .status,
  ).toBe(400);
  expect((await call('POST', 'import/preview', { backup }, target.accessToken)).status).toBe(400);
  expect((await backupFor(target.accessToken)).accounts).toHaveLength(0);
});

it('rejects malicious schemas, duplicated IDs, incompatible references and currency mismatches', async () => {
  const user = await createUser();
  await fixture(user.accessToken);
  const backup = await backupFor(user.accessToken);
  for (const changed of [
    { ...backup, version: 999 },
    { ...backup, accounts: [{ ...backup.accounts[0], userId: randomUUID() }] },
    { ...backup, accounts: [backup.accounts[0], backup.accounts[0]] },
    { ...backup, categories: [] },
    { ...backup, transactions: [{ ...backup.transactions[0], amountMinor: '1e9' }] },
    { ...backup, transactions: [{ ...backup.transactions[0], accountId: randomUUID() }] },
    { ...backup, transactions: [{ ...backup.transactions[0], type: 'TRANSFER' }] },
  ])
    expect(
      (await call('POST', 'import/preview', { backup: changed }, user.accessToken, key())).status,
    ).toBe(400);
  const empty = await createUser('empty@example.com');
  const different = { ...(await backupFor(empty.accessToken)), currency: 'USD' };
  expect(
    (await call('POST', 'import/preview', { backup: different }, user.accessToken, key())).status,
  ).toBe(409);
});

it('rechecks conflicts at commit and leaves all finance records unchanged on failure', async () => {
  const source = await createUser();
  const target = await createUser('target@example.com');
  await fixture(source.accessToken);
  const backup = await backupFor(source.accessToken);
  const proposed = await preview(target.accessToken, backup);
  const { db } = await database();
  await db.collection('accounts').insertOne({
    ...backup.accounts[0],
    userId: target.user.id,
    name: 'Changed on another device',
  });
  expect(
    (
      await call(
        'POST',
        'import/commit',
        {
          backup,
          previewId: proposed.previewId,
          contentHash: proposed.contentHash,
          mode: 'merge',
          confirmation: 'IMPORT',
        },
        target.accessToken,
        key(),
      )
    ).status,
  ).toBe(409);
  expect(await db.collection('transactions').countDocuments({ userId: target.user.id })).toBe(0);
  expect(await db.collection('categories').countDocuments({ userId: target.user.id })).toBe(0);
  const nextPreview = await preview(target.accessToken, backup);
  expect(nextPreview.canImport).toBe(false);
});

it('round-trips budgets, goal contributions and confirmed recurring linkage', async () => {
  const source = await createUser();
  const target = await createUser('target@example.com');
  const { account, category } = await fixture(source.accessToken);
  expect(
    (
      await call(
        'POST',
        'budgets',
        { categoryId: category.id, month: '2026-01', amountMinor: '10000' },
        source.accessToken,
        key(),
      )
    ).status,
  ).toBe(201);
  const goalResult = await call(
    'POST',
    'goals',
    { name: 'Rainy day', targetMinor: '50000' },
    source.accessToken,
    key(),
  );
  const goal = goalSchema.parse(goalResult.json.success ? goalResult.json.data : null);
  expect(
    (
      await call(
        'POST',
        `goals/${goal.id}/contributions`,
        { amountMinor: '200', date: '2026-01-01', version: 1 },
        source.accessToken,
        key(),
      )
    ).status,
  ).toBe(201);
  expect(
    (
      await call(
        'POST',
        'recurring',
        {
          name: 'Rent',
          type: 'EXPENSE',
          accountId: account.id,
          categoryId: category.id,
          amountMode: 'FIXED',
          amountMinor: '300',
          postingPolicy: 'CONFIRM_EACH',
          startDate: '2026-01-01',
          endDate: '2026-01-01',
          frequency: 'MONTHLY',
        },
        source.accessToken,
        key(),
      )
    ).status,
  ).toBe(201);
  expect((await call('POST', 'recurring/generate', {}, source.accessToken, key())).status).toBe(
    200,
  );
  const occurrenceResult = await call(
    'GET',
    'recurring-occurrences',
    undefined,
    source.accessToken,
  );
  const occurrences = z
    .array(recurringOccurrenceSchema)
    .parse(occurrenceResult.json.success ? occurrenceResult.json.data : null);
  expect(occurrences).toHaveLength(1);
  expect(
    (
      await call(
        'POST',
        `recurring-occurrences/${occurrences[0]!.id}/confirm`,
        { version: 1, amountMinor: '300', date: '2026-01-01T10:00:00+05:30' },
        source.accessToken,
        key(),
      )
    ).status,
  ).toBe(200);
  const backup = await backupFor(source.accessToken);
  expect(backup.budgets).toHaveLength(1);
  expect(backup.contributions).toHaveLength(1);
  expect(backup.recurringOccurrences[0]?.status).toBe('POSTED');
  expect(
    (
      await call(
        'POST',
        'import/preview',
        { backup: { ...backup, recurringRules: [] } },
        target.accessToken,
        key(),
      )
    ).status,
  ).toBe(400);
  const proposed = await preview(target.accessToken, backup);
  expect(
    (
      await call(
        'POST',
        'import/commit',
        {
          backup,
          previewId: proposed.previewId,
          contentHash: proposed.contentHash,
          mode: 'merge',
          confirmation: 'IMPORT',
        },
        target.accessToken,
        key(),
      )
    ).status,
  ).toBe(200);
  const restored = await backupFor(target.accessToken);
  expect(restored.recurringOccurrences).toEqual(backup.recurringOccurrences);
  expect(restored.contributions).toEqual(backup.contributions);
  const duplicateBudget = { ...backup, budgets: [{ ...backup.budgets[0]!, id: randomUUID() }] };
  expect((await preview(target.accessToken, duplicateBudget)).canImport).toBe(false);
});

it('bounds streamed import bodies, rejects malformed JSON and expired previews', async () => {
  const user = await createUser();
  const backup = await backupFor(user.accessToken);
  const proposed = await preview(user.accessToken, backup);
  const { db } = await database();
  await db
    .collection('import_previews')
    .updateOne(
      { userId: user.user.id, id: proposed.previewId },
      { $set: { expiresAt: new Date(0) } },
    );
  expect(
    (
      await call(
        'POST',
        'import/commit',
        {
          backup,
          previewId: proposed.previewId,
          contentHash: proposed.contentHash,
          mode: 'merge',
          confirmation: 'IMPORT',
        },
        user.accessToken,
        key(),
      )
    ).status,
  ).toBe(409);
  const headers = {
    Authorization: `Bearer ${user.accessToken}`,
    'Content-Type': 'application/json',
    ...key(),
  };
  expect(
    (
      await POST(
        new Request('http://localhost:3000/api/v1/import/preview', {
          method: 'POST',
          headers,
          body: 'x'.repeat(2 * 1024 * 1024 + 1),
        }),
      )
    ).status,
  ).toBe(413);
  expect(
    (
      await POST(
        new Request('http://localhost:3000/api/v1/import/preview', {
          method: 'POST',
          headers,
          body: '{',
        }),
      )
    ).status,
  ).toBe(400);
  expect(
    (
      await POST(
        new Request('http://localhost:3000/api/v1/import/preview', {
          method: 'POST',
          headers: { ...headers, 'Content-Type': 'text/plain' },
          body: '{}',
        }),
      )
    ).status,
  ).toBe(415);
});

it('rechecks current currency when settings changed after the session context was read', async () => {
  const user = await createUser();
  const backup = await backupFor(user.accessToken);
  const proposed = await preview(user.accessToken, backup);
  const context = await authenticate(
    new Request('http://localhost:3000', {
      headers: { Authorization: `Bearer ${user.accessToken}` },
    }),
  );
  expect(
    (
      await call(
        'PATCH',
        'settings',
        { preferences: { ...user.user.preferences, baseCurrency: 'USD' }, version: 1 },
        user.accessToken,
        key(),
      )
    ).status,
  ).toBe(200);
  const mutation = () =>
    new Request('http://localhost:3000/api/v1/import/commit', { method: 'POST', headers: key() });
  await expect(previewImport(context, mutation(), backup)).rejects.toMatchObject({ status: 409 });
  await expect(
    commitImport(context, mutation(), {
      backup,
      previewId: proposed.previewId,
      contentHash: proposed.contentHash,
      mode: 'merge',
      confirmation: 'IMPORT',
    }),
  ).rejects.toMatchObject({ status: 409 });
  expect((await backupFor(user.accessToken)).currency).toBe('USD');
});
