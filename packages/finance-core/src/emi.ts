import { calendarDate } from './index';

// Recurring EMI/loan tracking. Pure calculation only: plain data in, plain data out, no I/O, so the
// same functions run on the server, in the app and against the local ledger. Money is exact
// integer minor units (bigint). Months are "YYYY-MM" keys, so no timezone arithmetic is involved
// beyond choosing which calendar month is "now".

export type LoanTag = 'small' | 'large';

export interface EmiDebt {
  id: string;
  name: string;
  /** Fixed EMI for every month in the range, in minor units. */
  monthlyAmount: bigint;
  startMonth: string;
  /** Last month, or null while the loan is ongoing. */
  endMonth: string | null;
  dueDay: number;
  isActive: boolean;
  loanTag: LoanTag;
  /** Only ranks Avalanche order (highest rate first). It is not an amortization model. */
  interestRatePct: number | null;
  /** Outstanding principal as last entered from the lender: a snapshot, never computed. */
  principalRemaining: bigint | null;
  principalAsOf: string | null;
}

export interface EmiPayment {
  debtId: string;
  monthKey: string;
  amountDue: bigint;
  amountPaid: bigint;
  paid: boolean;
  paidAt: string | null;
}

/** A lump-sum prepayment, not tied to a month; it nets off the remaining total directly. */
export interface EmiExtraPayment {
  id: string;
  debtId: string;
  amount: bigint;
  dateIso: string;
  note: string;
}

export type PaymentStatus = 'unpaid' | 'partial' | 'paid';

export function getPaymentStatus(amountDue: bigint, amountPaid: bigint): PaymentStatus {
  if (amountPaid <= 0n) return 'unpaid';
  if (amountPaid < amountDue) return 'partial';
  return 'paid';
}

export interface MonthLineItem {
  debt: EmiDebt;
  amountDue: bigint;
  amountPaid: bigint;
  paid: boolean;
  dueDateIso: string;
}

export interface MonthSummary {
  monthKey: string;
  totalDue: bigint;
  totalPaid: bigint;
  remaining: bigint;
  items: MonthLineItem[];
}

export interface UpcomingPayment {
  debt: EmiDebt;
  monthKey: string;
  amountDue: bigint;
  amountPaid: bigint;
  remaining: bigint;
  dueDateIso: string;
  overdue: boolean;
}

const MONTH_KEY = /^(\d{4})-(\d{2})$/;

export function getCurrentMonthKey(timezone: string, now: Date = new Date()): string {
  return calendarDate(now, timezone).slice(0, 7);
}

function monthKeyToIndex(monthKey: string): number {
  const match = MONTH_KEY.exec(monthKey);
  if (!match) throw new Error(`Invalid month key: ${monthKey}`);
  return Number(match[1]) * 12 + (Number(match[2]) - 1);
}

function indexToMonthKey(index: number): string {
  const year = Math.floor(index / 12);
  const month = ((index % 12) + 12) % 12;
  return `${year}-${String(month + 1).padStart(2, '0')}`;
}

export function addMonthsToKey(monthKey: string, delta: number): string {
  return indexToMonthKey(monthKeyToIndex(monthKey) + delta);
}

export function compareMonthKeys(a: string, b: string): number {
  return monthKeyToIndex(a) - monthKeyToIndex(b);
}

export function isDebtActiveInMonth(debt: EmiDebt, monthKey: string): boolean {
  if (compareMonthKeys(monthKey, debt.startMonth) < 0) return false;
  if (debt.endMonth && compareMonthKeys(monthKey, debt.endMonth) > 0) return false;
  return true;
}

export function getActiveDebtsForMonth(debts: readonly EmiDebt[], monthKey: string): EmiDebt[] {
  return debts.filter((debt) => debt.isActive && isDebtActiveInMonth(debt, monthKey));
}

/** Clamps the due day to the month's last real day (31 in a 30-day month lands on the 30th). */
export function getDueDateForMonth(debt: EmiDebt, monthKey: string): string {
  const match = MONTH_KEY.exec(monthKey);
  if (!match) throw new Error(`Invalid month key: ${monthKey}`);
  const year = Number(match[1]);
  const month = Number(match[2]);
  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return new Date(Date.UTC(year, month - 1, Math.min(debt.dueDay, daysInMonth))).toISOString();
}

function findPayment(payments: readonly EmiPayment[], debtId: string, monthKey: string) {
  return payments.find((p) => p.debtId === debtId && p.monthKey === monthKey);
}

