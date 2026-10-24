import { assistantPlanArgsSchema, assistantPlanResultSchema } from '@finora/contracts';
import { calendarDate, formatMoney, parseMoney } from '@finora/finance-core';
import type { AuthContext } from '../auth/service';
import { overview } from '../finance/ledger';
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
