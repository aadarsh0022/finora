import { expect, it } from 'vitest';
import type { EmiDebt, EmiIncomePeriod, EmiPayment } from '@finora/finance-core';
import { forecastMonths, monthLabel, monthOverview } from '../src/features/loans/summary';

const loan = (overrides: Partial<EmiDebt> = {}): EmiDebt => ({
  id: 'a',
  name: 'Loan',
  monthlyAmount: 10000n,
  startMonth: '2026-01',
  endMonth: '2029-10',
  dueDay: 3,
  isActive: true,
  loanTag: 'small',
  interestRatePct: null,
  principalRemaining: null,
  principalAsOf: null,
  ...overrides,
});
const paid = (debtId: string, monthKey: string, amount: bigint): EmiPayment => ({
  debtId,
  monthKey,
  amountDue: amount,
  amountPaid: amount,
  paid: true,
  paidAt: '2026-11-01',
});
const salary = (amount: bigint): EmiIncomePeriod => ({
  id: 's',
  kind: 'salary',
  amount,
  startMonth: '2026-01',
  endMonth: null,
  note: '',
});

it('summarises the month: what is left, progress, EMIs done and the next payment', () => {
  const debts = [
    loan({ id: 'a', name: 'Groww', monthlyAmount: 10000n, dueDay: 5 }),
    loan({ id: 'b', name: 'IND', monthlyAmount: 30000n, dueDay: 3 }),
  ];
  const overview = monthOverview(debts, [paid('a', '2026-11', 10000n)], [], '2026-11');
  expect(overview).toMatchObject({
    totalDue: 40000n,
    totalPaid: 10000n,
    left: 30000n,
    paidPercent: 25,
    itemCount: 2,
    doneCount: 1,
  });
  expect(overview.next?.debt.name).toBe('IND');
  expect(overview.next?.remaining).toBe(30000n);
});

it('works out the debt-free month and flags an ongoing loan', () => {
  const finite = monthOverview(
    [loan({ endMonth: '2029-10' }), loan({ id: 'b', endMonth: '2027-02' })],
    [],
    [],
    '2026-11',
  );
  expect(finite.debtFree).toEqual({ monthKey: '2029-10', monthsToGo: 35, hasOngoing: false });
  const withOngoing = monthOverview([loan({ endMonth: null })], [], [], '2026-11');
  expect(withOngoing.debtFree).toEqual({ monthKey: null, monthsToGo: 0, hasOngoing: true });
});

it('compares EMIs with income and reports a shortfall exactly', () => {
  const debts = [loan({ monthlyAmount: 8163900n })];
  const short = monthOverview(debts, [], [salary(7300000n)], '2026-11');
  expect(short.net).toBe(-863900n);
  expect(short.emiShare).toBe(111);
  expect(monthOverview(debts, [], [], '2026-11').emiShare).toBeNull();
  expect(monthOverview(debts, [], [salary(20000000n)], '2026-11').net).toBe(11836100n);
});

it('keeps amounts above the safe integer range exact', () => {
  const huge = 900719925474099301n;
  const overview = monthOverview([loan({ monthlyAmount: huge })], [], [], '2026-11');
  expect(overview.left).toBe(huge);
});

it('formats month labels and lists twelve forecast months across a year end', () => {
  expect(monthLabel('2026-11', 'en-IN')).toBe('Nov 2026');
  expect(forecastMonths('2026-11')).toHaveLength(12);
  expect(forecastMonths('2026-11')[2]).toBe('2027-01');
});
