import {
  addMonthsToKey,
  compareMonthKeys,
  getIncomeForMonth,
  getNextUpcomingPayment,
  getPaymentStatus,
  summarizeMonth,
  type EmiDebt,
  type EmiIncomePeriod,
  type EmiPayment,
} from '@finora/finance-core';

const percentOf = (part: bigint, whole: bigint) =>
  whole <= 0n ? 0 : Math.max(0, Math.min(100, Number((part * 100n) / whole)));

/** Everything the hero card and the income card show, computed with the shared engine. */
export function monthOverview(
  debts: readonly EmiDebt[],
  payments: readonly EmiPayment[],
  incomes: readonly EmiIncomePeriod[],
  month: string,
) {
  const summary = summarizeMonth(debts, payments, month);
  const done = summary.items.filter(
    (item) => getPaymentStatus(item.amountDue, item.amountPaid) === 'paid',
  ).length;
  const next = getNextUpcomingPayment(debts, payments, month);
  const active = debts.filter((debt) => debt.isActive);
  const finite = active.filter((debt) => debt.endMonth !== null);
  const lastMonth = finite.reduce<string | null>(
    (latest, debt) =>
      latest === null || compareMonthKeys(debt.endMonth!, latest) > 0 ? debt.endMonth : latest,
    null,
  );
  const income = getIncomeForMonth(incomes, month).total;
  return {
    totalDue: summary.totalDue,
    totalPaid: summary.totalPaid,
    left: summary.remaining > 0n ? summary.remaining : 0n,
    paidPercent: percentOf(summary.totalPaid, summary.totalDue),
    itemCount: summary.items.length,
    doneCount: done,
    next,
    debtFree: {
      monthKey: lastMonth,
      monthsToGo: lastMonth === null ? 0 : Math.max(0, compareMonthKeys(lastMonth, month)),
      // An ongoing loan has no end, so there is no honest "debt-free by" date.
      hasOngoing: active.some((debt) => debt.endMonth === null),
    },
    income,
    net: income - summary.totalDue,
    /** EMIs as a share of income, or null when no income is set. */
    emiShare: income > 0n ? Number((summary.totalDue * 100n) / income) : null,
  };
}

export function monthLabel(monthKey: string, locale: string, style: 'short' | 'long' = 'short') {
  return new Intl.DateTimeFormat(locale, {
    month: style,
    year: 'numeric',
    timeZone: 'UTC',
  }).format(new Date(`${monthKey}-01T12:00:00Z`));
}

/** The next twelve month keys starting from `from`, for the forecast. */
export const forecastMonths = (from: string, count = 12) =>
  Array.from({ length: count }, (_, index) => addMonthsToKey(from, index));
