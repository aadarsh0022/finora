import { z } from 'zod';
import {
  accountSchema,
  settingsSchema,
  onboardingSyncSchema,
  onboardingSyncResultSchema,
  userSchema,
  type User,
} from '@finora/contracts';
import type { DeviceVault } from './vault-core';
import type { ApiClient } from '../api/client';

export const localSetupSchema = z
  .object({
    id: z.uuid(),
    ownerId: z.uuid(),
    body: onboardingSyncSchema,
    user: userSchema,
    account: accountSchema.optional(),
    state: z.enum(['PENDING', 'ACKNOWLEDGED']),
    settings: settingsSchema.optional(),
  })
  .strict();
export type LocalSetup = z.infer<typeof localSetupSchema>;
const key = 'setup:current';
export async function readSetup(vault: DeviceVault) {
  // Pending writes never expire and must never be silently discarded as stale snapshots.
  const row = (await vault.list('setup:', localSetupSchema)).find((row) => row.key === key);
  if (row && row.value.ownerId !== vault.ownerId)
    throw new Error('Local setup belongs to another account.');
  return row?.value;
}
export async function saveSetup(
  vault: DeviceVault,
  user: User,
  id: string,
  body: z.infer<typeof onboardingSyncSchema>,
) {
  if (user.id !== vault.ownerId) throw new Error('Local session changed.');
  const existing = await readSetup(vault);
  if (existing) return existing;
  const input = onboardingSyncSchema.parse(body);
  const now = new Date().toISOString();
  const record = localSetupSchema.parse({
    id,
    ownerId: user.id,
    body: input,
    state: 'PENDING',
    user: {
      ...user,
      preferences: input.preferences,
      onboardingCompletedAt: user.onboardingCompletedAt ?? now,
    },
    account: input.account
      ? {
          ...input.account,
          userId: user.id,
          currency: input.preferences.baseCurrency,
          archived: false,
          version: 1,
          createdAt: now,
          updatedAt: now,
        }
      : undefined,
  });
  await vault.write(key, record);
  return record;
}
export async function drainSetup(
  vault: DeviceVault,
  api: Pick<ApiClient, 'request'>,
  isCurrent: () => boolean,
) {
  let record = await readSetup(vault);
  if (!record || !isCurrent()) return undefined;
  if (record.state === 'PENDING') {
    const result = await api.request('onboarding/sync', onboardingSyncResultSchema, {
      method: 'POST',
      body: record.body,
      operationKey: record.id,
    });
    if (!isCurrent()) return undefined;
    record = localSetupSchema.parse({
      ...record,
      state: 'ACKNOWLEDGED',
      user: result.user,
      account: result.account,
      settings: result.settings,
    });
    // Save the receipt before updating projections. A crash can replay the same operation safely.
    await vault.write(key, record);
  }
  if (record.settings) await vault.write('read:settings', record.settings);
  await vault.write('profile', { schemaVersion: 1, user: record.user });
  if (record.account) {
    const account = { ...record.account, balanceMinor: record.account.openingBalanceMinor };
    await vault.write('read:accounts?includeArchived=true', [account]);
    await vault.write('read:accounts', [account]);
  }
  await vault.remove(key);
  return record.user;
}
export function setupProjection(record: LocalSetup, path: string) {
  if (path === 'settings') return { preferences: record.user.preferences, version: 1 };
  if (path === 'accounts' || path === 'accounts?includeArchived=true')
    return record.account
      ? [{ ...record.account, balanceMinor: record.account.openingBalanceMinor }]
      : undefined;
  return undefined;
}
