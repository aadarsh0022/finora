import {
  assistantPlanArgsSchema,
  assistantRecordsArgsSchema,
  assistantChangeArgsSchema,
  assistantChangeSchema,
} from './assistant-operations';
import { z } from 'zod';
import { calendarDaySchema, monthSchema } from './advanced';
import { entityIdSchema } from './finance';
import { currencySchema, positiveMinorSchema } from './primitives';

export const assistantBalanceArgsSchema = z
  .object({ accountId: entityIdSchema.nullable() })
  .strict();
export const assistantPeriodArgsSchema = z
  .object({ from: calendarDaySchema, to: calendarDaySchema })
  .strict()
  .superRefine((value, context) => {
    const days = (Date.parse(value.to) - Date.parse(value.from)) / 86400000;
    if (days < 0 || days > 365)
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'Choose an ordered period of at most 366 days.',
      });
  });
export const assistantBudgetArgsSchema = z.object({ month: monthSchema }).strict();
export const assistantDebtArgsSchema = z.object({}).strict();

export const assistantToolCallSchema = z.discriminatedUnion('name', [
  z.object({ name: z.literal('plan_finances'), arguments: assistantPlanArgsSchema }).strict(),
  z.object({ name: z.literal('read_records'), arguments: assistantRecordsArgsSchema }).strict(),
  z.object({ name: z.literal('get_balance'), arguments: assistantBalanceArgsSchema }).strict(),
  z.object({ name: z.literal('get_cashflow'), arguments: assistantPeriodArgsSchema }).strict(),
  z
    .object({ name: z.literal('get_category_spending'), arguments: assistantPeriodArgsSchema })
    .strict(),
  z.object({ name: z.literal('get_budget_status'), arguments: assistantBudgetArgsSchema }).strict(),
  z.object({ name: z.literal('get_debt_summary'), arguments: assistantDebtArgsSchema }).strict(),
]);
export type AssistantToolCall = z.infer<typeof assistantToolCallSchema>;

const integer = z.string().regex(/^(0|-?[1-9]\d*)$/);
const unsigned = z.string().regex(/^(0|[1-9]\d*)$/);
const metadata = {
  currency: currencySchema,
  timezone: z.string(),
  retrievedAt: z.iso.datetime(),
  source: z.literal('server-recorded'),
  includesLocalPending: z.literal(false),
  readOnly: z.literal(true),
};
const period = { from: calendarDaySchema, to: calendarDaySchema };
export const assistantBalanceResultSchema = z.object({
  name: z.literal('get_balance'),
  ...metadata,
  data: z.object({
    totalBalanceMinor: integer,
    includesArchived: z.literal(true),
    accounts: z.array(
      z.object({
        id: entityIdSchema,
        name: z.string(),
        archived: z.boolean(),
        balanceMinor: integer,
      }),
    ),
  }),
});
export const assistantCashflowResultSchema = z.object({
  name: z.literal('get_cashflow'),
  ...metadata,
  data: z.object({ ...period, incomeMinor: unsigned, expensesMinor: unsigned, netMinor: integer }),
});
export const assistantSpendingResultSchema = z.object({
  name: z.literal('get_category_spending'),
  ...metadata,
  data: z.object({
    ...period,
    totalExpensesMinor: unsigned,
    categories: z.array(
      z.object({
        categoryId: entityIdSchema,
        name: z.string(),
        amountMinor: unsigned,
        shareBasisPoints: z.number().int().min(0).max(10000),
      }),
    ),
  }),
});
export const assistantBudgetResultSchema = z.object({
  name: z.literal('get_budget_status'),
  ...metadata,
  data: z.object({
    month: monthSchema,
    total: z.object({
      limitMinor: unsigned.nullable(),
      spentMinor: unsigned,
      remainingMinor: integer.nullable(),
      warningReached: z.boolean(),
    }),
    categories: z.array(
      z.object({
        categoryId: entityIdSchema,
        name: z.string(),
        effectiveLimitMinor: unsigned,
        spentMinor: unsigned,
        remainingMinor: integer,
        warningReached: z.boolean(),
      }),
    ),
  }),
});
export const assistantDebtResultSchema = z.object({
  name: z.literal('get_debt_summary'),
  ...metadata,
  data: z.object({
    owedByYouMinor: unsigned,
    personalLoansOwedToYouMinor: unsigned,
    expectedReceiptsMinor: unsigned,
    overdueOwedByYouMinor: unsigned,
    overduePersonalLoansOwedToYouMinor: unsigned,
    overdueExpectedReceiptsMinor: unsigned,
    openRecordCount: z.number().int().nonnegative(),
    excludesArchivedAndCancelled: z.literal(true),
  }),
});
export const assistantRecordsResultSchema = z.object({
  name: z.literal('read_records'),
  ...metadata,
  data: z.object({
    facts: z.array(z.string().max(300)).max(30).default([]),
    title: z.string(),
    summary: z.string().max(1200),
    total: z.number().int().nonnegative(),
    items: z
      .array(
        z.object({
          id: z.string().optional(),
          title: z.string(),
          detail: z.string().max(1600),
          amountMinor: integer.optional(),
        }),
      )
      .max(100),
  }),
});
export const assistantPlanResultSchema = assistantRecordsResultSchema.extend({
  name: z.literal('plan_finances'),
});
export const assistantToolResultSchema = z.discriminatedUnion('name', [
  assistantPlanResultSchema,
  assistantRecordsResultSchema,
  assistantBalanceResultSchema,
  assistantCashflowResultSchema,
  assistantSpendingResultSchema,
  assistantBudgetResultSchema,
  assistantDebtResultSchema,
]);
export type AssistantToolResult = z.infer<typeof assistantToolResultSchema>;

