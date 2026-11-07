import { describe, expect, it } from 'vitest';
import {
  addMonthsToKey,
  compareMonthKeys,
  getActiveDebtsForMonth,
  getAvalancheOrder,
  getDebtMonthHistory,
  getDueDateForMonth,
  getExtraPaymentsTotal,
  getForecast,
  getIncomeForMonth,
  getNextUpcomingPayment,
  getPaidAheadMonths,
  getPaymentStatus,
  getRemainingPayable,
  getPrincipalTotals,
  getRemainingPayableTotals,
  getSnowballOrder,
  getUpcomingPayments,
  isDebtActiveInMonth,
  isIncomePeriodActiveInMonth,
  summarizeLifetime,
  summarizeMonth,
  summarizeRange,
  type EmiDebt,
  type EmiExtraPayment,
  type EmiIncomePeriod,
  type EmiPayment,
} from '../src/emi';

function debt(overrides: Partial<EmiDebt> = {}): EmiDebt {
  return {
    id: 'debt-1',
    name: 'Test Debt',
    monthlyAmount: 1000n,
    startMonth: '2026-01',
    endMonth: null,
    dueDay: 5,
    isActive: true,
    loanTag: 'small',
    interestRatePct: null,
    principalRemaining: null,
    principalAsOf: null,
    ...overrides,
  };
}

function extraPayment(overrides: Partial<EmiExtraPayment> = {}): EmiExtraPayment {
  return {
    id: 'extra-1',
    debtId: 'debt-1',
    amount: 100n,
    dateIso: '2026-03-15T00:00:00.000Z',
    note: '',
    ...overrides,
  };
}

function incomePeriod(overrides: Partial<EmiIncomePeriod> = {}): EmiIncomePeriod {
  return {
    id: 'income-1',
    kind: 'salary',
    amount: 75000n,
    startMonth: '2026-01',
    endMonth: null,
    note: '',
    ...overrides,
  };
}

describe('month key math', () => {
  it('wraps across a year boundary going forward', () => {
    expect(addMonthsToKey('2026-11', 2)).toBe('2027-01');
  });

  it('wraps across a year boundary going backward', () => {
    expect(addMonthsToKey('2027-01', -2)).toBe('2026-11');
  });

  it('compares month keys chronologically regardless of year width', () => {
    expect(compareMonthKeys('2026-12', '2027-01')).toBeLessThan(0);
    expect(compareMonthKeys('2027-01', '2026-12')).toBeGreaterThan(0);
    expect(compareMonthKeys('2026-05', '2026-05')).toBe(0);
  });
});

describe('isDebtActiveInMonth / getActiveDebtsForMonth', () => {
  it('is inactive before the start month', () => {
    const d = debt({ startMonth: '2026-06' });
    expect(isDebtActiveInMonth(d, '2026-05')).toBe(false);
  });

  it('is active on the start month itself', () => {
    const d = debt({ startMonth: '2026-06' });
    expect(isDebtActiveInMonth(d, '2026-06')).toBe(true);
  });

  it('is active on the end month itself but not after', () => {
    const d = debt({ startMonth: '2026-01', endMonth: '2026-06' });
    expect(isDebtActiveInMonth(d, '2026-06')).toBe(true);
    expect(isDebtActiveInMonth(d, '2026-07')).toBe(false);
  });

  it('stays active indefinitely when endMonth is null', () => {
    const d = debt({ startMonth: '2020-01', endMonth: null });
    expect(isDebtActiveInMonth(d, '2099-12')).toBe(true);
  });

  it('excludes debts marked inactive even within their date range', () => {
    const d = debt({ startMonth: '2026-01', endMonth: '2026-12', isActive: false });
    expect(getActiveDebtsForMonth([d], '2026-06')).toHaveLength(0);
  });
});

describe('getDueDateForMonth', () => {
  it('clamps dueDay 31 to the last day of a 30-day month', () => {
    const d = debt({ dueDay: 31 });
    const iso = getDueDateForMonth(d, '2026-04');
    expect(iso.slice(0, 10)).toBe('2026-04-30');
  });

  it('clamps dueDay 30 to Feb 28 in a non-leap year', () => {
    const d = debt({ dueDay: 30 });
    const iso = getDueDateForMonth(d, '2026-02');
    expect(iso.slice(0, 10)).toBe('2026-02-28');
  });

  it('clamps dueDay 30 to Feb 29 in a leap year', () => {
    const d = debt({ dueDay: 30 });
    const iso = getDueDateForMonth(d, '2028-02');
    expect(iso.slice(0, 10)).toBe('2028-02-29');
  });
});

