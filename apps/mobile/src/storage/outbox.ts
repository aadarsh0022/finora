import { z } from 'zod';
import {
  transactionInputSchema,
  transactionSchema,
  type TransactionInput,
} from '@finora/contracts';
import { ClientError, type ApiClient } from '../api/client';
import type { DeviceVault } from './vault';

export const queuedTransactionSchema = z
  .object({
    id: z.uuid(),
    ownerId: z.uuid(),
    body: transactionInputSchema,
    state: z.enum(['PENDING', 'ATTENTION']),
    createdAt: z.iso.datetime(),
    code: z.string().max(80).default(''),
  })
  .strict();
export type QueuedTransaction = z.infer<typeof queuedTransactionSchema>;
export const canUseOffline = (error: unknown) =>
  error instanceof ClientError && ['NETWORK', 'TIMEOUT'].includes(error.code);

const enqueueFlights = new WeakMap<DeviceVault, Promise<unknown>>();
export async function enqueue(vault: DeviceVault, id: string, body: TransactionInput) {
  const next = (enqueueFlights.get(vault) ?? Promise.resolve())
    .catch(() => undefined)
    .then(() => enqueueOne(vault, id, body));
  enqueueFlights.set(vault, next);
  return next;
}
async function enqueueOne(vault: DeviceVault, id: string, body: TransactionInput) {
  const rows = await vault.list('pending:', queuedTransactionSchema);
  const existing = rows.find((r) => r.value.id === id)?.value;
  if (existing) {
    if (
      existing.ownerId !== vault.ownerId ||
      JSON.stringify(existing.body) !== JSON.stringify(body)
    )
      throw new Error('This operation is already queued with different details.');
    return existing;
  }
  if (rows.length >= 100)
    throw new Error('Sync or resolve your 100 pending transactions before adding more.');
  const record = queuedTransactionSchema.parse({
    id,
    ownerId: vault.ownerId,
    body,
    state: 'PENDING',
    createdAt: new Date().toISOString(),
    code: '',
  });
  await vault.write(`pending:${id}`, record);
  return record;
}

export async function drainOutbox(
  vault: DeviceVault,
  api: Pick<ApiClient, 'request'>,
  isCurrent: () => boolean,
) {
  let synced = 0;
  const rows = await vault.list('pending:', queuedTransactionSchema);
  for (const { key, value } of rows) {
    if (!isCurrent()) break;
    if (value.ownerId !== vault.ownerId)
      throw new Error('Pending entries belong to another account.');
    if (value.state !== 'PENDING') continue;
    try {
      await api.request('transactions', transactionSchema, {
        method: 'POST',
        body: value.body,
        operationKey: value.id,
      });
      if (!isCurrent()) break;
      await vault.remove(key);
      synced++;
    } catch (error) {
      if (
        !isCurrent() ||
        canUseOffline(error) ||
        !(error instanceof ClientError) ||
        error.status === 401 ||
        error.status === 429 ||
        error.status >= 500 ||
        error.code === 'CANCELLED'
      )
        break;
      await vault.write(key, { ...value, state: 'ATTENTION', code: error.code });
    }
  }
  return synced;
}
