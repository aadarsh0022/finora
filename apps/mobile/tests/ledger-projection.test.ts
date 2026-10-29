import type { ApiClient } from '../src/api/client';
import { expect, it } from 'vitest';
import { deviceLedgerSchema, userSchema } from '@finora/contracts';
import { projectDeviceLedger, readDeviceLedger, refreshDeviceLedger } from '../src/storage/ledger';
import { queuedTransactionSchema } from '../src/storage/outbox';
import { testVault } from './vault-fixture';
const owner = '11111111-1111-4111-8111-111111111111';
const first = '22222222-2222-4222-8222-222222222222';
const second = '33333333-3333-4333-8333-333333333333';
const id = '44444444-4444-4444-8444-444444444444';
const stamp = '2026-10-29T10:00:00.000Z';
const user = userSchema.parse({
  id: owner,
  name: 'Test',
  email: 'test@example.com',
  preferences: {},
  createdAt: stamp,
  updatedAt: stamp,
});
const snapshot = deviceLedgerSchema.parse({
  revision: 1,
  complete: true,
  categories: [],
  transactions: [],
  accounts: [first, second].map((accountId) => ({
    id: accountId,
    userId: owner,
    name: 'Account',
    type: 'CHECKING',
    currency: 'INR',
    icon: 'wallet',
    color: '#123456',
    openingBalanceMinor: '900719925474099301',
    balanceMinor: '900719925474099301',
    archived: false,
    version: 1,
    createdAt: stamp,
    updatedAt: stamp,
  })),
});
const pending = queuedTransactionSchema.parse({
  id,
  ownerId: owner,
  state: 'PENDING',
  createdAt: stamp,
  body: {
    type: 'TRANSFER',
    accountId: first,
    destinationAccountId: second,
    amountMinor: '900719925474099300',
    date: stamp,
  },
});
it('projects local transfers immediately with exact arithmetic and conserves the total', () => {
  const projected = projectDeviceLedger(
    snapshot,
    [pending],
    'accounts',
    user,
  ) as typeof snapshot.accounts;
  expect(projected.map((account) => account.balanceMinor)).toEqual(['1', '1801439850948198601']);
  expect(projected.reduce((sum, account) => sum + BigInt(account.balanceMinor), 0n)).toBe(
    1801439850948198602n,
  );
  expect(
    projectDeviceLedger(snapshot, [{ ...pending, ownerId: second }], 'accounts', user),
  ).toEqual(snapshot.accounts);
});
it('does not apply a local delta again when the server already committed the same operation', () => {
  const committed = {
    ...pending.body,
    id,
    userId: owner,
    currency: 'INR',
    version: 1,
    createdAt: stamp,
    updatedAt: stamp,
  };
  const baseline = deviceLedgerSchema.parse({ ...snapshot, transactions: [committed] });
  expect(projectDeviceLedger(baseline, [pending], 'accounts', user)).toEqual(snapshot.accounts);
});
it('stores complete ledger generations in bounded pages and retains acknowledged entries until handoff', async () => {
  const { vault } = testVault(owner);
  const api: Pick<ApiClient, 'request'> = {
    request: async (_path, schema) => schema.parse(snapshot),
  };
  await refreshDeviceLedger(vault, api, () => true);
  expect((await readDeviceLedger(vault))?.value).toEqual(snapshot);
  const stale = { ...snapshot, revision: 0 };
  await refreshDeviceLedger(
    vault,
    { request: async (_path, schema) => schema.parse(stale) },
    () => true,
  );
  expect((await readDeviceLedger(vault))?.value.revision).toBe(1);
  await vault.close();
});