describe('summarizeMonth', () => {
  it('sums due/paid across active debts and marks unpaid debts with zero paid', () => {
    const debts = [
      debt({ id: 'a', monthlyAmount: 1000n, startMonth: '2026-01' }),
      debt({ id: 'b', monthlyAmount: 2000n, startMonth: '2026-01' }),
    ];
    const payments: EmiPayment[] = [
      {
        debtId: 'a',
        monthKey: '2026-03',
        amountDue: 1000n,
        amountPaid: 1000n,
        paid: true,
        paidAt: '2026-03-05',
      },
    ];
    const summary = summarizeMonth(debts, payments, '2026-03');
    expect(summary.totalDue).toBe(3000n);
    expect(summary.totalPaid).toBe(1000n);
    expect(summary.remaining).toBe(2000n);
    expect(summary.items.find((i) => i.debt.id === 'b')?.paid).toBe(false);
  });

  it('excludes debts outside their active range for that month', () => {
    const debts = [debt({ id: 'a', startMonth: '2026-01', endMonth: '2026-02' })];
    const summary = summarizeMonth(debts, [], '2026-06');
    expect(summary.items).toHaveLength(0);
    expect(summary.totalDue).toBe(0n);
  });
});

describe('summarizeRange', () => {
  it('produces one summary per month inclusive of both endpoints, across a year boundary', () => {
    const debts = [debt({ startMonth: '2026-11' })];
    const months = summarizeRange(debts, [], '2026-11', '2027-01');
    expect(months.map((m) => m.monthKey)).toEqual(['2026-11', '2026-12', '2027-01']);
    expect(months.every((m) => m.totalDue === 1000n)).toBe(true);
  });
});

describe('getNextUpcomingPayment', () => {
  it('returns the earliest unpaid item in the current month when nothing is overdue', () => {
    const debts = [
      debt({ id: 'a', dueDay: 20, startMonth: '2026-03' }),
      debt({ id: 'b', dueDay: 5, startMonth: '2026-03' }),
    ];
    const next = getNextUpcomingPayment(debts, [], '2026-03');
    expect(next?.debt.id).toBe('b');
    expect(next?.monthKey).toBe('2026-03');
    expect(next?.overdue).toBe(false);
  });

  it('surfaces an already-overdue unpaid month before a later current-month one', () => {
    // active since Jan, nothing ever marked paid — Jan is overdue by March
    const debts = [debt({ id: 'a', startMonth: '2026-01' })];
    const next = getNextUpcomingPayment(debts, [], '2026-03');
    expect(next?.monthKey).toBe('2026-01');
    expect(next?.overdue).toBe(true);
  });

  it('skips fully-paid months and finds the next unpaid one', () => {
    const debts = [debt({ id: 'a', startMonth: '2026-03' })];
    const payments: EmiPayment[] = [
      {
        debtId: 'a',
        monthKey: '2026-03',
        amountDue: 1000n,
        amountPaid: 1000n,
        paid: true,
        paidAt: '2026-03-05',
      },
    ];
    const next = getNextUpcomingPayment(debts, payments, '2026-03');
    expect(next?.monthKey).toBe('2026-04');
    expect(next?.overdue).toBe(false);
  });

  it('returns null when there are no debts at all', () => {
    expect(getNextUpcomingPayment([], [], '2026-03')).toBeNull();
  });
});

describe('getUpcomingPayments', () => {
  it('returns up to `count` unpaid items in due-date order across the lookback/lookahead window', () => {
    const debts = [
      debt({ id: 'a', startMonth: '2026-03', dueDay: 20 }),
      debt({ id: 'b', startMonth: '2026-04', dueDay: 5 }),
    ];
    const results = getUpcomingPayments(debts, [], '2026-03', 3);
    expect(results.map((r) => `${r.debt.id}:${r.monthKey}`)).toEqual([
      'a:2026-03',
      'b:2026-04',
      'a:2026-04',
    ]);
  });

  it("only looks back lookbackMonths, so a very old unpaid debt outside the window doesn't dominate", () => {
    const debts = [debt({ id: 'a', startMonth: '2020-01' })];
    const results = getUpcomingPayments(debts, [], '2026-03', 5, 36, 2);
    // lookback=2 from 2026-03 starts at 2026-01, well after the debt's 2020 start
    expect(results[0]?.monthKey).toBe('2026-01');
  });
});

