import { assistantPlanArgsSchema, assistantPlanResultSchema } from '@finora/contracts';
import {
  addMonthsToKey,
  calendarDate,
  formatMoney,
  getCurrentMonthKey,
  parseMoney,
} from '@finora/finance-core';
import type { AuthContext } from '../auth/service';
import { overview } from '../finance/ledger';
import { reportSummary } from '../reports/service';
import { readEmi } from './emi-records';
export async function planFinances(context: AuthContext, value: unknown) {
  const input = assistantPlanArgsSchema.parse(value);
  const { baseCurrency: currency, timezone, locale } = context.user.preferences;
  const snapshot = await overview(context);
  const today = calendarDate(new Date(), timezone);
  const money = (v: bigint) => formatMoney(v.toString(), currency, locale);
  const income = BigInt(
    input.monthlyIncome === null ? snapshot.incomeMinor : parseMoney(input.monthlyIncome, currency),
  );
  const costs = BigInt(
    input.essentialCosts === null
      ? snapshot.expensesMinor
      : parseMoney(input.essentialCosts, currency),
  );
  const facts = [
    `Recorded account balance: ${formatMoney(snapshot.totalBalanceMinor, currency, locale)}. This is not a live bank balance or an affordability guarantee.`,
    `${input.monthlyIncome === null ? `Recorded income so far in ${today.slice(0, 7)}` : 'User-supplied monthly income assumption'}: ${money(income)}.`,
    `${input.essentialCosts === null ? `Recorded spending so far in ${today.slice(0, 7)}, not a complete monthly cost estimate` : 'User-supplied monthly essential-cost assumption'}: ${money(costs)}.`,
    `Difference between those income and cost inputs: ${money(income - costs)}. Future bills, debt payments and unrecorded costs may reduce it.`,
  ];
  if (input.targetAmount !== null) {
    const target = BigInt(parseMoney(input.targetAmount, currency));
    facts.push(`User's hypothetical savings target: ${money(target)}.`);
    if (input.months !== null) {
      const months = BigInt(input.months);
      facts.push(
        `For ${input.months} months, the required monthly contribution rounded up to the smallest currency unit is ${money((target + months - 1n) / months)}.`,
      );
    }
  }
  // The plan gathers what it needs itself: recent real cash flow, loan obligations and the
  // income forecast, so the user never has to repeat what the app already knows.
  const monthKey = getCurrentMonthKey(timezone);
  const first = addMonthsToKey(monthKey, -3);
  const lastDay = new Date(Date.UTC(+monthKey.slice(0, 4), +monthKey.slice(5, 7) - 1, 0))
    .getUTCDate()
    .toString()
    .padStart(2, '0');
  const past = await reportSummary(context, {
    range: 'custom',
    from: `${first}-01`,
    to: `${addMonthsToKey(monthKey, -1)}-${lastDay}`,
  }).catch(() => null);
  let averageIncome: bigint | null = null;
  let averageSpend: bigint | null = null;
  if (
    past &&
    (BigInt(past.cashflow.incomeMinor) > 0n || BigInt(past.cashflow.expensesMinor) > 0n)
  ) {
    averageIncome = BigInt(past.cashflow.incomeMinor) / 3n;
    averageSpend = BigInt(past.cashflow.expensesMinor) / 3n;
    facts.push(
      `Average over the last 3 full months: income ${money(averageIncome)} and spending ${money(averageSpend)} per month, leaving ${money(averageIncome - averageSpend)} per month.`,
    );
  }
  const emiInput = { record: null, query: null, month: null };
  const [emi, forecast] = await Promise.all([
    readEmi(context, { ...emiInput, feature: 'emi_summary' }).catch(() => null),
    readEmi(context, { ...emiInput, feature: 'emi_forecast' }).catch(() => null),
  ]);
  if (emi?.items.length)
    for (const item of emi.items)
      facts.push(
        `Loans and EMIs, ${item.title}: ${item.detail}${item.amountMinor ? `; amount ${money(BigInt(item.amountMinor))}` : ''}.`,
      );
  if (forecast?.items.length)
    for (const item of forecast.items.slice(0, 6))
      facts.push(`Forecast ${item.title}: ${item.detail}.`);
  if (averageIncome !== null && averageSpend !== null) {
    // Spending already includes EMIs that were paid as normal expenses, so it is not subtracted twice.
    facts.push(
      'Average spending above may already include EMIs paid as expenses, so do not subtract EMIs from it again.',
    );
  }
  return assistantPlanResultSchema.parse({
    name: 'plan_finances',
    currency,
    timezone,
    retrievedAt: new Date().toISOString(),
    source: 'server-recorded',
    includesLocalPending: false,
    readOnly: true,
    data: {
      title: 'Financial plan',
      facts,
      summary:
        'We can build a plan around your goals, income and commitments. Tell me which goal matters most and whether these monthly assumptions look right.',
      total: 0,
      items: [],
    },
  });
}
