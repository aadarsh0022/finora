import { z } from 'zod';
import {
  assistantBalanceArgsSchema,
  assistantPeriodArgsSchema,
  assistantBudgetArgsSchema,
  assistantDebtArgsSchema,
  assistantToolCallSchema,
  assistantToolResultSchema,
  type AssistantToolCall,
  type AssistantToolResult,
} from '@finora/contracts';
import type { AuthContext } from '../auth/service';
import { ledgerSnapshot } from '../finance/ledger';
import { listCategories } from '../finance/entities';
import { reportSummary } from '../reports/service';
import { listBudgets, totalLimit } from '../advanced/budgets';
import { listDebts } from '../debts/service';
import { ApiError } from '../../utils/http';

function definition(name: AssistantToolCall['name'], description: string, schema: z.ZodType) {
  const parameters = z.toJSONSchema(schema);
  delete parameters.$schema;
  return { type: 'function' as const, name, description, strict: true as const, parameters };
}

// The model may choose a function and arguments. Identity is never an argument.
export const readOnlyToolDefinitions = [
  definition(
    'get_balance',
    'Read recorded account balances. Use accountId null for all accounts, including archived accounts. This is not a bank balance or spendable forecast. Local unsynced changes are excluded.',
    assistantBalanceArgsSchema,
  ),
  definition(
    'get_cashflow',
    'Read recorded income, expenses and net cash flow for inclusive calendar dates in the user timezone, at most 366 days. Transfers and debt principal movements are excluded.',
    assistantPeriodArgsSchema,
  ),
  definition(
    'get_category_spending',
    'Read expense totals and category shares for inclusive calendar dates in the user timezone, at most 366 days. Transfers are excluded.',
    assistantPeriodArgsSchema,
  ),
  definition(
    'get_budget_status',
    'Read the overall and category spending limits for a YYYY-MM month, including category rollover. An absent total limit is null, not zero. Overall and category limits must not be added together.',
    assistantBudgetArgsSchema,
  ),
  definition(
    'get_debt_summary',
    'Read outstanding personal borrowing, personal lending and expected receipts as separate totals. Excludes archived, cancelled and settled records. Expected receipts are not available cash.',
    assistantDebtArgsSchema,
  ),
] as const;

export async function runReadOnlyTool(
  context: AuthContext,
  value: unknown,
): Promise<AssistantToolResult> {
  const call = assistantToolCallSchema.parse(value);
  const metadata = {
    currency: context.user.preferences.baseCurrency,
    timezone: context.user.preferences.timezone,
    source: 'server-recorded' as const,
    includesLocalPending: false as const,
    readOnly: true as const,
  };
  let data: unknown;
  switch (call.name) {
    case 'get_balance': {
      const snapshot = await ledgerSnapshot(context);
      const accounts = snapshot.accounts.filter(
        (a) => call.arguments.accountId === null || a.id === call.arguments.accountId,
      );
      if (call.arguments.accountId !== null && !accounts.length)
        throw new ApiError(404, 'NOT_FOUND', 'This account was not found.');
      data = {
        totalBalanceMinor: accounts.reduce((sum, a) => sum + BigInt(a.balanceMinor), 0n).toString(),
        includesArchived: true,
        accounts: accounts.map(({ id, name, archived, balanceMinor }) => ({
          id,
          name,
          archived,
          balanceMinor,
        })),
      };
      break;
    }
    case 'get_cashflow':
    case 'get_category_spending': {
      const report = await reportSummary(context, { range: 'custom', ...call.arguments });
      data =
        call.name === 'get_cashflow'
          ? {
              ...call.arguments,
              incomeMinor: report.cashflow.incomeMinor,
              expensesMinor: report.cashflow.expensesMinor,
              netMinor: report.cashflow.netMinor,
            }
          : {
              ...call.arguments,
              totalExpensesMinor: report.cashflow.expensesMinor,
              categories: report.categories
                .filter((c) => c.type === 'EXPENSE')
                .map(({ categoryId, name, amountMinor, shareBasisPoints }) => ({
                  categoryId,
                  name,
                  amountMinor,
                  shareBasisPoints,
                })),
            };
      break;
    }
    case 'get_budget_status': {
      const { month } = call.arguments;
      const budgets = await listBudgets(context, month);
      const total = await totalLimit(context, month);
      const categories = new Map((await listCategories(context, true)).map((c) => [c.id, c.name]));
      data = {
        month,
        total: {
          limitMinor: total.plan?.amountMinor ?? null,
          spentMinor: total.spentMinor,
          remainingMinor: total.remainingMinor,
          warningReached: total.warningReached,
        },
        categories: budgets.map((b) => ({
          categoryId: b.categoryId,
          name: categories.get(b.categoryId) ?? 'Category',
          effectiveLimitMinor: b.effectiveLimitMinor,
          spentMinor: b.spentMinor,
          remainingMinor: b.remainingMinor,
          warningReached: b.warningReached,
        })),
      };
      break;
    }
    case 'get_debt_summary': {
      const debts = (await listDebts(context)).filter(
        (d) => !d.archived && !d.cancelledAt && d.status !== 'SETTLED',
      );
      const sum = (direction: 'BORROWED' | 'LENT', personal: boolean, overdue = false) =>
        debts
          .filter(
            (d) =>
              d.direction === direction &&
              (d.kind === 'PERSONAL_LOAN') === personal &&
              (!overdue || d.status === 'OVERDUE'),
          )
          .reduce((total, d) => total + BigInt(d.remainingMinor), 0n)
          .toString();
      data = {
        owedByYouMinor: sum('BORROWED', true),
        personalLoansOwedToYouMinor: sum('LENT', true),
        expectedReceiptsMinor: sum('LENT', false),
        overdueOwedByYouMinor: sum('BORROWED', true, true),
        overduePersonalLoansOwedToYouMinor: sum('LENT', true, true),
        overdueExpectedReceiptsMinor: sum('LENT', false, true),
        openRecordCount: debts.length,
        excludesArchivedAndCancelled: true,
      };
      break;
    }
  }
  // Invalid service results fail closed; no raw documents reach a caller or model.
  return assistantToolResultSchema.parse({
    name: call.name,
    ...metadata,
    retrievedAt: new Date().toISOString(),
    data,
  });
}