describe('getDebtMonthHistory', () => {
  it('lists every month from startMonth through endMonth inclusive, across a year boundary', () => {
    const d = debt({ startMonth: '2025-11', endMonth: '2026-02' });
    const history = getDebtMonthHistory(d, [], '2026-06');
    expect(history.map((h) => h.monthKey)).toEqual(['2025-11', '2025-12', '2026-01', '2026-02']);
  });

  it("caps an ongoing debt's history at the current month", () => {
    const d = debt({ startMonth: '2026-01', endMonth: null });
    const history = getDebtMonthHistory(d, [], '2026-04');
    expect(history.map((h) => h.monthKey)).toEqual(['2026-01', '2026-02', '2026-03', '2026-04']);
  });

  it('includes history for an archived (isActive: false) debt', () => {
    const d = debt({ startMonth: '2026-01', endMonth: '2026-02', isActive: false });
    const history = getDebtMonthHistory(d, [], '2026-06');
    expect(history).toHaveLength(2);
  });

  it('marks months paid from matching payment records and unpaid otherwise', () => {
    const d = debt({ id: 'a', startMonth: '2026-01', endMonth: '2026-03' });
    const payments: EmiPayment[] = [
      {
        debtId: 'a',
        monthKey: '2026-02',
        amountDue: 1000n,
        amountPaid: 1000n,
        paid: true,
        paidAt: '2026-02-05',
      },
    ];
    const history = getDebtMonthHistory(d, payments, '2026-06');
    expect(history.map((h) => h.paid)).toEqual([false, true, false]);
  });
});

describe('getPaidAheadMonths', () => {
  const pay = (monthKey: string, amountPaid: bigint, debtId = 'a'): EmiPayment => ({
    debtId,
    monthKey,
    amountDue: 1000n,
    amountPaid,
    paid: true,
    paidAt: '2026-10-01',
  });

  it('returns only months after the current one with an amount logged, oldest first, across a year boundary', () => {
    const d = debt({ id: 'a', startMonth: '2026-01', endMonth: '2027-06' });
    const payments = [
      pay('2027-01', 1000n),
      pay('2026-10', 1000n),
      pay('2026-11', 400n),
      pay('2026-12', 0n),
      pay('2027-02', 1000n, 'b'),
    ];
    const ahead = getPaidAheadMonths(d, payments, '2026-10');
    expect(ahead.map((e) => [e.monthKey, e.amountPaid])).toEqual([
      ['2026-11', 400n],
      ['2027-01', 1000n],
    ]);
  });

  it("works for an ongoing debt and ignores months outside the debt's range", () => {
    const d = debt({ id: 'a', startMonth: '2026-01', endMonth: null });
    expect(getPaidAheadMonths(d, [pay('2028-03', 1000n)], '2026-10')).toHaveLength(1);
    const ended = debt({ id: 'a', startMonth: '2026-01', endMonth: '2026-12' });
    expect(getPaidAheadMonths(ended, [pay('2027-01', 1000n)], '2026-10')).toEqual([]);
  });
});

