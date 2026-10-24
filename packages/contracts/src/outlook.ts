import { z } from 'zod';
import { calendarDaySchema } from './advanced';
import { entityIdSchema, transactionSchema } from './finance';
import { currencySchema, minorSchema, positiveMinorSchema } from './primitives';

export const outlookFlowSchema = z.object({
  id: z.string().min(1).max(150),
  label: z.string().max(120),
  day: calendarDaySchema,
  direction: z.enum(['OUT', 'EXPECTED_IN']),
  amountMinor: positiveMinorSchema.nullable(),
  accountId: entityIdSchema.nullable(),
  counterAccountId: entityIdSchema.optional(),
  source: z.enum(['RECURRING', 'DEBT', 'RECORDED']),
  overdue: z.boolean(),
});
export const outlookSchema = z
  .object({
    generatedAt: z.iso.datetime(),
    today: calendarDaySchema,
    through: calendarDaySchema,
    currency: currencySchema,
    timezone: z
      .string()
      .max(100)
      .refine((zone) => {
        try {
          new Intl.DateTimeFormat('en', { timeZone: zone });
          return true;
        } catch {
          return false;
        }
      }, 'Choose a valid timezone'),
    accounts: z
      .array(
        z.object({
          id: entityIdSchema,
          name: z.string(),
          balanceMinor: z.string().regex(/^(0|-?[1-9]\d{0,34})$/),
        }),
      )
      .max(200),
    flows: z.array(outlookFlowSchema).max(30000),
    undatedDebts: z.number().int().nonnegative(),
    pendingRecurringCount: z.number().int().nonnegative(),
    overdueDebtCount: z.number().int().nonnegative(),
    recentTransactions: z.array(transactionSchema).max(50),
    moreRecentCount: z.number().int().nonnegative(),
  })
  .superRefine((value, context) => {
    const duration =
      Date.parse(`${value.through}T00:00:00Z`) - Date.parse(`${value.today}T00:00:00Z`);
    if (duration < 0 || duration > 90 * 86400000)
      context.addIssue({ code: 'custom', path: ['through'], message: 'Invalid planning horizon' });
    if (
      new Set(value.accounts.map((a) => a.id)).size !== value.accounts.length ||
      new Set(value.flows.map((f) => f.id)).size !== value.flows.length
    )
      context.addIssue({ code: 'custom', path: ['flows'], message: 'Duplicate planning records' });
    if (value.flows.some((flow) => flow.day < value.today || flow.day > value.through))
      context.addIssue({
        code: 'custom',
        path: ['flows'],
        message: 'Planning item is outside the snapshot period',
      });
  });
export const expectedPaymentSchema = z
  .object({
    id: entityIdSchema,
    label: z.string().trim().min(1).max(80),
    day: calendarDaySchema,
    amountMinor: positiveMinorSchema,
  })
  .strict();
export const outlookPreferencesSchema = z
  .object({
    through: calendarDaySchema,
    accountIds: z
      .array(entityIdSchema)
      .max(200)
      .refine((ids) => new Set(ids).size === ids.length)
      .optional(),
    reserveMinor: minorSchema.refine((amount) => BigInt(amount) >= 0n).default('0'),
    expectedPayments: z
      .array(expectedPaymentSchema)
      .max(10)
      .refine(
        (payments) => new Set(payments.map((p) => p.id)).size === payments.length,
        'Duplicate expected payment',
      )
      .default([]),
    confirmedAt: z.iso.datetime().optional(),
    confirmedSignature: z.string().max(16000).optional(),
  })
  .strict();
export type Outlook = z.infer<typeof outlookSchema>;
export type OutlookFlow = z.infer<typeof outlookFlowSchema>;
export type OutlookPreferences = z.infer<typeof outlookPreferencesSchema>;
