import { z } from 'zod';
import { calendarDaySchema } from './advanced';
import { entityIdSchema, versionSchema } from './finance';
import { currencySchema, positiveMinorSchema } from './primitives';

const details = {
  name: z.string().trim().min(1).max(80),
  dueDate: calendarDaySchema.optional(),
  note: z.string().trim().max(1000).default(''),
};
export const debtInputSchema = z
  .object({
    ...details,
    direction: z.enum(['BORROWED', 'LENT']),
    amountMinor: positiveMinorSchema,
    date: calendarDaySchema,
    // Omission explicitly means an existing obligation with no account movement.
    accountId: entityIdSchema.optional(),
  })
  .strict()
  .refine((v) => !v.dueDate || v.dueDate >= v.date, {
    path: ['dueDate'],
    message: 'Due date must be on or after the start date',
  });
export const debtUpdateSchema = z
  .object({
    ...details,
    archived: z.boolean(),
    version: versionSchema,
  })
  .strict();
export const debtSchema = z.object({
  ...details,
  id: entityIdSchema,
  userId: entityIdSchema,
  version: versionSchema,
  direction: z.enum(['BORROWED', 'LENT']),
  amountMinor: positiveMinorSchema,
  date: calendarDaySchema,
  currency: currencySchema,
  archived: z.boolean(),
  cancelledAt: z.iso.datetime().optional(),
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const repaymentInputSchema = z
  .object({
    amountMinor: positiveMinorSchema,
    date: calendarDaySchema,
    accountId: entityIdSchema.optional(),
    note: z.string().trim().max(1000).default(''),
    version: versionSchema,
  })
  .strict();
export const debtEventSchema = z.object({
  id: entityIdSchema,
  userId: entityIdSchema,
  debtId: entityIdSchema,
  kind: z.enum(['PRINCIPAL', 'REPAYMENT']),
  direction: z.enum(['BORROWED', 'LENT']),
  amountMinor: positiveMinorSchema,
  date: calendarDaySchema,
  accountId: entityIdSchema.optional(),
  currency: currencySchema,
  note: z.string().max(1000),
  createdAt: z.iso.datetime(),
  reversedAt: z.iso.datetime().optional(),
});
export const debtStatusSchema = debtSchema.extend({
  repaidMinor: z.string().regex(/^\d+$/),
  remainingMinor: z.string().regex(/^\d+$/),
  status: z.enum(['ACTIVE', 'OVERDUE', 'SETTLED']),
});
export const debtDetailSchema = debtStatusSchema.extend({
  events: z.array(debtEventSchema).max(1001),
});
export const debtListSchema = z.array(debtStatusSchema).max(200);
export type Debt = z.infer<typeof debtSchema>;
export type DebtEvent = z.infer<typeof debtEventSchema>;
export type DebtStatus = z.infer<typeof debtStatusSchema>;