export const assistantTransactionArgsSchema = z
  .object({
    type: z.enum(['EXPENSE', 'INCOME', 'TRANSFER']),
    amount: z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .max(35)
      .nullable(),
    currency: currencySchema.nullable(),
    date: calendarDaySchema.nullable(),
    accountName: z.string().trim().min(1).max(80).nullable(),
    destinationAccountName: z.string().trim().min(1).max(80).nullable(),
    categoryName: z.string().trim().min(1).max(80).nullable(),
    merchant: z.string().max(120).nullable(),
    note: z.string().max(1000).nullable(),
  })
  .strict();
export const assistantTransactionDraftSchema = z
  .object({
    type: z.enum(['EXPENSE', 'INCOME', 'TRANSFER']),
    amountMinor: positiveMinorSchema.nullable(),
    currency: currencySchema,
    timezone: z.string(),
    date: calendarDaySchema,
    accountId: entityIdSchema.nullable(),
    destinationAccountId: entityIdSchema.nullable(),
    categoryId: entityIdSchema.nullable(),
    accountName: z.string().nullable(),
    destinationAccountName: z.string().nullable(),
    categoryName: z.string().nullable(),
    merchant: z.string().max(120),
    note: z.string().max(1000),
    missingFields: z.array(z.enum(['amount', 'account', 'destination', 'category'])),
    requiresConfirmation: z.literal(true),
  })
  .strict();
export type AssistantTransactionDraft = z.infer<typeof assistantTransactionDraftSchema>;
export const assistantPolicyVersion = '2026-10-24-v3' as const;
export const assistantConsentInputSchema = z
  .object({ policyVersion: z.literal(assistantPolicyVersion) })
  .strict();
export const assistantCapabilitiesSchema = z.object({
  remembersConsent: z.boolean().default(false),
  consentAccepted: z.boolean().default(false),
  enabled: z.boolean(),
  readOnly: z.boolean(),
  provider: z.literal('OpenAI'),
  model: z.literal('gpt-6-luna'),
  policyVersion: z.literal(assistantPolicyVersion),
});
export const assistantChatInputSchema = z
  .object({
    question: z.string().trim().min(1).max(1000),
    previousQuestions: z.array(z.string().trim().min(1).max(1000)).max(3),
    acceptedPolicyVersion: z.literal(assistantPolicyVersion),
    previousReplies: z.array(z.string().max(1200)).max(3).default([]),
  })
  .strict();
export const legacyAssistantChatInputSchema = assistantChatInputSchema.extend({
  acceptedPolicyVersion: z.literal('2026-10-23-v2'),
});
export const assistantFollowUpArgsSchema = z
  .object({
    reason: z.enum(['date_range', 'account_selection', 'unsupported', 'one_question']),
  })
  .strict();
export const assistantSelectionSchema = z.union([
  assistantToolCallSchema,
  z.object({ name: z.literal('prepare_change'), arguments: assistantChangeArgsSchema }).strict(),
  z
    .object({ name: z.literal('prepare_transaction'), arguments: assistantTransactionArgsSchema })
    .strict(),
  z.object({ name: z.literal('ask_follow_up'), arguments: assistantFollowUpArgsSchema }).strict(),
]);
export const assistantChatResponseSchema = z.object({
  answerId: z.uuid(),
  kind: z.enum(['answer', 'clarification', 'unsupported', 'draft', 'change']),
  message: z.string().max(4000),
  conversational: z.boolean().default(false),
  result: assistantToolResultSchema.nullable(),
  draft: assistantTransactionDraftSchema.nullable().default(null),
  change: assistantChangeSchema.nullable().default(null),
});
export type AssistantChatResponse = z.infer<typeof assistantChatResponseSchema>;
export const assistantFeedbackInputSchema = z
  .object({
    answerId: z.uuid(),
    reason: z.enum(['incorrect', 'unclear', 'unsafe', 'other']),
  })
  .strict();
