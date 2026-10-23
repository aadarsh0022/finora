import { expect, it } from 'vitest';
import { accountBalance, debtLedgerEntries, debtProgress } from '../src/index';

it('conserves principal and cash in both directions using exact integers', () => {
  for (const direction of ['BORROWED', 'LENT'] as const) {
    const events = [
      {
        id: 'one',
        kind: 'PRINCIPAL' as const,
        direction,
        amountMinor: '900719925474099301',
        accountId: 'cash',
        currency: 'INR' as const,
      },
      {
        id: 'two',
        kind: 'REPAYMENT' as const,
        direction,
        amountMinor: '101',
        accountId: 'cash',
        currency: 'INR' as const,
      },
    ];
    expect(debtProgress(events[0]!.amountMinor, events)).toEqual({
      repaidMinor: '101',
      remainingMinor: '900719925474099200',
      complete: false,
    });
    expect(accountBalance('0', 'cash', 'INR', debtLedgerEntries(events))).toBe(
      `${direction === 'LENT' ? '-' : ''}900719925474099200`,
    );
    expect(
      debtLedgerEntries(events.map((e) => ({ ...e, reversedAt: '2026-01-01T00:00:00Z' }))),
    ).toEqual([]);
    expect(() => debtProgress('100', events)).toThrow('exceed');
    expect(() => debtProgress('1000', [events[1]!, events[1]!])).toThrow('Duplicate');
  }
});
