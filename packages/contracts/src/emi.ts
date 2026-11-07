import { z } from 'zod';
import { calendarDaySchema } from './advanced';
import { entityIdSchema, versionSchema } from './finance';
import { currencySchema, minorSchema, positiveMinorSchema } from './primitives';

/** "YYYY-MM". Recurring loans and income are tracked by month, never by day. */
export const monthKeySchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');
export const loanTagSchema = z.enum(['small', 'large']);
export const incomeKindSchema = z.enum(['salary', 'extra']);

const monthRange = (value: { startMonth: string; endMonth: string | null }) =>
  value.endMonth === null || value.endMonth >= value.startMonth;
const rangeIssue = { path: ['endMonth'], message: 'End month must be on or after the start month' };

const loanFields = {
  name: z.string().trim().min(1).max(100),
  monthlyAmountMinor: positiveMinorSchema,
  startMonth: monthKeySchema,
  /** Null while the loan is ongoing (no finite total can be reported for it). */
  endMonth: monthKeySchema.nullable(),
  dueDay: z.number().int().min(1).max(31),
  loanTag: loanTagSchema,
  /** Only ranks Avalanche order. It is not an amortization model. */
  interestRatePct: z.number().min(0).max(100).nullable(),
  /** The outstanding principal from the lender; a snapshot, never computed. Null = not entered. */
  principalRemainingMinor: minorSchema.nullable(),
};
export const emiLoanInputSchema = z
  .object({
    ...loanFields,
    endMonth: loanFields.endMonth.default(null),
    dueDay: loanFields.dueDay.default(5),
    loanTag: loanFields.loanTag.default('small'),
    interestRatePct: loanFields.interestRatePct.default(null),
    principalRemainingMinor: loanFields.principalRemainingMinor.default(null),
  })
  .strict()
  .refine(monthRange, rangeIssue);
export const emiLoanUpdateSchema = z
  .object({ ...loanFields, isActive: z.boolean(), version: versionSchema })
  .strict()
  .refine(monthRange, rangeIssue);
export const emiLoanSchema = z.object({
  ...loanFields,
  id: entityIdSchema,
  userId: entityIdSchema,
  version: versionSchema,
  currency: currencySchema,
  isActive: z.boolean(),
  /** The day the principal figure was last entered; moves only when the figure changes. */
  principalAsOf: calendarDaySchema.nullable(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/**
 * Marks a month's EMI paid. A null amount means the full EMI; any other amount is a partial or
 * custom payment. `accountId` and `categoryId` are used when debt is not kept separate: the
 * payment then also records a normal expense from that account.
 */
export const emiPaymentInputSchema = z
  .object({
    amountMinor: positiveMinorSchema.nullable().default(null),
    accountId: entityIdSchema.optional(),
    categoryId: entityIdSchema.optional(),
  })
  .strict();
export const emiPaymentSchema = z.object({
  id: entityIdSchema,
  userId: entityIdSchema,
  loanId: entityIdSchema,
  monthKey: monthKeySchema,
  /** The EMI at the time it was paid, so a later edit does not rewrite history. */
  amountDueMinor: positiveMinorSchema,
  amountPaidMinor: positiveMinorSchema,
  paid: z.boolean(),
  paidAt: z.iso.datetime().nullable(),
  /** The normal expense recorded for this payment, when debt is not kept separate. */
  transactionId: entityIdSchema.nullable(),
  version: versionSchema,
  currency: currencySchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** A lump-sum prepayment. It nets off the remaining total and is not tied to a month. */
export const emiExtraPaymentInputSchema = z
  .object({
    amountMinor: positiveMinorSchema,
    date: calendarDaySchema,
    note: z.string().trim().max(300).default(''),
    accountId: entityIdSchema.optional(),
    categoryId: entityIdSchema.optional(),
  })
  .strict();
export const emiExtraPaymentSchema = z.object({
  id: entityIdSchema,
  userId: entityIdSchema,
  loanId: entityIdSchema,
  amountMinor: positiveMinorSchema,
  date: calendarDaySchema,
  note: z.string().max(300),
  transactionId: entityIdSchema.nullable(),
  version: versionSchema,
  currency: currencySchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

const incomeFields = {
  kind: incomeKindSchema,
  amountMinor: positiveMinorSchema,
  startMonth: monthKeySchema,
  endMonth: monthKeySchema.nullable(),
  note: z.string().trim().max(200),
};
export const emiIncomePeriodInputSchema = z
  .object({
    ...incomeFields,
    endMonth: incomeFields.endMonth.default(null),
    note: incomeFields.note.default(''),
  })
  .strict()
  .refine(monthRange, rangeIssue);
export const emiIncomePeriodUpdateSchema = z
  .object({ ...incomeFields, version: versionSchema })
  .strict()
  .refine(monthRange, rangeIssue);
export const emiIncomePeriodSchema = z.object({
  ...incomeFields,
  id: entityIdSchema,
  userId: entityIdSchema,
  version: versionSchema,
  currency: currencySchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});

/** Everything the tracker screens need. A personal loan list is small, so it is sent whole. */
export const emiOverviewSchema = z.object({
  loans: z.array(emiLoanSchema),
  payments: z.array(emiPaymentSchema),
  extraPayments: z.array(emiExtraPaymentSchema),
  incomePeriods: z.array(emiIncomePeriodSchema),
});

export type EmiLoanDto = z.infer<typeof emiLoanSchema>;
export type EmiPaymentDto = z.infer<typeof emiPaymentSchema>;
export type EmiExtraPaymentDto = z.infer<typeof emiExtraPaymentSchema>;
export type EmiIncomePeriodDto = z.infer<typeof emiIncomePeriodSchema>;
