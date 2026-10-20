import { z } from 'zod';
import { accountSchema, categorySchema, transactionSchema } from './finance';
import { currencySchema } from './primitives';
import {
  budgetSchema,
  goalSchema,
  contributionSchema,
  recurringRuleSchema,
  recurringOccurrenceSchema,
} from './advanced';

// Portable backups deliberately contain no user identity or authentication data.
export const backupAccountSchema = accountSchema.omit({ userId: true }).strict();
export const backupCategorySchema = categorySchema.omit({ userId: true }).strict();
const validationUserId = '00000000-0000-4000-8000-000000000000';
export const backupTransactionSchema = z
  .object(transactionSchema.shape)
  .omit({ userId: true })
  .strict()
  .superRefine((value, context) => {
    const result = transactionSchema.safeParse({ ...value, userId: validationUserId });
    if (!result.success)
      for (const issue of result.error.issues)
        context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
  })
  .transform((value) => ({ ...value, date: new Date(value.date).toISOString() }));
export const backupBudgetSchema = budgetSchema.omit({ userId: true }).strict();
export const backupGoalSchema = goalSchema.omit({ userId: true }).strict();
export const backupContributionSchema = contributionSchema.omit({ userId: true }).strict();
const backupTimezoneSchema = z
  .string()
  .min(1)
  .max(100)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Choose a valid timezone');
export const backupRuleSchema = z
  .object(recurringRuleSchema.shape)
  .omit({ userId: true })
  .extend({
    timezone: backupTimezoneSchema,
    nextIndex: z.number().int().min(0).max(1000000),
  })
  .strict()
  .superRefine((value, context) => {
    const result = recurringRuleSchema.safeParse({ ...value, userId: validationUserId });
    if (!result.success)
      for (const issue of result.error.issues)
        context.addIssue({ code: 'custom', path: issue.path, message: issue.message });
  });
export const backupOccurrenceSchema = recurringOccurrenceSchema
  .omit({ userId: true })
  .extend({
    timezone: backupTimezoneSchema,
    occurrenceIndex: z.number().int().min(0).max(1000000),
  })
  .strict();
