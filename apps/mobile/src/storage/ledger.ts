import { z } from 'zod';
import {
  deviceLedgerSchema,
  transactionSchema,
  transactionFilterSchema,
  type DeviceLedger,
  type User,
} from '@finora/contracts';
import { accountBalance, calendarDate, cashflow } from '@finora/finance-core';
import type { ApiClient } from '../api/client';
import type { DeviceVault } from './vault-core';
import { queuedTransactionSchema, type QueuedTransaction } from './outbox';
const ledgerHeadSchema = deviceLedgerSchema
  .omit({ transactions: true })
  .extend({ generation: z.string().min(1).max(100), pages: z.number().int().min(0).max(50) });
const ledgerPageSchema = z.array(transactionSchema).max(200);
export async function readDeviceLedger(vault: DeviceVault) {
  for (let attempt = 0; attempt < 2; attempt++) {
    const head = await vault.read('ledger-head', ledgerHeadSchema, Infinity);
    if (!head) return vault.read('ledger', deviceLedgerSchema, Infinity);
    const transactions: DeviceLedger['transactions'] = [];
    let complete = true;
    for (let index = 0; index < head.value.pages; index++) {
      const page = await vault.read(
        `ledger-page:${head.value.generation}:${index}`,
        ledgerPageSchema,
        Infinity,
      );
      if (!page) {
        complete = false;
        break;
      }
      transactions.push(...page.value);
    }
    if (complete)
      return {
        value: deviceLedgerSchema.parse({ ...head.value, transactions }),
        updated: head.updated,
      };
  }
  throw new Error('Your saved records could not be loaded. Reopen the app and try again.');
}
async function writeDeviceLedger(vault: DeviceVault, snapshot: DeviceLedger) {
  const generation = `${snapshot.revision}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const pages = Math.ceil(snapshot.transactions.length / 200);
  for (let index = 0; index < pages; index++)
    await vault.write(
      `ledger-page:${generation}:${index}`,
      snapshot.transactions.slice(index * 200, (index + 1) * 200),
    );
  const header = deviceLedgerSchema.omit({ transactions: true }).parse(snapshot);
  await vault.write('ledger-head', { ...header, generation, pages });
  // Commit the complete generation before removing the previous one. Readers retry a changed head.
  for (const row of await vault.list('ledger-page:', ledgerPageSchema))
    if (!row.key.startsWith(`ledger-page:${generation}:`)) await vault.remove(row.key);
  await vault.remove('ledger');
}
const refreshes = new WeakMap<DeviceVault, Promise<void>>();
export function refreshDeviceLedger(
  vault: DeviceVault,
  api: Pick<ApiClient, 'request'>,
  isCurrent: () => boolean,
) {
  const current = refreshes.get(vault);
  if (current) return current;
  const flight = (async () => {
    const snapshot = await api.request('sync/ledger', deviceLedgerSchema);
    if (!isCurrent()) return;
    const previous = await readDeviceLedger(vault);
    if (previous && previous.value.revision > snapshot.revision) return;
    await writeDeviceLedger(vault, snapshot);
    const ids = new Set(snapshot.transactions.map((entry) => entry.id));
    for (const row of await vault.list('pending:', queuedTransactionSchema))
      if (
        row.value.state === 'ACKNOWLEDGED' &&
        row.value.serverTransaction &&
        ids.has(row.value.serverTransaction.id)
      )
        await vault.remove(row.key);
  })().finally(() => {
    if (refreshes.get(vault) === flight) refreshes.delete(vault);
  });
  refreshes.set(vault, flight);
  return flight;
}
export function projectDeviceLedger(
  snapshot: DeviceLedger,
  pending: QueuedTransaction[],
  path: string,
  user: User,
) {
  const url = new URL(path, 'https://local.invalid/');
  const ids = new Set(snapshot.transactions.map((entry) => entry.id));
  const local = pending
    .filter(
      (entry) =>
        entry.ownerId === user.id &&
        !ids.has(entry.id) &&
        (!entry.serverTransaction || !ids.has(entry.serverTransaction.id)),
    )
    .map(
      (entry) =>
        entry.serverTransaction ??
        transactionSchema.parse({
          ...entry.body,
          id: entry.id,
          userId: user.id,
          currency: user.preferences.baseCurrency,
          version: 1,
          createdAt: entry.createdAt,
          updatedAt: entry.createdAt,
        }),
    );
  const accounts = snapshot.accounts.map((account) => ({
    ...account,
    balanceMinor: accountBalance(account.balanceMinor, account.id, account.currency, local),
  }));
  const transactions = [...snapshot.transactions, ...local];
  const pathname = url.pathname.slice(1);
  if (pathname === 'accounts')
    return url.searchParams.get('includeArchived') === 'true'
      ? accounts
      : accounts.filter((entry) => !entry.archived);
  if (pathname.startsWith('accounts/'))
    return accounts.find((entry) => entry.id === pathname.slice(9));
  if (pathname === 'categories')
    return url.searchParams.get('includeArchived') === 'true'
      ? snapshot.categories
      : snapshot.categories.filter((entry) => !entry.archived);
  if (pathname.startsWith('transactions/'))
    return (
      transactions.find((entry) => entry.id === pathname.slice(13)) ??
      pending.find((entry) => entry.id === pathname.slice(13))?.serverTransaction
    );
  if (pathname === 'transactions') {
    const filters = transactionFilterSchema.parse(Object.fromEntries(url.searchParams));
    const term = filters.q?.toLowerCase();
    const filtered = transactions.filter(
      (entry) =>
        (!filters.type || entry.type === filters.type) &&
        (!filters.accountId ||
          entry.accountId === filters.accountId ||
          entry.destinationAccountId === filters.accountId) &&
        (!filters.categoryId || entry.categoryId === filters.categoryId) &&
        (!filters.from || Date.parse(entry.date) >= Date.parse(filters.from)) &&
        (!filters.to || Date.parse(entry.date) <= Date.parse(filters.to)) &&
        (!filters.minAmount || BigInt(entry.amountMinor) >= BigInt(filters.minAmount)) &&
        (!filters.maxAmount || BigInt(entry.amountMinor) <= BigInt(filters.maxAmount)) &&
        (!term || `${entry.merchant}\n${entry.note}`.toLowerCase().includes(term)),
    );
    filtered.sort((a, b) => {
      if (filters.sort === 'highest' || filters.sort === 'lowest') {
        const delta = BigInt(a.amountMinor) - BigInt(b.amountMinor);
        return (
          (delta < 0n ? -1 : delta > 0n ? 1 : a.id.localeCompare(b.id)) *
          (filters.sort === 'highest' ? -1 : 1)
        );
      }
      return (
        (a.date.localeCompare(b.date) || a.id.localeCompare(b.id)) *
        (filters.sort === 'newest' ? -1 : 1)
      );
    });
    return {
      items: filtered.slice((filters.page - 1) * filters.pageSize, filters.page * filters.pageSize),
      total: filtered.length,
      page: filters.page,
      pageSize: filters.pageSize,
    };
  }
  if (pathname === 'reports/overview') {
    const month =
      url.searchParams.get('month') ??
      calendarDate(new Date(), user.preferences.timezone).slice(0, 7);
    const entries = transactions.filter((entry) =>
      calendarDate(new Date(entry.date), user.preferences.timezone).startsWith(month),
    );
    const categorySpending: Record<string, string> = {};
    for (const entry of entries)
      if (entry.type === 'EXPENSE' && entry.categoryId)
        categorySpending[entry.categoryId] = (
          BigInt(categorySpending[entry.categoryId] ?? '0') + BigInt(entry.amountMinor)
        ).toString();
    return {
      month,
      timezone: user.preferences.timezone,
      currency: user.preferences.baseCurrency,
      totalBalanceMinor: accounts
        .reduce((sum, account) => sum + BigInt(account.balanceMinor), 0n)
        .toString(),
      ...cashflow(entries),
      accounts,
      categorySpending,
      recentTransactions: transactions
        .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id))
        .slice(0, 5),
    };
  }
  return undefined;
}