describe('getRemainingPayable / getRemainingPayableTotals', () => {
  it('returns null for an ongoing debt (no finite end)', () => {
    const d = debt({ startMonth: '2026-01', endMonth: null });
    expect(getRemainingPayable(d, [], [], '2026-06')).toBeNull();
  });

  it("sums unpaid amounts across the debt's full range, including already-past months", () => {
    // 6-month debt, only month 3 paid — 5 months of 1000 remain unpaid
    const d = debt({ id: 'a', startMonth: '2026-01', endMonth: '2026-06', monthlyAmount: 1000n });
    const payments: EmiPayment[] = [
      {
        debtId: 'a',
        monthKey: '2026-03',
        amountDue: 1000n,
        amountPaid: 1000n,
        paid: true,
        paidAt: '2026-03-05',
      },
    ];
    expect(getRemainingPayable(d, payments, [], '2026-04')).toBe(5000n);
  });

  it('is zero once every month in range is paid', () => {
    const d = debt({ id: 'a', startMonth: '2026-01', endMonth: '2026-02', monthlyAmount: 500n });
    const payments: EmiPayment[] = [
      {
        debtId: 'a',
        monthKey: '2026-01',
        amountDue: 500n,
        amountPaid: 500n,
        paid: true,
        paidAt: '2026-01-05',
      },
      {
        debtId: 'a',
        monthKey: '2026-02',
        amountDue: 500n,
        amountPaid: 500n,
        paid: true,
        paidAt: '2026-02-05',
      },
    ];
    expect(getRemainingPayable(d, payments, [], '2026-06')).toBe(0n);
  });

  it('subtracts lump-sum extra payments from the scheduled remaining total', () => {
    const d = debt({ id: 'a', startMonth: '2026-01', endMonth: '2026-06', monthlyAmount: 1000n });
    const extras = [extraPayment({ debtId: 'a', amount: 1500n })];
    // 6000 scheduled - 1500 extra = 4500
    expect(getRemainingPayable(d, [], extras, '2026-06')).toBe(4500n);
  });

  it('floors at zero when extra payments exceed the scheduled remaining total', () => {
    const d = debt({ id: 'a', startMonth: '2026-01', endMonth: '2026-02', monthlyAmount: 500n });
    const extras = [extraPayment({ debtId: 'a', amount: 10000n })];
    expect(getRemainingPayable(d, [], extras, '2026-06')).toBe(0n);
  });

  it('only nets extra payments against the matching debt', () => {
    const d = debt({ id: 'a', startMonth: '2026-01', endMonth: '2026-02', monthlyAmount: 500n });
    const extras = [extraPayment({ debtId: 'other-debt', amount: 500n })];
    expect(getRemainingPayable(d, [], extras, '2026-06')).toBe(1000n);
  });

  it('aggregates combined and per-tag totals across active debts, excluding ongoing and archived ones', () => {
    const debts: EmiDebt[] = [
      debt({
        id: 'a',
        loanTag: 'small',
        startMonth: '2026-01',
        endMonth: '2026-03',
        monthlyAmount: 1000n,
      }), // 3000 remaining
      debt({
        id: 'b',
        loanTag: 'large',
        startMonth: '2026-01',
        endMonth: '2026-02',
        monthlyAmount: 5000n,
      }), // 10000 remaining
      debt({ id: 'c', loanTag: 'large', startMonth: '2026-01', endMonth: null }), // ongoing, excluded
      debt({
        id: 'd',
        loanTag: 'small',
        startMonth: '2026-01',
        endMonth: '2026-01',
        monthlyAmount: 999n,
        isActive: false,
      }), // archived, excluded
    ];
    const totals = getRemainingPayableTotals(debts, [], [], '2026-01');
    expect(totals.combined).toBe(13000n);
    expect(totals.byTag).toEqual({ small: 3000n, large: 10000n });
    expect(totals.excludedOngoingCount).toBe(1);
  });
});

describe('getExtraPaymentsTotal', () => {
  it("sums only the matching debt's extra payments", () => {
    const extras = [
      extraPayment({ debtId: 'a', amount: 100n }),
      extraPayment({ debtId: 'a', amount: 200n }),
      extraPayment({ debtId: 'b', amount: 999n }),
    ];
    expect(getExtraPaymentsTotal(extras, 'a')).toBe(300n);
  });
});

describe('getPaymentStatus', () => {
  it('is unpaid when nothing has been paid', () => {
    expect(getPaymentStatus(1000n, 0n)).toBe('unpaid');
  });

  it('is partial when something but not the full amount has been paid', () => {
    expect(getPaymentStatus(1000n, 400n)).toBe('partial');
  });

  it("is paid once the paid amount meets or exceeds what's due", () => {
    expect(getPaymentStatus(1000n, 1000n)).toBe('paid');
    expect(getPaymentStatus(1000n, 1200n)).toBe('paid');
  });
});

