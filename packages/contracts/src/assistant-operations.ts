import { z } from 'zod';
import { calendarDaySchema, monthSchema } from './advanced';
export const assistantReadFeatureSchema = z.enum([
  'accounts',
  'categories',
  'transactions',
  'budgets',
  'monthly_budget',
  'goals',
  'contributions',
  'debts',
  'repayments',
  'recurring',
  'occurrences',
  'preferences',
  'insights',
  'ai_usage',
  'emi_summary',
  'emi_loans',
  'emi_history',
  'emi_upcoming',
  'emi_payoff',
  'emi_schedule',
  'emi_forecast',
  'emi_income',
  'emi_prepayments',
]);
export const assistantRecordsArgsSchema = z
  .object({
    feature: assistantReadFeatureSchema,
    record: z.string().trim().min(1).max(120).nullable(),
    query: z.string().trim().min(1).max(80).nullable(),
    month: monthSchema.nullable(),
    from: calendarDaySchema.nullable(),
    to: calendarDaySchema.nullable(),
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).nullable(),
  })
  .strict();
export const assistantOperationSchema = z.enum([
  'create_account',
  'update_account',
  'archive_account',
  'restore_account',
  'create_category',
  'update_category',
  'archive_category',
  'restore_category',
  'create_transaction',
  'update_transaction',
  'delete_transaction',
  'create_budget',
  'update_budget',
  'delete_budget',
  'set_monthly_budget',
  'delete_monthly_budget',
  'copy_budgets',
  'create_goal',
  'update_goal',
  'archive_goal',
  'restore_goal',
  'delete_goal',
  'add_contribution',
  'delete_contribution',
  'create_debt',
  'update_debt',
  'archive_debt',
  'restore_debt',
  'cancel_debt',
  'record_repayment',
  'reverse_repayment',
  'create_recurring',
  'update_recurring',
  'pause_recurring',
  'resume_recurring',
  'delete_recurring',
  'generate_recurring',
  'confirm_occurrence',
  'update_preferences',
  'create_emi_loan',
  'update_emi_loan',
  'archive_emi_loan',
  'restore_emi_loan',
  'delete_emi_loan',
  'pay_emi',
  'unpay_emi',
  'add_emi_prepayment',
  'delete_emi_prepayment',
  'create_emi_income',
  'update_emi_income',
  'delete_emi_income',
]);
export const assistantValueFieldSchema = z.enum([
  'name',
  'type',
  'kind',
  'direction',
  'openingBalance',
  'amount',
  'target',
  'date',
  'startDate',
  'endDate',
  'targetDate',
  'dueDate',
  'account',
  'destination',
  'category',
  'merchant',
  'note',
  'tags',
  'month',
  'fromMonth',
  'toMonth',
  'frequency',
  'amountMode',
  'rollover',
  'copyRollover',
  'warningThresholdPercent',
  'preferredTheme',
  'timezone',
  'locale',
  'firstDayOfWeek',
  'preferredDateFormat',
  'baseCurrency',
  'monthlyAmount',
  'principalRemaining',
  'startMonth',
  'endMonth',
  'dueDay',
  'loanTag',
  'interestRatePct',
]);
export const assistantChangeArgsSchema = z
  .object({
    operation: assistantOperationSchema,
    record: z.string().trim().min(1).max(120).nullable(),
    parent: z.string().trim().min(1).max(120).nullable(),
    values: z
      .array(z.object({ field: assistantValueFieldSchema, value: z.string().max(1000) }).strict())
      .max(30),
  })
  .strict()
  .refine(
    (v) => new Set(v.values.map((f) => f.field)).size === v.values.length,
    'Each field may be supplied only once',
  );
export const assistantChangeSchema = z.object({
  id: z.uuid(),
  input: assistantChangeArgsSchema,
  title: z.string().max(160),
  impact: z.string().max(350),
  rows: z.array(z.object({ label: z.string().max(120), value: z.string().max(1200) })).max(40),
  questions: z
    .array(
      z.object({
        key: z.string().max(100),
        label: z.string().max(240),
        options: z
          .array(z.object({ value: z.string().max(120), label: z.string().max(240) }))
          .max(200),
      }),
    )
    .max(32),
  token: z.string().max(12000).nullable(),
  requiresConfirmation: z.literal(true),
});
export const assistantConfirmInputSchema = z
  .object({ token: z.string().min(20).max(12000), confirmed: z.literal(true) })
  .strict();
export const assistantConfirmResultSchema = z.object({
  id: z.uuid(),
  message: z.string().max(350),
});
export type AssistantChange = z.infer<typeof assistantChangeSchema>;
export type AssistantChangeInput = z.infer<typeof assistantChangeArgsSchema>;

export const assistantPlanArgsSchema = z
  .object({
    targetAmount: z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .max(35)
      .nullable(),
    months: z.number().int().min(1).max(120).nullable(),
    monthlyIncome: z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .max(35)
      .nullable(),
    essentialCosts: z
      .string()
      .regex(/^\d+(\.\d+)?$/)
      .max(35)
      .nullable(),
  })
  .strict();
