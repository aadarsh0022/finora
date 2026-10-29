import { z } from 'zod';
import { accountWithBalanceSchema, categorySchema, transactionSchema } from './finance';
export const deviceLedgerSchema = z.object({
  revision: z.number().int().nonnegative(),
  complete: z.literal(true),
  accounts: z.array(accountWithBalanceSchema).max(200),
  categories: z.array(categorySchema).max(1000),
  transactions: z.array(transactionSchema).max(10000),
});
export type DeviceLedger = z.infer<typeof deviceLedgerSchema>;