describe('getSnowballOrder / getAvalancheOrder', () => {
  const debts: EmiDebt[] = [
    debt({
      id: 'big',
      startMonth: '2026-01',
      endMonth: '2026-04',
      monthlyAmount: 5000n,
      interestRatePct: 8,
    }), // 20000 remaining
    debt({
      id: 'small',
      startMonth: '2026-01',
      endMonth: '2026-02',
      monthlyAmount: 1000n,
      interestRatePct: 24,
    }), // 2000 remaining
    debt({
      id: 'unrated',
      startMonth: '2026-01',
      endMonth: '2026-01',
      monthlyAmount: 500n,
      interestRatePct: null,
    }), // 500 remaining
    debt({ id: 'ongoing', startMonth: '2026-01', endMonth: null, interestRatePct: 15 }), // excluded, no finite total
  ];

  it('snowball orders by smallest remaining balance first, excluding ongoing debts', () => {
    const order = getSnowballOrder(debts, [], [], '2026-01');
    expect(order.map((o) => o.debt.id)).toEqual(['unrated', 'small', 'big']);
  });

  it('avalanche orders by highest interest rate first, pushing unrated debts to the end', () => {
    const order = getAvalancheOrder(debts, [], [], '2026-01');
    expect(order.map((o) => o.debt.id)).toEqual(['small', 'big', 'unrated']);
  });
});

describe('summarizeLifetime', () => {
  it("spans from the earliest debt's start month through the current month", () => {
    const debts = [
      debt({ id: 'a', monthlyAmount: 500n, startMonth: '2025-06', endMonth: '2025-08' }),
      debt({ id: 'b', monthlyAmount: 1000n, startMonth: '2026-01' }),
    ];
    const stats = summarizeLifetime(debts, [], '2026-03');
    // 2025-06..2025-08 (debt a, 3 months) + 2025-09..2025-12 (nothing) + 2026-01..2026-03 (debt b, 3 months)
    expect(stats.monthsTracked).toBe(10);
    expect(stats.totalDue).toBe(500n * 3n + 1000n * 3n);
    expect(stats.activeDebtCount).toBe(2);
  });

  it('returns zeroed stats when there are no debts', () => {
    expect(summarizeLifetime([], [], '2026-03')).toEqual({
      totalDue: 0n,
      totalPaid: 0n,
      monthsTracked: 0,
      activeDebtCount: 0,
    });
  });
});

describe('isIncomePeriodActiveInMonth', () => {
  it('is false before startMonth, true within range, false after endMonth', () => {
    const p = incomePeriod({ startMonth: '2026-03', endMonth: '2026-05' });
    expect(isIncomePeriodActiveInMonth(p, '2026-02')).toBe(false);
    expect(isIncomePeriodActiveInMonth(p, '2026-03')).toBe(true);
    expect(isIncomePeriodActiveInMonth(p, '2026-05')).toBe(true);
    expect(isIncomePeriodActiveInMonth(p, '2026-06')).toBe(false);
  });

  it('has no upper bound when endMonth is null', () => {
    const p = incomePeriod({ startMonth: '2026-01', endMonth: null });
    expect(isIncomePeriodActiveInMonth(p, '2099-01')).toBe(true);
  });
});

describe('getIncomeForMonth', () => {
  it('sums salary and extra separately, and combines them into total', () => {
    const periods = [
      incomePeriod({
        id: 's1',
        kind: 'salary',
        amount: 75000n,
        startMonth: '2026-01',
        endMonth: '2026-03',
      }),
      incomePeriod({ id: 's2', kind: 'salary', amount: 90000n, startMonth: '2026-04' }),
      incomePeriod({ id: 'e1', kind: 'extra', amount: 5000n, startMonth: '2026-01' }),
      incomePeriod({ id: 'e2', kind: 'extra', amount: 2000n, startMonth: '2026-01' }),
    ];
    expect(getIncomeForMonth(periods, '2026-02')).toEqual({
      salary: 75000n,
      extra: 7000n,
      total: 82000n,
    });
    expect(getIncomeForMonth(periods, '2026-04')).toEqual({
      salary: 90000n,
      extra: 7000n,
      total: 97000n,
    });
  });

  it('returns zeros when nothing is active that month', () => {
    expect(getIncomeForMonth([], '2026-01')).toEqual({ salary: 0n, extra: 0n, total: 0n });
  });
});