const sum = <T>(items: readonly T[], value: (item: T) => bigint) =>
  items.reduce((total, item) => total + value(item), 0n);
const max0 = (value: bigint) => (value > 0n ? value : 0n);

export function summarizeMonth(
  debts: readonly EmiDebt[],
  payments: readonly EmiPayment[],
  monthKey: string,
): MonthSummary {
  const items = getActiveDebtsForMonth(debts, monthKey).map((debt) => {
    const payment = findPayment(payments, debt.id, monthKey);
    return {
      debt,
      amountDue: debt.monthlyAmount,
      amountPaid: payment?.amountPaid ?? 0n,
      paid: payment?.paid ?? false,
      dueDateIso: getDueDateForMonth(debt, monthKey),
    };
  });
  const totalDue = sum(items, (item) => item.amountDue);
  const totalPaid = sum(items, (item) => item.amountPaid);
  return { monthKey, totalDue, totalPaid, remaining: totalDue - totalPaid, items };
}

export type DebtMonthEntry = MonthLineItem & { monthKey: string };

/**
 * Month-by-month ledger for one loan from its start through its end (or the current month while
 * ongoing). Independent of isActive, so an archived loan's history still renders and a loan with
 * an old start date can be backfilled.
 */
export function getDebtMonthHistory(
  debt: EmiDebt,
  payments: readonly EmiPayment[],
  currentMonthKey: string,
): DebtMonthEntry[] {
  const toMonthKey = debt.endMonth ?? currentMonthKey;
  const entries: DebtMonthEntry[] = [];
  let monthKey = debt.startMonth;
  // The walk is capped (100 years) so an inverted or bad range cannot loop forever.
  for (let i = 0; i < 1200 && compareMonthKeys(monthKey, toMonthKey) <= 0; i++) {
    const payment = findPayment(payments, debt.id, monthKey);
    entries.push({
      debt,
      monthKey,
      amountDue: debt.monthlyAmount,
      amountPaid: payment?.amountPaid ?? 0n,
      paid: payment?.paid ?? false,
      dueDateIso: getDueDateForMonth(debt, monthKey),
    });
    monthKey = addMonthsToKey(monthKey, 1);
  }
  return entries;
}

/** EMIs paid ahead of time: months after the current one that already have an amount logged. */
export function getPaidAheadMonths(
  debt: EmiDebt,
  payments: readonly EmiPayment[],
  currentMonthKey: string,
): DebtMonthEntry[] {
  return payments
    .filter(
      (p) =>
        p.debtId === debt.id &&
        p.amountPaid > 0n &&
        compareMonthKeys(p.monthKey, currentMonthKey) > 0 &&
        isDebtActiveInMonth(debt, p.monthKey),
    )
    .sort((a, b) => compareMonthKeys(a.monthKey, b.monthKey))
    .map((p) => ({
      debt,
      monthKey: p.monthKey,
      amountDue: p.amountDue,
      amountPaid: p.amountPaid,
      paid: p.paid,
      dueDateIso: getDueDateForMonth(debt, p.monthKey),
    }));
}

export function getExtraPaymentsTotal(
  extraPayments: readonly EmiExtraPayment[],
  debtId: string,
): bigint {
  return sum(
    extraPayments.filter((p) => p.debtId === debtId),
    (p) => p.amount,
  );
}

/**
 * Everything unpaid across a loan's whole range (a missed past month still counts), minus
 * lump-sum prepayments. Null for an ongoing loan: there is no finite total to report.
 */
export function getRemainingPayable(
  debt: EmiDebt,
  payments: readonly EmiPayment[],
  extraPayments: readonly EmiExtraPayment[],
  currentMonthKey: string,
): bigint | null {
  if (debt.endMonth === null) return null;
  const scheduled = sum(getDebtMonthHistory(debt, payments, currentMonthKey), (entry) =>
    max0(entry.amountDue - entry.amountPaid),
  );
  return max0(scheduled - getExtraPaymentsTotal(extraPayments, debt.id));
}

export interface RemainingPayableTotals {
  combined: bigint;
  byTag: Record<LoanTag, bigint>;
  excludedOngoingCount: number;
}

