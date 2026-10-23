import { previousMonth } from './budget';

export interface SpendingEntry {
  type: string;
  amountMinor: string;
  day: string;
  categoryId?: string;
}
const monthDays = (month: string) => {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + 1);
  date.setUTCDate(0);
  return date.getUTCDate();
};
export function spendingInsights(entries: readonly SpendingEntry[], month: string, today: string) {
  if (month > today.slice(0, 7)) throw new Error('Future month has no spending insight');
  const prior = previousMonth(month);
  const partial = month === today.slice(0, 7);
  const days = partial ? Number(today.slice(8)) : monthDays(month);
  const previousDays = partial ? Math.min(days, monthDays(prior)) : monthDays(prior);
  const through = `${month}-${String(days).padStart(2, '0')}`;
  const previousThrough = `${prior}-${String(previousDays).padStart(2, '0')}`;
  const totals = { current: 0n, previous: 0n };
  const categories = new Map<string, { current: bigint; previous: bigint }>();
  for (const entry of entries) {
    const amount = BigInt(entry.amountMinor);
    if (amount <= 0n) throw new Error('Transaction amount must be positive');
    if (entry.type !== 'EXPENSE') continue;
    const period =
      entry.day >= `${month}-01` && entry.day <= through
        ? 'current'
        : entry.day >= `${prior}-01` && entry.day <= previousThrough
          ? 'previous'
          : null;
    if (!period) continue;
    totals[period] += amount;
    if (entry.categoryId) {
      const bucket = categories.get(entry.categoryId) ?? { current: 0n, previous: 0n };
      bucket[period] += amount;
      categories.set(entry.categoryId, bucket);
    }
  }
  const difference = totals.current - totals.previous;
  return {
    month,
    through,
    previousFrom: `${prior}-01`,
    previousThrough,
    days,
    previousDays,
    partial,
    spentMinor: totals.current.toString(),
    previousSpentMinor: totals.previous.toString(),
    dailyAverageMinor: (totals.current / BigInt(days)).toString(),
    changeMinor: difference.toString(),
    changeBasisPoints:
      totals.previous === 0n ? null : ((difference * 10000n) / totals.previous).toString(),
    categoryChanges: [...categories]
      .map(([categoryId, value]) => ({
        categoryId,
        currentMinor: value.current.toString(),
        previousMinor: value.previous.toString(),
        changeMinor: (value.current - value.previous).toString(),
      }))
      .filter((value) => value.changeMinor !== '0')
      .sort((a, b) => {
        const left = BigInt(a.changeMinor) < 0n ? -BigInt(a.changeMinor) : BigInt(a.changeMinor);
        const right = BigInt(b.changeMinor) < 0n ? -BigInt(b.changeMinor) : BigInt(b.changeMinor);
        return left === right ? a.categoryId.localeCompare(b.categoryId) : left > right ? -1 : 1;
      })
      .slice(0, 3),
  };
}