describe('getForecast', () => {
  it('computes income, EMIs due, and net for each of the requested months', () => {
    const debts = [debt({ monthlyAmount: 20000n, startMonth: '2026-01' })];
    const periods = [
      incomePeriod({ kind: 'salary', amount: 75000n, startMonth: '2026-01', endMonth: '2026-03' }),
      incomePeriod({ kind: 'salary', amount: 90000n, startMonth: '2026-04' }),
    ];
    const forecast = getForecast(debts, [], periods, '2026-02', 4);

    expect(forecast).toEqual([
      {
        monthKey: '2026-02',
        salary: 75000n,
        extraIncome: 0n,
        income: 75000n,
        emisDue: 20000n,
        net: 55000n,
      },
      {
        monthKey: '2026-03',
        salary: 75000n,
        extraIncome: 0n,
        income: 75000n,
        emisDue: 20000n,
        net: 55000n,
      },
      {
        monthKey: '2026-04',
        salary: 90000n,
        extraIncome: 0n,
        income: 90000n,
        emisDue: 20000n,
        net: 70000n,
      },
      {
        monthKey: '2026-05',
        salary: 90000n,
        extraIncome: 0n,
        income: 90000n,
        emisDue: 20000n,
        net: 70000n,
      },
    ]);
  });

  it('reports a negative net when EMIs exceed income', () => {
    const debts = [debt({ monthlyAmount: 100000n, startMonth: '2026-01' })];
    const forecast = getForecast(debts, [], [], '2026-01', 1);
    expect(forecast[0]?.net).toBe(-100000n);
  });
});

describe('getPrincipalTotals', () => {
  it('sums entered principal for active debts and lists the ones without it', () => {
    const debts = [
      debt({
        id: 'a',
        name: 'HDFC',
        loanTag: 'large',
        principalRemaining: 120000n,
        principalAsOf: '2026-09-10',
      }),
      debt({ id: 'b', name: 'Groww', principalRemaining: 30000n, principalAsOf: '2026-10-01' }),
      debt({ id: 'c', name: 'Kistt', principalRemaining: null }),
      debt({ id: 'd', name: 'Closed', principalRemaining: 5000n, isActive: false }),
    ];
    const totals = getPrincipalTotals(debts);
    expect(totals.total).toBe(150000n);
    expect(totals.byTag).toEqual({ small: 30000n, large: 120000n });
    expect(totals.withPrincipal).toBe(2);
    expect(totals.missingNames).toEqual(['Kistt']);
    expect(totals.oldestAsOf).toBe('2026-09-10');
  });

  it('counts a principal of 0 as entered (a loan paid down to nothing)', () => {
    const totals = getPrincipalTotals([
      debt({ principalRemaining: 0n, principalAsOf: '2026-10-01' }),
    ]);
    expect(totals.withPrincipal).toBe(1);
    expect(totals.missingNames).toEqual([]);
  });
});

describe('getForecast with several overlapping income streams', () => {
  it('adds a raise, a fixed-term extra income and a one-month bonus per month', () => {
    const periods = [
      incomePeriod({ kind: 'salary', amount: 70000n, startMonth: '2026-11', endMonth: '2027-03' }),
      incomePeriod({ kind: 'salary', amount: 90000n, startMonth: '2027-04', endMonth: '2027-09' }),
      incomePeriod({ kind: 'extra', amount: 15000n, startMonth: '2026-11', endMonth: '2027-02' }),
      incomePeriod({ kind: 'extra', amount: 100000n, startMonth: '2027-04', endMonth: '2027-04' }),
    ];
    const income = getForecast([], [], periods, '2026-11', 12).map((row) => [
      row.monthKey,
      row.income,
    ]);
    expect(income).toEqual([
      ['2026-11', 85000n],
      ['2026-12', 85000n],
      ['2027-01', 85000n],
      ['2027-02', 85000n],
      ['2027-03', 70000n],
      ['2027-04', 190000n],
      ['2027-05', 90000n],
      ['2027-06', 90000n],
      ['2027-07', 90000n],
      ['2027-08', 90000n],
      ['2027-09', 90000n],
      ['2027-10', 0n],
    ]);
  });
});