/** Active loans only. Ongoing loans have no finite total and are counted, not silently dropped. */
export function getRemainingPayableTotals(
  debts: readonly EmiDebt[],
  payments: readonly EmiPayment[],
  extraPayments: readonly EmiExtraPayment[],
  currentMonthKey: string,
): RemainingPayableTotals {
  const byTag: Record<LoanTag, bigint> = { small: 0n, large: 0n };
  let combined = 0n;
  let excludedOngoingCount = 0;
  for (const debt of debts.filter((d) => d.isActive)) {
    const remaining = getRemainingPayable(debt, payments, extraPayments, currentMonthKey);
    if (remaining === null) {
      excludedOngoingCount += 1;
      continue;
    }
    combined += remaining;
    byTag[debt.loanTag] += remaining;
  }
  return { combined, byTag, excludedOngoingCount };
}

export interface PrincipalTotals {
  total: bigint;
  byTag: Record<LoanTag, bigint>;
  withPrincipal: number;
  /** Active loans with no principal entered; they are listed, never treated as zero. */
  missingNames: string[];
  /** The oldest "as of" date among the counted loans, to say how fresh the total is. */
  oldestAsOf: string | null;
}

export function getPrincipalTotals(debts: readonly EmiDebt[]): PrincipalTotals {
  const byTag: Record<LoanTag, bigint> = { small: 0n, large: 0n };
  let total = 0n;
  let withPrincipal = 0;
  let oldestAsOf: string | null = null;
  const missingNames: string[] = [];
  for (const debt of debts.filter((d) => d.isActive)) {
    if (debt.principalRemaining === null) {
      missingNames.push(debt.name);
      continue;
    }
    total += debt.principalRemaining;
    byTag[debt.loanTag] += debt.principalRemaining;
    withPrincipal += 1;
    if (debt.principalAsOf && (oldestAsOf === null || debt.principalAsOf < oldestAsOf))
      oldestAsOf = debt.principalAsOf;
  }
  return { total, byTag, withPrincipal, missingNames, oldestAsOf };
}

export function summarizeRange(
  debts: readonly EmiDebt[],
  payments: readonly EmiPayment[],
  fromMonthKey: string,
  toMonthKey: string,
): MonthSummary[] {
  const months: MonthSummary[] = [];
  const to = monthKeyToIndex(toMonthKey);
  for (let index = monthKeyToIndex(fromMonthKey); index <= to; index++)
    months.push(summarizeMonth(debts, payments, indexToMonthKey(index)));
  return months;
}

/**
 * Looks back `lookbackMonths` (to catch overdue months) through forward `lookaheadMonths`,
 * collecting not-fully-paid items in due-date order, and returns the first `count`. Both bounds
 * are finite so a fully paid-up user never spins forever.
 */
export function getUpcomingPayments(
  debts: readonly EmiDebt[],
  payments: readonly EmiPayment[],
  currentMonthKey: string,
  count = 5,
  lookaheadMonths = 36,
  lookbackMonths = 6,
): UpcomingPayment[] {
  const results: UpcomingPayment[] = [];
  for (let offset = -lookbackMonths; offset < lookaheadMonths && results.length < count; offset++) {
    const monthKey = addMonthsToKey(currentMonthKey, offset);
    const unpaid = summarizeMonth(debts, payments, monthKey)
      .items.filter((item) => !item.paid)
      .sort((a, b) => a.dueDateIso.localeCompare(b.dueDateIso));
    for (const item of unpaid) {
      if (results.length >= count) break;
      results.push({
        debt: item.debt,
        monthKey,
        amountDue: item.amountDue,
        amountPaid: item.amountPaid,
        remaining: item.amountDue - item.amountPaid,
        dueDateIso: item.dueDateIso,
        overdue: compareMonthKeys(monthKey, currentMonthKey) < 0,
      });
    }
  }
  return results;
}

export function getNextUpcomingPayment(
  debts: readonly EmiDebt[],
  payments: readonly EmiPayment[],
  currentMonthKey: string,
  lookaheadMonths = 36,
): UpcomingPayment | null {
  return getUpcomingPayments(debts, payments, currentMonthKey, 1, lookaheadMonths)[0] ?? null;
}

export interface PayoffOrderEntry {
  debt: EmiDebt;
  remaining: bigint;
}

const compareAmounts = (a: bigint, b: bigint) => (a < b ? -1 : a > b ? 1 : 0);

function finiteEntries(
  debts: readonly EmiDebt[],
  payments: readonly EmiPayment[],
  extraPayments: readonly EmiExtraPayment[],
  currentMonthKey: string,
) {
  return debts
    .filter((d) => d.isActive)
    .map((debt) => ({
      debt,
      remaining: getRemainingPayable(debt, payments, extraPayments, currentMonthKey),
    }))
    .filter((entry): entry is PayoffOrderEntry => entry.remaining !== null);
}

