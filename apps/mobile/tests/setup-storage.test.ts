import { expect, it } from 'vitest';
const randomUUID = () => crypto.randomUUID();
import { userSchema } from '@finora/contracts';
import { testVault } from './vault-fixture';
import { saveSetup, readSetup, drainSetup } from '../src/storage/setup';
import type { ApiClient } from '../src/api/client';
const user = userSchema.parse({
  id: randomUUID(),
  name: 'Demo',
  email: 'demo@example.com',
  preferences: {},
  createdAt: '2026-10-24T00:00:00.000Z',
  updatedAt: '2026-10-24T00:00:00.000Z',
});
it('keeps setup across vault closure and a failed server attempt without duplicating account identity', async () => {
  const { vault, rows } = testVault(user.id);
  const body = {
    baseline: user.preferences,
    preferences: user.preferences,
    account: {
      id: randomUUID(),
      name: 'Everyday',
      type: 'CASH' as const,
      openingBalanceMinor: '12550',
      icon: 'wallet',
      color: '#187A5A',
    },
  };
  const saved = await saveSetup(vault, user, randomUUID(), body);
  await vault.close();
  const reopened = testVault(user.id, rows).vault;
  const failures: Pick<ApiClient, 'request'> = {
    request: async () => {
      throw new Error('Offline');
    },
  };
  await expect(drainSetup(reopened, failures, () => true)).rejects.toThrow('Offline');
  expect(await readSetup(reopened)).toEqual(saved);
  expect(await saveSetup(reopened, user, randomUUID(), body)).toEqual(saved);
  let calls = 0;
  const api: Pick<ApiClient, 'request'> = {
    request: async (_path, schema, options) => {
      calls++;
      expect(options?.operationKey).toBe(saved.id);
      return schema.parse({
        user: saved.user,
        account: saved.account,
        settings: { preferences: saved.user.preferences, version: 2 },
      });
    },
  };
  await drainSetup(reopened, api, () => true);
  await drainSetup(reopened, api, () => true);
  expect(calls).toBe(1);
  expect(await readSetup(reopened)).toBeUndefined();
  expect(rows.has('read:accounts')).toBe(true);
});
it('never drains records after the active owner changes', async () => {
  const { vault } = testVault(user.id);
  await saveSetup(vault, user, randomUUID(), {
    baseline: user.preferences,
    preferences: user.preferences,
  });
  const api: Pick<ApiClient, 'request'> = {
    request: async () => {
      throw new Error('Must not send');
    },
  };
  expect(await drainSetup(vault, api, () => false)).toBeUndefined();
  expect(await readSetup(vault)).toBeDefined();
});
