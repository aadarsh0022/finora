import {
  accountSchema,
  categorySchema,
  transactionSchema,
  reportSummarySchema,
  type ReportRange,
  type ReportPeriod,
} from '@finora/contracts';
import { accountBalance, calendarDate } from '@finora/finance-core';
import { database } from '../../database/client';
import { ApiError } from '../../utils/http';
import type { AuthContext } from '../auth/service';

function monthAt(month: string, offset: number) {
  const date = new Date(`${month}-01T00:00:00Z`);
  date.setUTCMonth(date.getUTCMonth() + offset);
  return date.toISOString().slice(0, 7);
}
function lastDay(month: string) {
  const next = new Date(`${month}-01T00:00:00Z`);
  next.setUTCMonth(next.getUTCMonth() + 1);
  next.setUTCDate(0);
  return next.toISOString().slice(0, 10);
}
export function reportPeriod(
  context: AuthContext,
  input: ReportRange,
  now = new Date(),
): ReportPeriod {
  const timezone = context.user.preferences.timezone;
  const month = calendarDate(now, timezone).slice(0, 7);
  const endMonth = input.range === 'previous-month' ? monthAt(month, -1) : month;
  const firstOffset =
    input.range === 'last-3-months' ? -2 : input.range === 'last-6-months' ? -5 : 0;
  return {
    range: input.range,
    from: input.range === 'custom' ? input.from! : `${monthAt(endMonth, firstOffset)}-01`,
    to: input.range === 'custom' ? input.to! : lastDay(endMonth),
    timezone,
    currency: context.user.preferences.baseCurrency,
  };
}
export async function reportSummary(context: AuthContext, input: ReportRange) {
  const period = reportPeriod(context, input);
  const { db, client } = await database();
  const session = client.startSession();
  try {
    return await session.withTransaction(
      async () => {
        const owned = { userId: context.user.id };
        const accountDocuments = await db
          .collection('accounts')
          .find(owned, { session })
          .limit(201)
          .toArray();
        const categoryDocuments = await db
          .collection('categories')
          .find(owned, { session })
          .limit(301)
          .toArray();
        const transactionDocuments = await db
          .collection('transactions')
          .find(owned, { session })
          .limit(10001)
          .toArray();
        if (
          accountDocuments.length > 200 ||
          categoryDocuments.length > 300 ||
          transactionDocuments.length > 10000
        )
          throw new ApiError(
            422,
            'REPORT_LIMIT',
            'This dataset exceeds the supported reporting limit.',
          );
        const accounts = accountDocuments.map((record) => accountSchema.parse(record));
        const categories = new Map(
          categoryDocuments.map((record) => {
            const value = categorySchema.parse(record);
            return [value.id, value] as const;
          }),
        );
        const entries = transactionDocuments.map((record) => {
          const transaction = transactionSchema.parse(record);
          return { transaction, day: calendarDate(new Date(transaction.date), period.timezone) };
        });
        const selected = entries.filter(
          (entry) => entry.day >= period.from && entry.day <= period.to,
        );
        const categoryTotals = new Map<string, bigint>();
        const months = new Map<string, { income: bigint; expenses: bigint }>();
        const firstMonth = period.from.slice(0, 7);
        const monthsBetween =
          (Number(period.to.slice(0, 4)) - Number(period.from.slice(0, 4))) * 12 +
          Number(period.to.slice(5, 7)) -
          Number(period.from.slice(5, 7));
        for (let offset = 0; offset <= monthsBetween; offset++)
          months.set(monthAt(firstMonth, offset), { income: 0n, expenses: 0n });
        let income = 0n;
        let expenses = 0n;
        for (const { transaction, day } of selected) {
          if (transaction.type === 'TRANSFER') continue;
          const amount = BigInt(transaction.amountMinor);
          const bucket = months.get(day.slice(0, 7))!;
          if (transaction.type === 'INCOME') {
            income += amount;
            bucket.income += amount;
          } else {
            expenses += amount;
            bucket.expenses += amount;
          }
          if (transaction.categoryId)
            categoryTotals.set(
              transaction.categoryId,
              (categoryTotals.get(transaction.categoryId) ?? 0n) + amount,
            );
        }
        const before = entries
          .filter((entry) => entry.day < period.from)
          .map((entry) => entry.transaction);
        const through = entries
          .filter((entry) => entry.day <= period.to)
          .map((entry) => entry.transaction);
        const accountRows = accounts
          .map((account) => {
            let accountIncome = 0n;
            let accountExpenses = 0n;
            let transferIn = 0n;
            let transferOut = 0n;
            for (const { transaction } of selected) {
              const amount = BigInt(transaction.amountMinor);
              if (transaction.accountId === account.id) {
                if (transaction.type === 'INCOME') accountIncome += amount;
                else if (transaction.type === 'EXPENSE') accountExpenses += amount;
                else transferOut += amount;
              }
              if (
                transaction.type === 'TRANSFER' &&
                transaction.destinationAccountId === account.id
              )
                transferIn += amount;
            }
            return {
              accountId: account.id,
              name: account.name,
              archived: account.archived,
              openingBalanceMinor: accountBalance(
                account.openingBalanceMinor,
                account.id,
                account.currency,
                before,
              ),
              closingBalanceMinor: accountBalance(
                account.openingBalanceMinor,
                account.id,
                account.currency,
                through,
              ),
              incomeMinor: accountIncome.toString(),
              expensesMinor: accountExpenses.toString(),
              transferInMinor: transferIn.toString(),
              transferOutMinor: transferOut.toString(),
              netMinor: (accountIncome - accountExpenses + transferIn - transferOut).toString(),
            };
          })
          .sort((a, b) => a.name.localeCompare(b.name) || a.accountId.localeCompare(b.accountId));
        const categoryRows = [...categoryTotals]
          .map(([categoryId, amount]) => {
            const category = categories.get(categoryId);
            if (!category)
              throw new ApiError(422, 'INVALID_REFERENCE', 'A transaction category is missing.');
            const total = category.type === 'INCOME' ? income : expenses;
            return {
              categoryId,
              name: category.name,
              type: category.type,
              amountMinor: amount.toString(),
              shareBasisPoints: total === 0n ? 0 : Number((amount * 10000n) / total),
            };
          })
          .sort((a, b) => {
            const amount = BigInt(b.amountMinor) - BigInt(a.amountMinor);
            return (
              (amount > 0n ? 1 : amount < 0n ? -1 : 0) || a.categoryId.localeCompare(b.categoryId)
            );
          });
        return reportSummarySchema.parse({
          period,
          cashflow: {
            incomeMinor: income.toString(),
            expensesMinor: expenses.toString(),
            netMinor: (income - expenses).toString(),
            savingsRateBasisPoints:
              income === 0n ? null : (((income - expenses) * 10000n) / income).toString(),
          },
          categories: categoryRows,
          accounts: accountRows,
          trends: [...months].map(([month, totals]) => ({
            month,
            incomeMinor: totals.income.toString(),
            expensesMinor: totals.expenses.toString(),
            netMinor: (totals.income - totals.expenses).toString(),
          })),
        });
      },
      { readConcern: { level: 'snapshot' } },
    );
  } finally {
    await session.endSession();
  }
}