export const backupSchema = z
  .object({
    format: z.literal('finora-backup'),
    version: z.literal(1),
    exportedAt: z.iso.datetime(),
    currency: currencySchema,
    accounts: z.array(backupAccountSchema).max(200),
    categories: z.array(backupCategorySchema).max(300),
    transactions: z.array(backupTransactionSchema).max(10000),
    budgets: z.array(backupBudgetSchema).max(1200),
    goals: z.array(backupGoalSchema).max(200),
    contributions: z.array(backupContributionSchema).max(10000),
    recurringRules: z.array(backupRuleSchema).max(200),
    recurringOccurrences: z.array(backupOccurrenceSchema).max(10000),
  })
  .strict()
  .superRefine((backup, context) => {
    for (const key of [
      'accounts',
      'categories',
      'transactions',
      'budgets',
      'goals',
      'contributions',
      'recurringRules',
      'recurringOccurrences',
    ] as const) {
      const ids = new Set<string>();
      backup[key].forEach((record, index) => {
        if (ids.has(record.id))
          context.addIssue({ code: 'custom', path: [key, index, 'id'], message: 'Duplicate ID' });
        ids.add(record.id);
      });
    }
    const accounts = new Map(backup.accounts.map((record) => [record.id, record]));
    const categories = new Map(backup.categories.map((record) => [record.id, record]));
    for (const account of backup.accounts)
      if (account.currency !== backup.currency)
        context.addIssue({ code: 'custom', path: ['accounts'], message: 'Currency mismatch' });
    backup.transactions.forEach((record, index) => {
      if (
        record.currency !== backup.currency ||
        !accounts.has(record.accountId) ||
        (record.destinationAccountId && !accounts.has(record.destinationAccountId)) ||
        (record.categoryId && categories.get(record.categoryId)?.type !== record.type)
      )
        context.addIssue({
          code: 'custom',
          path: ['transactions', index],
          message: 'Missing, incompatible or cross-currency reference',
        });
    });
    const invalid = (path: string, message: string) =>
      context.addIssue({ code: 'custom', path: [path], message });
    const budgetKeys = new Set<string>();
    for (const budget of backup.budgets) {
      const key = `${budget.month}:${budget.categoryId}`;
      if (
        budgetKeys.has(key) ||
        categories.get(budget.categoryId)?.type !== 'EXPENSE' ||
        budget.currency !== backup.currency
      )
        invalid('budgets', 'Duplicate budget, currency mismatch or missing expense category');
      budgetKeys.add(key);
    }
    const goalIds = new Set(backup.goals.map((goal) => goal.id));
    const contributionsPerGoal = new Map<string, number>();
    for (const goal of backup.goals)
      if (goal.currency !== backup.currency) invalid('goals', 'Currency mismatch');
    for (const contribution of backup.contributions) {
      const count = (contributionsPerGoal.get(contribution.goalId) ?? 0) + 1;
      contributionsPerGoal.set(contribution.goalId, count);
      if (!goalIds.has(contribution.goalId) || count > 1000)
        invalid('contributions', 'Missing goal or too many contributions');
    }
    const rules = new Map(backup.recurringRules.map((rule) => [rule.id, rule]));
    for (const rule of backup.recurringRules) {
      if (
        !accounts.has(rule.accountId) ||
        categories.get(rule.categoryId)?.type !== rule.type ||
        rule.currency !== backup.currency
      )
        invalid('recurringRules', 'Missing reference or currency mismatch');
    }
    const transactions = new Map(backup.transactions.map((record) => [record.id, record]));
    const occurrenceKeys = new Set<string>();
    const postedTransactions = new Set<string>();
    for (const occurrence of backup.recurringOccurrences) {
      const rule = rules.get(occurrence.ruleId);
      const key = `${occurrence.ruleId}:${occurrence.dueDate}`;
      if (
        !rule ||
        occurrenceKeys.has(key) ||
        occurrence.currency !== backup.currency ||
        !accounts.has(occurrence.accountId) ||
        categories.get(occurrence.categoryId)?.type !== occurrence.type ||
        (rule &&
          (occurrence.timezone !== rule.timezone ||
            occurrence.ruleVersion > rule.version ||
            occurrence.occurrenceIndex >= rule.nextIndex))
      )
        invalid('recurringOccurrences', 'Missing, duplicate or incompatible recurrence reference');
      occurrenceKeys.add(key);
      if (occurrence.status === 'POSTED') {
        const transaction = occurrence.transactionId
          ? transactions.get(occurrence.transactionId)
          : undefined;
        if (
          !transaction ||
          transaction.type !== occurrence.type ||
          transaction.accountId !== occurrence.accountId ||
          transaction.categoryId !== occurrence.categoryId ||
          transaction.amountMinor !== occurrence.amountMinor ||
          postedTransactions.has(transaction.id)
        )
          invalid('recurringOccurrences', 'Invalid posted transaction linkage');
        if (transaction) postedTransactions.add(transaction.id);
      } else if (occurrence.transactionId)
        invalid('recurringOccurrences', 'Pending occurrences cannot link transactions');
      if (occurrence.amountMode === 'FIXED' && !occurrence.amountMinor)
        invalid('recurringOccurrences', 'Missing fixed amount');
    }
  });
export const importPreviewInputSchema = z.object({ backup: backupSchema }).strict();
export const importCommitInputSchema = z
  .object({
    backup: backupSchema,
    previewId: z.uuid(),
    contentHash: z.string().regex(/^[a-f0-9]{64}$/),
    mode: z.literal('merge'),
    confirmation: z.literal('IMPORT'),
  })
  .strict();
export type Backup = z.infer<typeof backupSchema>;
