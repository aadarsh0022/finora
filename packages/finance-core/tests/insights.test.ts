import { expect, it } from 'vitest';
import { spendingInsights } from '../src/index';
it('compares matched elapsed days and ignores future, income and transfer entries', () => {
  const result = spendingInsights(
    [
      { type: 'EXPENSE', amountMinor: '900719925474099301', day: '2026-10-23', categoryId: 'food' },
      { type: 'EXPENSE', amountMinor: '101', day: '2026-09-23', categoryId: 'food' },
      {
        type: 'EXPENSE',
        amountMinor: '999999999999999999999999999999',
        day: '2026-10-24',
        categoryId: 'food',
      },
      { type: 'EXPENSE', amountMinor: '9999', day: '2026-09-24', categoryId: 'food' },
      { type: 'INCOME', amountMinor: '9999', day: '2026-10-23' },
      { type: 'TRANSFER', amountMinor: '9999', day: '2026-10-23' },
    ],
    '2026-10',
    '2026-10-23',
  );
  expect(result).toMatchObject({
    days: 23,
    previousDays: 23,
    spentMinor: '900719925474099301',
    previousSpentMinor: '101',
    changeMinor: '900719925474099200',
  });
  expect(result.dailyAverageMinor).toBe((900719925474099301n / 23n).toString());
  expect(result.categoryChanges[0]?.changeMinor).toBe('900719925474099200');
});
it('handles leap months, full-month comparisons and zero baselines without invented percentages', () => {
  expect(spendingInsights([], '2024-02', '2024-04-01')).toMatchObject({
    days: 29,
    previousDays: 31,
    changeBasisPoints: null,
    dailyAverageMinor: '0',
    partial: false,
  });
  expect(spendingInsights([], '2026-03', '2026-03-31')).toMatchObject({
    days: 31,
    previousDays: 28,
    previousThrough: '2026-02-28',
  });
  expect(() => spendingInsights([], '2027-01', '2026-10-23')).toThrow('Future');
});
