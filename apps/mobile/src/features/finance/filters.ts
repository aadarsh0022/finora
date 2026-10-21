import { calendarDaySchema, transactionFilterSchema, type Currency } from '@finora/contracts';
import { calendarDate, parseMoney } from '@finora/finance-core';

export interface ActivityFilters {
  q: string;
  type: string;
  accountId: string;
  categoryId: string;
  sort: string;
  from: string;
  to: string;
  min: string;
  max: string;
}
export const emptyActivityFilters: ActivityFilters = {
  q: '',
  type: 'all',
  accountId: 'all',
  categoryId: 'all',
  sort: 'newest',
  from: '',
  to: '',
  min: '',
  max: '',
};
function dayBoundary(day: string, timezone: string, end: boolean) {
  calendarDaySchema.parse(day);
  const base = new Date(`${day}T00:00:00Z`).getTime();
  let left = base - 48 * 3600000;
  let right = base + 48 * 3600000;
  while (left < right) {
    const middle = Math.floor((left + right) / 2);
    const local = calendarDate(new Date(middle), timezone);
    if (end ? local <= day : local < day) left = middle + 1;
    else right = middle;
  }
  const result = new Date(end ? left - 1 : left);
  if (calendarDate(result, timezone) !== day)
    throw new Error('This date does not exist in your timezone.');
  return result.toISOString();
}
export function activityQuery(filters: ActivityFilters, currency: Currency, timezone: string) {
  const validated = transactionFilterSchema.parse({
    ...(filters.q.trim() ? { q: filters.q.trim() } : {}),
    ...(filters.type !== 'all' ? { type: filters.type } : {}),
    ...(filters.accountId !== 'all' ? { accountId: filters.accountId } : {}),
    ...(filters.categoryId !== 'all' ? { categoryId: filters.categoryId } : {}),
    ...(filters.from ? { from: dayBoundary(filters.from, timezone, false) } : {}),
    ...(filters.to ? { to: dayBoundary(filters.to, timezone, true) } : {}),
    ...(filters.min.trim() ? { minAmount: parseMoney(filters.min, currency) } : {}),
    ...(filters.max.trim() ? { maxAmount: parseMoney(filters.max, currency) } : {}),
    sort: filters.sort,
  });
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(validated))
    if (key !== 'page' && key !== 'pageSize') params.set(key, String(value));
  return params.toString();
}