/** Smallest remaining balance first, for quick wins. Ongoing loans are excluded. */
export function getSnowballOrder(
  debts: readonly EmiDebt[],
  payments: readonly EmiPayment[],
  extraPayments: readonly EmiExtraPayment[],
  currentMonthKey: string,
): PayoffOrderEntry[] {
  return finiteEntries(debts, payments, extraPayments, currentMonthKey).sort((a, b) =>
    compareAmounts(a.remaining, b.remaining),
  );
}

/**
 * Highest interest rate first, which minimizes interest paid. Loans with no rate sort after every
 * rated loan (smallest balance first among themselves) rather than being dropped.
 */
export function getAvalancheOrder(
  debts: readonly EmiDebt[],
  payments: readonly EmiPayment[],
  extraPayments: readonly EmiExtraPayment[],
  currentMonthKey: string,
): PayoffOrderEntry[] {
  return finiteEntries(debts, payments, extraPayments, currentMonthKey).sort((a, b) => {
    const rateA = a.debt.interestRatePct;
    const rateB = b.debt.interestRatePct;
    if (rateA === null && rateB === null) return compareAmounts(a.remaining, b.remaining);
    if (rateA === null) return 1;
    if (rateB === null) return -1;
    return rateB - rateA || compareAmounts(a.remaining, b.remaining);
  });
}

export interface LifetimeStats {
  totalDue: bigint;
  totalPaid: bigint;
  monthsTracked: number;
  activeDebtCount: number;
}

export function summarizeLifetime(
  debts: readonly EmiDebt[],
  payments: readonly EmiPayment[],
  currentMonthKey: string,
): LifetimeStats {
  if (debts.length === 0)
    return { totalDue: 0n, totalPaid: 0n, monthsTracked: 0, activeDebtCount: 0 };
  const earliest = debts
    .map((d) => d.startMonth)
    .reduce((min, key) => (compareMonthKeys(key, min) < 0 ? key : min));
  const months = summarizeRange(debts, payments, earliest, currentMonthKey);
  return {
    totalDue: sum(months, (m) => m.totalDue),
    totalPaid: sum(months, (m) => m.totalPaid),
    monthsTracked: months.length,
    activeDebtCount: debts.filter((d) => d.isActive).length,
  };
}

// Income periods: salary and extra income that change over time, in the same month-range shape.

export type IncomeKind = 'salary' | 'extra';

export interface EmiIncomePeriod {
  id: string;
  kind: IncomeKind;
  amount: bigint;
  startMonth: string;
  endMonth: string | null;
  note: string;
}

export function isIncomePeriodActiveInMonth(period: EmiIncomePeriod, monthKey: string): boolean {
  if (compareMonthKeys(monthKey, period.startMonth) < 0) return false;
  if (period.endMonth !== null && compareMonthKeys(monthKey, period.endMonth) > 0) return false;
  return true;
}

export interface MonthIncome {
  salary: bigint;
  extra: bigint;
  total: bigint;
}

/** Several periods of the same kind may overlap in a month; they are summed. */
export function getIncomeForMonth(
  periods: readonly EmiIncomePeriod[],
  monthKey: string,
): MonthIncome {
  const active = periods.filter((p) => isIncomePeriodActiveInMonth(p, monthKey));
  const salary = sum(
    active.filter((p) => p.kind === 'salary'),
    (p) => p.amount,
  );
  const extra = sum(
    active.filter((p) => p.kind === 'extra'),
    (p) => p.amount,
  );
  return { salary, extra, total: salary + extra };
}

export interface MonthForecast {
  monthKey: string;
  salary: bigint;
  extraIncome: bigint;
  income: bigint;
  emisDue: bigint;
  /** Income minus EMIs due; negative is a deficit. */
  net: bigint;
}

export function getForecast(
  debts: readonly EmiDebt[],
  payments: readonly EmiPayment[],
  incomePeriods: readonly EmiIncomePeriod[],
  fromMonthKey: string,
  months: number,
): MonthForecast[] {
  const result: MonthForecast[] = [];
  let monthKey = fromMonthKey;
  for (let i = 0; i < months; i++) {
    const emisDue = summarizeMonth(debts, payments, monthKey).totalDue;
    const income = getIncomeForMonth(incomePeriods, monthKey);
    result.push({
      monthKey,
      salary: income.salary,
      extraIncome: income.extra,
      income: income.total,
      emisDue,
      net: income.total - emisDue,
    });
    monthKey = addMonthsToKey(monthKey, 1);
  }
  return result;
}
