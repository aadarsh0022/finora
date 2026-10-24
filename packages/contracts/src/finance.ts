import { z } from 'zod';
import { currencySchema, minorSchema, positiveMinorSchema } from './primitives';

export const entityIdSchema = z.uuid();
export const versionSchema = z.number().int().positive().max(2147483647);
export const accountInputSchema = z
  .object({
    name: z.string().trim().min(1).max(80),
    type: z.enum(['CASH', 'CHECKING', 'SAVINGS', 'WALLET', 'OTHER']),
    openingBalanceMinor: minorSchema.default('0'),
    icon: z
      .string()
      .regex(/^[a-z-]{1,40}$/)
      .default('wallet'),
    color: z
      .string()
      .regex(/^#[\da-fA-F]{6}$/)
      .default('#187A5A'),
  })
  .strict();
export const accountUpdateSchema = accountInputSchema
  .extend({ version: versionSchema, archived: z.boolean() })
  .strict();
const entity = {
  id: entityIdSchema,
  userId: entityIdSchema,
  version: versionSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
};
export const accountSchema = accountInputSchema
  .extend({
    ...entity,
    currency: currencySchema,
    archived: z.boolean(),
  })
  .strip();
export const accountWithBalanceSchema = accountSchema.extend({
  balanceMinor: z.string().regex(/^(0|-?[1-9]\d{0,34})$/),
});
export const categoryInputSchema = z
  .object({
    name: z.string().trim().min(1).max(50),
    type: z.enum(['INCOME', 'EXPENSE']),
    icon: z
      .string()
      .regex(/^[a-z-]{1,40}$/)
      .default('tag'),
    color: z
      .string()
      .regex(/^#[\da-fA-F]{6}$/)
      .default('#187A5A'),
  })
  .strict();
export const categoryUpdateSchema = categoryInputSchema
  .extend({ version: versionSchema, archived: z.boolean() })
  .strict();
export const categorySchema = categoryInputSchema
  .extend({ ...entity, archived: z.boolean() })
  .strip();
export const archiveSchema = z.object({ version: versionSchema }).strict();
export const deleteRecordSchema = archiveSchema
  .extend({ confirmation: z.literal('DELETE') })
  .strict();
export const listEntitiesSchema = z
  .object({ includeArchived: z.enum(['true', 'false']).default('false') })
  .strict();

const transactionFields = {
  type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']),
  accountId: entityIdSchema,
  destinationAccountId: entityIdSchema.optional(),
  categoryId: entityIdSchema.optional(),
  amountMinor: positiveMinorSchema,
  date: z.iso.datetime({ offset: true }),
  datePrecision: z.enum(['DAY', 'INSTANT']).optional(),
  merchant: z.string().trim().max(120).default(''),
  note: z.string().trim().max(1000).default(''),
  tags: z.array(z.string().trim().min(1).max(30)).max(10).default([]),
};
function transactionReferences(
  value: { type: string; accountId: string; destinationAccountId?: string; categoryId?: string },
  context: z.RefinementCtx,
) {
  if (value.type === 'TRANSFER') {
    if (!value.destinationAccountId || value.destinationAccountId === value.accountId)
      context.addIssue({
        code: 'custom',
        path: ['destinationAccountId'],
        message: 'Choose a different destination account',
      });
    if (value.categoryId)
      context.addIssue({
        code: 'custom',
        path: ['categoryId'],
        message: 'Transfers do not use categories',
      });
  } else {
    if (!value.categoryId)
      context.addIssue({ code: 'custom', path: ['categoryId'], message: 'Choose a category' });
    if (value.destinationAccountId)
      context.addIssue({
        code: 'custom',
        path: ['destinationAccountId'],
        message: 'Only transfers use a destination account',
      });
  }
}
export const transactionInputSchema = z
  .object(transactionFields)
  .strict()
  .superRefine(transactionReferences);
export const transactionUpdateSchema = z
  .object({ ...transactionFields, version: versionSchema })
  .strict()
  .superRefine(transactionReferences);
export const transactionSchema = z
  .object({ ...transactionFields, ...entity, currency: currencySchema })
  .superRefine(transactionReferences);
export const transactionFilterSchema = z
  .object({
    page: z.coerce.number().int().min(1).max(10000).default(1),
    pageSize: z.coerce.number().int().min(1).max(100).default(30),
    type: z.enum(['INCOME', 'EXPENSE', 'TRANSFER']).optional(),
    accountId: entityIdSchema.optional(),
    categoryId: entityIdSchema.optional(),
    from: z.iso.datetime({ offset: true }).optional(),
    to: z.iso.datetime({ offset: true }).optional(),
    minAmount: positiveMinorSchema.optional(),
    maxAmount: positiveMinorSchema.optional(),
    q: z.string().trim().min(1).max(80).optional(),
    sort: z.enum(['newest', 'oldest', 'highest', 'lowest']).default('newest'),
  })
  .strict()
  .refine(
    (value) => !value.from || !value.to || new Date(value.from) <= new Date(value.to),
    'Start date must precede end date',
  )
  .refine(
    (value) =>
      !value.minAmount || !value.maxAmount || BigInt(value.minAmount) <= BigInt(value.maxAmount),
    'Minimum must not exceed maximum',
  );

export type Account = z.infer<typeof accountSchema>;
export type AccountWithBalance = z.infer<typeof accountWithBalanceSchema>;
export type Category = z.infer<typeof categorySchema>;
export type Transaction = z.infer<typeof transactionSchema>;
export type TransactionInput = z.infer<typeof transactionInputSchema>;
export type TransactionFilters = z.infer<typeof transactionFilterSchema>;

export const overviewSchema = z.object({
  month: z.string(),
  timezone: z.string(),
  currency: currencySchema,
  totalBalanceMinor: z.string().regex(/^(0|-?[1-9]\d*)$/),
  incomeMinor: z.string().regex(/^\d+$/),
  expensesMinor: z.string().regex(/^\d+$/),
  netMinor: z.string().regex(/^(0|-?[1-9]\d*)$/),
  savingsRateBasisPoints: z.number().nullable(),
  accounts: z.array(accountWithBalanceSchema),
  categorySpending: z.record(z.string(), z.string()),
  recentTransactions: z.array(transactionSchema),
});
export const transactionPageSchema = z.object({
  items: z.array(transactionSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int(),
  pageSize: z.number().int(),
});
export type Overview = z.infer<typeof overviewSchema>;
