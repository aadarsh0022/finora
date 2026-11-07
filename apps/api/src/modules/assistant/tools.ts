import { z } from 'zod';
import {
  assistantPlanArgsSchema,
  assistantRecordsArgsSchema,
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
import { planFinances } from './planning';
import { readRecords } from './records';
import { ledgerSnapshot } from '../finance/ledger';
import { listCategories } from '../finance/entities';
import { reportSummary } from '../reports/service';
import { listBudgets, totalLimit } from '../advanced/budgets';
import { listDebts } from '../debts/service';
import { PrivateCache, privateCacheKey } from './cache';
import { ApiError } from '../../utils/http';

function definition(name: AssistantToolCall['name'], description: string, schema: z.ZodType) {
  const parameters = z.toJSONSchema(schema);
  delete parameters.$schema;
  return { type: 'function' as const, name, description, strict: true as const, parameters };
}

// The model may choose a function and arguments. Identity is never an argument.
export const readOnlyToolDefinitions = [
  definition(
    'plan_finances',
    'Explore a personal household budget or savings plan without saving anything. Supply only explicit user-stated assumptions in major currency units; unspecified inputs are null. The server calculates exact scenarios. Discussing a plan is a read; saving it requires prepare_change and user confirmation.',
    assistantPlanArgsSchema,
  ),
  definition(
    'read_records',
    'Read owned accounts, categories, filtered transactions, budgets, goals, contributions, debts, repayments, loans and EMIs (features emi_summary, emi_loans, emi_history with record=loan, emi_upcoming, emi_payoff with query snowball or avalanche, emi_schedule, emi_forecast, emi_income, emi_prepayments), recurring items, due occurrences, preferences, insights or AI usage. For a named account or specific item, use record with the name stated by the user. Does not change anything. Null means unspecified; never invent IDs.',
    assistantRecordsArgsSchema,
  ),
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

async function executeReadOnlyTool(
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
    case 'plan_finances':
      return planFinances(context, call.arguments);
    case 'read_records':
      return readRecords(context, call.arguments);
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

const readCache = new PrivateCache<AssistantToolResult>();
export async function runReadOnlyTool(
  context: AuthContext,
  value: unknown,
): Promise<AssistantToolResult> {
  const call = assistantToolCallSchema.parse(value);
  const key = privateCacheKey([
    'read-v3',
    context.user.id,
    context.user.authVersion,
    context.user.settingsVersion,
    context.user.financeVersion,
    context.user.preferences,
    call,
    new Date().toISOString().slice(0, 10),
  ]);
  const cached = readCache.get(key);
  if (cached) return assistantToolResultSchema.parse(cached);
  const result = await executeReadOnlyTool(context, call);
  readCache.put(key, result, 15000);
  return result;
}
