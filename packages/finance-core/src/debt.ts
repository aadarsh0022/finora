import type { LedgerEntry } from './index';

export interface PrincipalEvent {
  id: string;
  kind: 'PRINCIPAL' | 'REPAYMENT';
  direction: 'BORROWED' | 'LENT';
  amountMinor: string;
  accountId?: string;
  currency: LedgerEntry['currency'];
  reversedAt?: string;
}

// This adapter is for account balances only, never income/spending aggregation.
export function debtLedgerEntries(events: readonly PrincipalEvent[]): LedgerEntry[] {
  return events
    .filter((e) => e.accountId && !e.reversedAt)
    .map((e) => ({
      id: `debt:${e.id}`,
      accountId: e.accountId!,
      currency: e.currency,
      amountMinor: e.amountMinor,
      type: (e.direction === 'BORROWED') === (e.kind === 'PRINCIPAL') ? 'INCOME' : 'EXPENSE',
    }));
}

export function debtProgress(principal: string, events: readonly PrincipalEvent[]) {
  const amount = BigInt(principal);
  if (amount <= 0n) throw new Error('Principal must be positive');
  const ids = new Set<string>();
  let repaid = 0n;
  for (const event of events) {
    if (ids.has(event.id)) throw new Error('Duplicate debt event');
    ids.add(event.id);
    if (BigInt(event.amountMinor) <= 0n) throw new Error('Debt amounts must be positive');
    if (event.kind === 'REPAYMENT' && !event.reversedAt) repaid += BigInt(event.amountMinor);
  }
  if (repaid > amount) throw new Error('Repayments exceed principal');
  return {
    repaidMinor: repaid.toString(),
    remainingMinor: (amount - repaid).toString(),
    complete: repaid === amount,
  };
}
