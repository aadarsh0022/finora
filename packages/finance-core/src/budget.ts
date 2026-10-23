export interface CategoryBudget {
  id: string;
  month: string;
  categoryId: string;
  amountMinor: string;
  rollover: boolean;
}
export function previousMonth(month: string) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() - 1);
  return date.toISOString().slice(0, 7);
}
export function budgetRollover<T extends CategoryBudget>(
  budgets: readonly T[],
  spending: ReadonlyMap<string, string>,
) {
  const states = new Map<string, bigint>();
  return [...budgets]
    .sort((a, b) => a.month.localeCompare(b.month) || a.id.localeCompare(b.id))
    .map((budget) => {
      const prior = states.get(`${previousMonth(budget.month)}:${budget.categoryId}`) ?? 0n;
      const carried = budget.rollover && prior > 0n ? prior : 0n;
      const base = BigInt(budget.amountMinor);
      const spent = BigInt(spending.get(`${budget.month}:${budget.categoryId}`) ?? '0');
      if (base <= 0n || spent < 0n) throw new Error('Invalid budget amounts');
      const effective = base + carried;
      const remaining = effective - spent;
      states.set(`${budget.month}:${budget.categoryId}`, remaining);
      return {
        ...budget,
        carriedMinor: carried.toString(),
        effectiveLimitMinor: effective.toString(),
        spentMinor: spent.toString(),
        remainingMinor: remaining.toString(),
        overBudget: remaining < 0n,
      };
    });
}
