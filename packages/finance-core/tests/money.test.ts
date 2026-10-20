import { describe, expect, it } from 'vitest';
import {
  accountBalance,
  calendarDate,
  cashflow,
  formatMoney,
  nextOccurrence,
  parseMoney,
  progress,
} from '../src/index';

describe('exact money', () => {
  it('supports 0, 2 and 3 decimal currencies without rounding', () => {
    expect(parseMoney('10.50', 'USD')).toBe('1050');
    expect(parseMoney('250.75', 'INR')).toBe('25075');
    expect(parseMoney('900', 'JPY')).toBe('900');
    expect(parseMoney('1.123', 'KWD')).toBe('1123');
    expect(() => parseMoney('1.1', 'JPY')).toThrow();
    expect(() => parseMoney('NaN', 'USD')).toThrow();
    expect(() => parseMoney('1e3', 'USD')).toThrow();
  });
  it('preserves amounts beyond Number safe integer limits', () => {
    expect(parseMoney('9007199254740993.01', 'USD')).toBe('900719925474099301');
    expect(formatMoney('900719925474099301', 'USD', 'en-US')).toBe('$9,007,199,254,740,993.01');
    expect(formatMoney('-1', 'USD', 'en-US')).toBe('-$0.01');
  });
});

describe('ledger invariants', () => {
  const entries = [
    { id: '1', type: 'INCOME', accountId: 'a', amountMinor: '10000', currency: 'USD' },
    { id: '2', type: 'EXPENSE', accountId: 'a', amountMinor: '2500', currency: 'USD' },
    {
      id: '3',
      type: 'TRANSFER',
      accountId: 'a',
      destinationAccountId: 'b',
      amountMinor: '3000',
      currency: 'USD',
    },
  ] as const;
  it('income/expense affect balances and transfers conserve total', () => {
    expect(accountBalance('1000', 'a', 'USD', entries)).toBe('5500');
    expect(accountBalance('0', 'b', 'USD', entries)).toBe('3000');
    expect(cashflow(entries)).toEqual({
      incomeMinor: '10000',
      expensesMinor: '2500',
      netMinor: '7500',
      savingsRateBasisPoints: 7500,
    });
    expect(cashflow([]).savingsRateBasisPoints).toBeNull();
  });
  it('rejects duplicates, nonpositive amounts, mixed currency and self transfers', () => {
    expect(() => accountBalance('0', 'a', 'USD', [entries[0], entries[0]])).toThrow();
    for (const amountMinor of ['0', '-1'])
      expect(() => cashflow([{ ...entries[0], amountMinor }])).toThrow();
    expect(() => accountBalance('0', 'a', 'INR', entries)).toThrow();
    expect(() =>
      accountBalance('0', 'a', 'USD', [{ ...entries[2], destinationAccountId: 'a' }]),
    ).toThrow();
  });
  it('calculates goal and budget progress in integer basis points', () => {
    expect(progress('40000', '27500')).toEqual({
      remainingMinor: '12500',
      basisPoints: 6875,
      complete: false,
    });
    expect(progress('100', '125').remainingMinor).toBe('-25');
    expect(() => progress('0', '1')).toThrow();
  });
});

describe('calendar rules', () => {
  it('groups UTC timestamps by the user calendar', () => {
    const instant = new Date('2026-10-01T00:10:00Z');
    expect(calendarDate(instant, 'America/Los_Angeles')).toBe('2026-09-30');
    expect(calendarDate(instant, 'Asia/Kolkata')).toBe('2026-10-01');
  });
  it('clamps month-end without losing the original anchor', () => {
    expect(nextOccurrence('2024-01-31', 'MONTHLY', 1)).toBe('2024-02-29');
    expect(nextOccurrence('2024-01-31', 'MONTHLY', 2)).toBe('2024-03-31');
    expect(nextOccurrence('2024-02-29', 'YEARLY', 1)).toBe('2025-02-28');
    expect(nextOccurrence('2026-12-31', 'DAILY', 1)).toBe('2027-01-01');
    expect(() => nextOccurrence('2026-02-30', 'MONTHLY', 1)).toThrow();
  });
});
