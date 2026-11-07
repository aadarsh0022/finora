const DAY = 86_400_000;
const toMs = (day: string) =>
  Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)));
const fromMs = (ms: number) => new Date(ms).toISOString().slice(0, 10);
const addDays = (day: string, count: number) => fromMs(toMs(day) + count * DAY);
const daysBetween = (from: string, to: string) => Math.round((toMs(to) - toMs(from)) / DAY);
const lastDayOfMonth = (day: string) =>
  fromMs(Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)), 0));
const monthIndex = (day: string) => Number(day.slice(0, 4)) * 12 + Number(day.slice(5, 7)) - 1;
const firstOfMonthIndex = (index: number) =>
  fromMs(Date.UTC(Math.floor(index / 12), index % 12, 1));

export interface ComparisonPeriod {
  from: string;
  to: string;
  /** Wording for the comparison, for example "last month". */
  label: string;
}

/**
 * The period to compare with: the previous calendar months for whole-month ranges, otherwise
 * the same number of days immediately before. While the selected period is still in progress,
 * only the same number of elapsed days is compared so a part month is not set against a full one.
 */
export function comparisonPeriod(
  period: { from: string; to: string },
  today: string,
): ComparisonPeriod | null {
  if (today < period.from) return null;
  const wholeMonths = period.from.endsWith('-01') && period.to === lastDayOfMonth(period.to);
  let from: string;
  let to: string;
  let label = 'previous period';
  if (wholeMonths) {
    const months = monthIndex(period.to) - monthIndex(period.from) + 1;
    from = firstOfMonthIndex(monthIndex(period.from) - months);
    to = addDays(period.from, -1);
    if (months === 1) label = 'last month';
  } else {
    const length = daysBetween(period.from, period.to) + 1;
    to = addDays(period.from, -1);
    from = addDays(to, -(length - 1));
  }
  if (period.to > today) {
    const elapsed = daysBetween(period.from, today) + 1;
    const matched = addDays(from, elapsed - 1);
    if (matched < to) to = matched;
  }
  return { from, to, label };
}

export type Change =
  { kind: 'none' } | { kind: 'new' } | { kind: 'flat' } | { kind: 'up' | 'down'; text: string };

/** Percentage change using exact integer arithmetic; the denominator is the earlier amount. */
export function percentChange(currentMinor: string, previousMinor: string): Change {
  const current = BigInt(currentMinor);
  const previous = BigInt(previousMinor);
  if (previous === 0n) return current === 0n ? { kind: 'none' } : { kind: 'new' };
  const denominator = previous < 0n ? -previous : previous;
  const basisPoints = ((current - previous) * 10_000n) / denominator;
  if (basisPoints === 0n) return { kind: 'flat' };
  const kind = basisPoints > 0n ? 'up' : 'down';
  const percent = Number(basisPoints < 0n ? -basisPoints : basisPoints) / 100;
  const text =
    percent >= 1000
      ? '999%+'
      : percent >= 10
        ? `${Math.round(percent)}%`
        : `${percent.toFixed(1).replace(/\.0$/, '')}%`;
  return { kind, text };
}
