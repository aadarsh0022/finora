import {
  accountSchema,
  debtSchema,
  debtEventSchema,
  outlookSchema,
  recurringRuleSchema,
  recurringOccurrenceSchema,
  transactionSchema,
  type OutlookFlow,
} from '@finora/contracts';
import {
  accountBalance,
  calendarDate,
  debtLedgerEntries,
  debtProgress,
  nextOccurrence,
} from '@finora/finance-core';
import type { ZodType } from 'zod';
import { database } from '../../database/client';
import type { AuthContext } from '../auth/service';
import { ApiError } from '../../utils/http';

function nearIndex(anchor: string, frequency: string, today: string) {
  const a = new Date(`${anchor}T00:00:00Z`),
    b = new Date(`${today}T00:00:00Z`);
  const days = Math.floor((b.getTime() - a.getTime()) / 86400000);
  const months = (b.getUTCFullYear() - a.getUTCFullYear()) * 12 + b.getUTCMonth() - a.getUTCMonth();
  return Math.max(
    0,
    (frequency === 'DAILY'
      ? days
      : frequency === 'WEEKLY'
        ? Math.floor(days / 7)
        : frequency === 'MONTHLY'
          ? months
          : Math.floor(months / 12)) - 1,
  );
}
export async function getOutlook(context: AuthContext) {
  const { client, db } = await database();
  const session = client.startSession();
  try {
    return await session.withTransaction(
      async () => {
        async function read<T>(name: string, schema: ZodType<T>, cap: number) {
          const rows = await db
            .collection(name)
            .find({ userId: context.user.id }, { session })
            .limit(cap + 1)
            .toArray();
          if (rows.length > cap)
            throw new ApiError(422, 'OUTLOOK_LIMIT', 'This dataset exceeds the planning limit.');
          return rows.map((row) => schema.parse(row));
        }
        const accounts = await read('accounts', accountSchema, 200);
        const transactions = await read('transactions', transactionSchema, 10000);
        const debts = await read('debts', debtSchema, 200);
        const events = await read('debt_events', debtEventSchema, 10000);
        const rules = await read('recurring_rules', recurringRuleSchema, 200);
        const occurrences = await read('recurring_occurrences', recurringOccurrenceSchema, 10000);
        const now = new Date();
        const timezone = context.user.preferences.timezone;
        const today = calendarDate(now, timezone);
        const through = nextOccurrence(today, 'DAILY', 90);
        const posted = transactions.filter(
          (t) => calendarDate(new Date(t.date), timezone) <= today,
        );
        const debtEntries = debtLedgerEntries(events.filter((e) => e.date <= today));
        const flows: OutlookFlow[] = [];
        function add(flow: OutlookFlow) {
          if (flow.day <= through)
            flows.push({
              ...flow,
              overdue: flow.day < today,
              day: flow.day < today ? today : flow.day,
            });
        }
        for (const t of transactions) {
          const day = calendarDate(new Date(t.date), timezone);
          if (day <= today) continue;
          add({
            id: `recorded:${t.id}:from`,
            label: t.type === 'TRANSFER' ? 'Recorded transfer' : 'Recorded future entry',
            day,
            direction: t.type === 'INCOME' ? 'EXPECTED_IN' : 'OUT',
            amountMinor: t.amountMinor,
            accountId: t.accountId,
            ...(t.destinationAccountId ? { counterAccountId: t.destinationAccountId } : {}),
            source: 'RECORDED',
            overdue: false,
          });
          if (t.type === 'TRANSFER' && t.destinationAccountId)
            add({
              id: `recorded:${t.id}:to`,
              label: 'Recorded transfer',
              day,
              direction: 'EXPECTED_IN',
              amountMinor: t.amountMinor,
              accountId: t.destinationAccountId,
              counterAccountId: t.accountId,
              source: 'RECORDED',
              overdue: false,
            });
        }
        const generated = new Set(occurrences.map((o) => `${o.ruleId}:${o.occurrenceIndex}`));
        for (const occurrence of occurrences.filter((o) => o.status === 'PENDING')) {
          add({
            id: `recurring:${occurrence.ruleId}:${occurrence.occurrenceIndex}`,
            label: rules.find((r) => r.id === occurrence.ruleId)?.name ?? 'Recurring item',
            day: occurrence.dueDate,
            direction: occurrence.type === 'EXPENSE' ? 'OUT' : 'EXPECTED_IN',
            amountMinor: occurrence.amountMinor ?? null,
            accountId: occurrence.accountId,
            source: 'RECURRING',
            overdue: false,
          });
        }
        for (const rule of rules) {
          if (rule.paused) continue;
          const localToday = calendarDate(now, rule.timezone);
          const nextDay = nextOccurrence(rule.startDate, rule.frequency, rule.nextIndex);
          if (
            nextDay < localToday &&
            (!rule.endDate || nextDay <= rule.endDate) &&
            !generated.has(`${rule.id}:${rule.nextIndex}`)
          )
            add({
              id: `backlog:${rule.id}`,
              label: `${rule.name} · past schedule needs review`,
              day: today,
              direction: rule.type === 'EXPENSE' ? 'OUT' : 'EXPECTED_IN',
              amountMinor: null,
              accountId: rule.accountId,
              source: 'RECURRING',
              overdue: true,
            });
          for (
            let index = Math.max(
                rule.nextIndex,
                nearIndex(rule.startDate, rule.frequency, localToday),
              ),
              count = 0;
            count < 94;
            index++, count++
          ) {
            const day = nextOccurrence(rule.startDate, rule.frequency, index);
            if (day > through || (rule.endDate && day > rule.endDate)) break;
            if (day < localToday || generated.has(`${rule.id}:${index}`)) continue;
            add({
              id: `recurring:${rule.id}:${index}`,
              label: rule.name,
              day,
              direction: rule.type === 'EXPENSE' ? 'OUT' : 'EXPECTED_IN',
              amountMinor: rule.amountMinor ?? null,
              accountId: rule.accountId,
              source: 'RECURRING',
              overdue: false,
            });
          }
        }
        let undatedDebts = 0,
          overdueDebtCount = 0;
        for (const debt of debts) {
          if (debt.cancelledAt) continue;
          const progress = debtProgress(
            debt.amountMinor,
            events.filter((e) => e.debtId === debt.id),
          );
          if (progress.complete) continue;
          if (!debt.dueDate) {
            if (debt.direction === 'BORROWED') undatedDebts++;
            continue;
          }
          if (debt.dueDate < today) overdueDebtCount++;
          add({
            id: `debt:${debt.id}`,
            label: debt.name,
            day: debt.dueDate,
            direction: debt.direction === 'BORROWED' ? 'OUT' : 'EXPECTED_IN',
            amountMinor: progress.remainingMinor,
            accountId: null,
            source: 'DEBT',
            overdue: false,
          });
        }
        const since = nextOccurrence(today, 'DAILY', 0);
        const start = new Date(`${since}T00:00:00Z`);
        start.setUTCDate(start.getUTCDate() - 6);
        const recent = posted
          .filter(
            (t) => calendarDate(new Date(t.date), timezone) >= start.toISOString().slice(0, 10),
          )
          .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
        return outlookSchema.parse({
          today,
          through,
          generatedAt: now.toISOString(),
          timezone,
          currency: context.user.preferences.baseCurrency,
          accounts: accounts
            .filter((a) => !a.archived)
            .map((a) => ({
              id: a.id,
              name: a.name,
              balanceMinor: accountBalance(a.openingBalanceMinor, a.id, a.currency, [
                ...posted,
                ...debtEntries,
              ]),
            })),
          flows: flows.sort((a, b) => a.day.localeCompare(b.day) || a.id.localeCompare(b.id)),
          undatedDebts,
          pendingRecurringCount: occurrences.filter((o) => o.status === 'PENDING').length,
          overdueDebtCount,
          recentTransactions: recent.slice(0, 50),
          moreRecentCount: Math.max(0, recent.length - 50),
        });
      },
      { readConcern: { level: 'snapshot' } },
    );
  } finally {
    await session.endSession();
  }
}
