import { randomUUID } from 'node:crypto';
import { beforeAll, beforeEach, afterAll, expect, it } from 'vitest';
import { transactionInputSchema, transactionSchema } from '@finora/contracts';
import { dispatch } from '../src/router';
import { database } from '../src/database/client';
import { call, clearDatabase, setupDatabase, teardownDatabase } from './setup';
import { fixture } from './advanced-fixtures';
import { ApiClient, ClientError } from '../../mobile/src/api/client';
import { drainOutbox, enqueue, queuedTransactionSchema } from '../../mobile/src/storage/outbox';
import { testVault } from '../../mobile/tests/vault-fixture';

beforeAll(setupDatabase);
beforeEach(clearDatabase);
afterAll(teardownDatabase);
it('reconciles a save whose response was lost without recording it twice', async () => {
  const { token, account, expense } = await fixture();
  const owner = (await database()).users;
  const user = await owner.findOne({ email: 'one@example.com' });
  if (!user) throw new Error('Missing fixture');
  const { vault, rows } = testVault(user.id);
  const key = randomUUID();
  const body = transactionInputSchema.parse({
    type: 'EXPENSE',
    accountId: account.id,
    categoryId: expense.id,
    amountMinor: '900719925474099301',
    date: '2026-01-01T12:00:00Z',
  });
  let drop = true;
  const api = new ApiClient(
    'https://offline.test',
    {
      get: async () => ({ accessToken: token, refreshToken: 'b'.repeat(43) }),
      set: async () => undefined,
      clear: async () => undefined,
    },
    () => undefined,
    async (url, options) => {
      const response = await dispatch(new Request(url, options));
      if (drop && options?.method === 'POST' && response.status === 201) {
        drop = false;
        throw new Error('Connection lost after commit');
      }
      return response;
    },
  );
  await expect(
    api.request('transactions', transactionSchema, { method: 'POST', body, operationKey: key }),
  ).rejects.toMatchObject({ code: 'NETWORK' });
  await enqueue(vault, key, body);
  await vault.close();
  const restored = testVault(user.id, rows).vault;
  expect(await drainOutbox(restored, api, () => true)).toBe(1);
  expect(await restored.list('pending:', queuedTransactionSchema)).toHaveLength(0);
  const { db } = await database();
  expect(await db.collection('transactions').countDocuments({ userId: user.id })).toBe(1);
  const result = await call<{ balanceMinor: string }>(
    'GET',
    `accounts/${account.id}`,
    undefined,
    token,
  );
  expect(result.json.success && result.json.data.balanceMinor).toBe('-900719925474099301');
});
it('retains rejected or disconnected entries and stops when the user changes', async () => {
  const owner = randomUUID();
  const { vault } = testVault(owner);
  const key = randomUUID();
  const body = transactionInputSchema.parse({
    type: 'EXPENSE',
    accountId: randomUUID(),
    categoryId: randomUUID(),
    amountMinor: '100',
    date: '2026-01-01T12:00:00Z',
  });
  await Promise.all([enqueue(vault, key, body), enqueue(vault, key, body)]);
  expect(await vault.list('pending:', queuedTransactionSchema)).toHaveLength(1);
  await expect(enqueue(vault, key, { ...body, amountMinor: '200' })).rejects.toThrow('different');
  const rejected = new ApiClient(
    'https://offline.test',
    {
      get: async () => ({ accessToken: 'a'.repeat(43), refreshToken: 'b'.repeat(43) }),
      set: async () => undefined,
      clear: async () => undefined,
    },
    () => undefined,
    async () =>
      Response.json(
        {
          success: false,
          error: { code: 'INVALID_ACCOUNT', message: 'Choose an active account.' },
        },
        { status: 400 },
      ),
  );
  expect(await drainOutbox(vault, rejected, () => false)).toBe(0);
  expect((await vault.list('pending:', queuedTransactionSchema))[0]?.value.state).toBe('PENDING');
  expect(await drainOutbox(vault, rejected, () => true)).toBe(0);
  expect((await vault.list('pending:', queuedTransactionSchema))[0]?.value).toMatchObject({
    state: 'ATTENTION',
    code: 'INVALID_ACCOUNT',
  });
  await vault.write(`pending:${key}`, {
    ...(await vault.list('pending:', queuedTransactionSchema))[0]!.value,
    state: 'PENDING',
  });
  const disconnected = new ApiClient(
    'https://offline.test',
    {
      get: async () => ({ accessToken: 'a'.repeat(43), refreshToken: 'b'.repeat(43) }),
      set: async () => undefined,
      clear: async () => undefined,
    },
    () => undefined,
    async () => {
      throw new ClientError('NETWORK', 'Offline');
    },
  );
  await drainOutbox(vault, disconnected, () => true);
  expect((await vault.list('pending:', queuedTransactionSchema))[0]?.value.state).toBe('PENDING');
  await vault.close(true);
  expect(await testVault(owner).vault.list('pending:', queuedTransactionSchema)).toHaveLength(0);
});
