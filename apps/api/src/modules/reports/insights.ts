import { categorySchema, spendingInsightsSchema } from '@finora/contracts';
import { calendarDate, spendingInsights } from '@finora/finance-core';
import { ledgerSnapshot } from '../finance/ledger';
import { database } from '../../database/client';
import type { AuthContext } from '../auth/service';
import { ApiError } from '../../utils/http';

export async function getInsights(context: AuthContext, month?: string) {
  const timezone = context.user.preferences.timezone;
  const today = calendarDate(new Date(), timezone);
  const selected = month ?? today.slice(0, 7);
  if (selected > today.slice(0, 7) || selected === '1000-01')
    throw new ApiError(400, 'INSIGHT_PERIOD', 'Choose a recorded month after January 1000.');
  const { transactions } = await ledgerSnapshot(context);
  const result = spendingInsights(
    transactions.map((t) => ({ ...t, day: calendarDate(new Date(t.date), timezone) })),
    selected,
    today,
  );
  const { db } = await database();
  const categories = new Map(
    (await db.collection('categories').find({ userId: context.user.id }).limit(301).toArray()).map(
      (r) => {
        const c = categorySchema.parse(r);
        return [c.id, c.name];
      },
    ),
  );
  return spendingInsightsSchema.parse({
    ...result,
    currency: context.user.preferences.baseCurrency,
    timezone,
    categoryChanges: result.categoryChanges.map((c) => ({
      ...c,
      name: categories.get(c.categoryId) ?? 'Archived category',
    })),
  });
}
