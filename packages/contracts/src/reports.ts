import { z } from 'zod';
import { calendarDaySchema, monthSchema } from './advanced';
import { currencySchema } from './primitives';
import { entityIdSchema } from './finance';

export const reportRangeNameSchema = z.enum([
  'current-month',
  'previous-month',
  'last-3-months',
  'last-6-months',
  'custom',
]);
export const reportRangeSchema = z
  .object({
    range: reportRangeNameSchema.default('current-month'),
    from: calendarDaySchema.optional(),
    to: calendarDaySchema.optional(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.range === 'custom') {
      if (!value.from || !value.to) {
        context.addIssue({ code: 'custom', path: ['from'], message: 'Choose both custom dates' });
        return;
      }
      if (value.from > value.to)
        context.addIssue({ code: 'custom', path: ['to'], message: 'End must follow start' });
      const first = Number(value.from.slice(0, 4)) * 12 + Number(value.from.slice(5, 7));
      const last = Number(value.to.slice(0, 4)) * 12 + Number(value.to.slice(5, 7));
      if (last - first >= 120)
        context.addIssue({
          code: 'custom',
          path: ['to'],
          message: 'Choose at most 120 calendar months',
        });
    } else if (value.from || value.to)
      context.addIssue({
        code: 'custom',
        path: ['range'],
        message: 'Date fields require a custom range',
      });
  });
const signedInteger = z.string().regex(/^(0|-?[1-9]\d*)$/);
const nonnegativeInteger = z.string().regex(/^(0|[1-9]\d*)$/);
export const reportPeriodSchema = z.object({
  range: reportRangeNameSchema,
  from: calendarDaySchema,
  to: calendarDaySchema,
  timezone: z.string(),
  currency: currencySchema,
});
export const reportCashflowSchema = z.object({
  incomeMinor: nonnegativeInteger,
  expensesMinor: nonnegativeInteger,
  netMinor: signedInteger,
  savingsRateBasisPoints: signedInteger.nullable(),
});
export const reportCategorySchema = z.object({
  categoryId: entityIdSchema,
  name: z.string(),
  type: z.enum(['INCOME', 'EXPENSE']),
  amountMinor: nonnegativeInteger,
  shareBasisPoints: z.number().int().min(0).max(10000),
});
export const reportAccountSchema = z.object({
  accountId: entityIdSchema,
  name: z.string(),
  archived: z.boolean(),
  openingBalanceMinor: signedInteger,
  closingBalanceMinor: signedInteger,
  incomeMinor: nonnegativeInteger,
  expensesMinor: nonnegativeInteger,
  transferInMinor: nonnegativeInteger,
  transferOutMinor: nonnegativeInteger,
  debtInMinor: nonnegativeInteger.default('0'),
  debtOutMinor: nonnegativeInteger.default('0'),
  netMinor: signedInteger,
});
export const reportTrendSchema = z.object({
  month: monthSchema,
  incomeMinor: nonnegativeInteger,
  expensesMinor: nonnegativeInteger,
  netMinor: signedInteger,
});
export const reportSummarySchema = z.object({
  period: reportPeriodSchema,
  cashflow: reportCashflowSchema,
  categories: z.array(reportCategorySchema),
  accounts: z.array(reportAccountSchema),
  trends: z.array(reportTrendSchema),
});
export const reportCashflowResponseSchema = z.object({
  period: reportPeriodSchema,
  cashflow: reportCashflowSchema,
});
export const reportCategoriesResponseSchema = z.object({
  period: reportPeriodSchema,
  categories: z.array(reportCategorySchema),
});
export const reportAccountsResponseSchema = z.object({
  period: reportPeriodSchema,
  accounts: z.array(reportAccountSchema),
});
export const reportTrendsResponseSchema = z.object({
  period: reportPeriodSchema,
  trends: z.array(reportTrendSchema),
});
export type ReportRange = z.infer<typeof reportRangeSchema>;
export type ReportPeriod = z.infer<typeof reportPeriodSchema>;
export type ReportSummary = z.infer<typeof reportSummarySchema>;
export const spendingInsightsSchema = z.object({
  month: monthSchema,
  through: calendarDaySchema,
  previousFrom: calendarDaySchema,
  previousThrough: calendarDaySchema,
  days: z.number().int().min(1).max(31),
  previousDays: z.number().int().min(1).max(31),
  partial: z.boolean(),
  spentMinor: nonnegativeInteger,
  previousSpentMinor: nonnegativeInteger,
  dailyAverageMinor: nonnegativeInteger,
  changeMinor: signedInteger,
  changeBasisPoints: signedInteger.nullable(),
  currency: currencySchema,
  timezone: z.string(),
  categoryChanges: z
    .array(
      z.object({
        categoryId: entityIdSchema,
        name: z.string(),
        currentMinor: nonnegativeInteger,
        previousMinor: nonnegativeInteger,
        changeMinor: signedInteger,
      }),
    )
    .max(3),
});
