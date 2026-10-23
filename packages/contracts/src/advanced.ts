import { z } from 'zod';
import { currencySchema, positiveMinorSchema } from './primitives';
import { entityIdSchema, versionSchema } from './finance';

export const calendarDaySchema = z
  .string()
  .regex(/^[1-9]\d{3}-\d{2}-\d{2}$/)
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
  }, 'Choose a valid calendar date');
export const monthSchema = z.string().regex(/^[1-9]\d{3}-(0[1-9]|1[0-2])$/);
const entity = {
  id: entityIdSchema,
  userId: entityIdSchema,
  version: versionSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
  currency: currencySchema,
};
const nameSchema = z.string().trim().min(1).max(80);
const exactInteger = z.string().regex(/^(0|-?[1-9]\d*)$/);
export const budgetInputSchema = z
  .object({
    categoryId: entityIdSchema,
    month: monthSchema,
    amountMinor: positiveMinorSchema,
    rollover: z.boolean().default(false),
    warningThresholdBasisPoints: z.number().int().min(1).max(10000).default(8000),
  })
  .strict();
export const budgetUpdateSchema = budgetInputSchema.extend({ version: versionSchema }).strict();
export const budgetSchema = budgetInputSchema.extend(entity).strip();
export const budgetStatusSchema = budgetSchema.extend({
  spentMinor: exactInteger,
  remainingMinor: exactInteger,
  overBudget: z.boolean(),
  warningReached: z.boolean(),
  timezone: z.string(),
  carriedMinor: exactInteger.optional(),
  effectiveLimitMinor: exactInteger.optional(),
});
export const monthlyLimitInputSchema = z
  .object({
    month: monthSchema,
    amountMinor: positiveMinorSchema,
    version: versionSchema.optional(),
  })
  .strict();
export const monthlyLimitSchema = z.object({
  month: monthSchema,
  amountMinor: positiveMinorSchema,
  ...entity,
});
export const monthlyLimitStatusSchema = z.object({
  month: monthSchema,
  plan: monthlyLimitSchema.nullable(),
  spentMinor: exactInteger,
  remainingMinor: exactInteger.nullable(),
  warningReached: z.boolean(),
});
export const copyBudgetsSchema = z
  .object({
    fromMonth: monthSchema,
    toMonth: monthSchema,
    copyRollover: z.boolean().default(false),
  })
  .strict()
  .refine((v) => v.fromMonth !== v.toMonth, 'Choose a different target month');
export const goalInputSchema = z
  .object({
    name: nameSchema,
    targetMinor: positiveMinorSchema,
    targetDate: calendarDaySchema.optional(),
  })
  .strict();
export const goalUpdateSchema = goalInputSchema
  .extend({ version: versionSchema, archived: z.boolean() })
  .strict();
export const goalSchema = goalInputSchema
  .extend({ ...entity, archived: z.boolean().default(false) })
  .strip();
export const goalProgressSchema = goalSchema.extend({
  savedMinor: exactInteger,
  remainingMinor: exactInteger,
  complete: z.boolean(),
});
export const contributionInputSchema = z
  .object({
    amountMinor: positiveMinorSchema,
    date: calendarDaySchema,
    version: versionSchema,
  })
  .strict();
export const contributionSchema = z
  .object({
    id: entityIdSchema,
    userId: entityIdSchema,
    goalId: entityIdSchema,
    amountMinor: positiveMinorSchema,
    date: calendarDaySchema,
    createdAt: z.iso.datetime(),
  })
  .strip();
const recurringFields = {
  name: nameSchema,
  type: z.enum(['INCOME', 'EXPENSE']),
  accountId: entityIdSchema,
  categoryId: entityIdSchema,
  amountMode: z.enum(['FIXED', 'VARIABLE']),
  amountMinor: positiveMinorSchema.optional(),
  postingPolicy: z.literal('CONFIRM_EACH'),
};
function amountRule(value: { amountMode: string; amountMinor?: string }, ctx: z.RefinementCtx) {
  if (value.amountMode === 'FIXED' && !value.amountMinor)
    ctx.addIssue({ code: 'custom', path: ['amountMinor'], message: 'Fixed rules need an amount' });
  if (value.amountMode === 'VARIABLE' && value.amountMinor)
    ctx.addIssue({
      code: 'custom',
      path: ['amountMinor'],
      message: 'Confirm variable amounts when due',
    });
}
export const recurringRuleInputSchema = z
  .object({
    ...recurringFields,
    startDate: calendarDaySchema,
    endDate: calendarDaySchema.optional(),
    frequency: z.enum(['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY']),
  })
  .strict()
  .superRefine(amountRule)
  .refine((value) => !value.endDate || value.endDate >= value.startDate, 'End must follow start');
export const recurringRuleUpdateSchema = z
  .object({
    ...recurringFields,
    paused: z.boolean(),
    version: versionSchema,
  })
  .strict()
  .superRefine(amountRule);
export const recurringRuleSchema = recurringRuleInputSchema
  .safeExtend({
    ...entity,
    timezone: z.string(),
    paused: z.boolean(),
    nextIndex: z.number().int().nonnegative(),
  })
  .strip();
export const recurringOccurrenceSchema = z
  .object({
    ...entity,
    ruleId: entityIdSchema,
    ruleVersion: versionSchema,
    dueDate: calendarDaySchema,
    occurrenceIndex: z.number().int().nonnegative(),
    timezone: z.string(),
    type: z.enum(['INCOME', 'EXPENSE']),
    accountId: entityIdSchema,
    categoryId: entityIdSchema,
    amountMode: z.enum(['FIXED', 'VARIABLE']),
    amountMinor: positiveMinorSchema.optional(),
    status: z.enum(['PENDING', 'POSTED']),
    transactionId: entityIdSchema.optional(),
  })
  .strip();
export const occurrenceConfirmSchema = z
  .object({
    version: versionSchema,
    amountMinor: positiveMinorSchema,
    date: z.iso.datetime({ offset: true }),
  })
  .strict();
export type Budget = z.infer<typeof budgetSchema>;
export type Goal = z.infer<typeof goalSchema>;
export type Contribution = z.infer<typeof contributionSchema>;
export type RecurringRule = z.infer<typeof recurringRuleSchema>;
export type RecurringOccurrence = z.infer<typeof recurringOccurrenceSchema>;
