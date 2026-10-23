import { z } from 'zod';
import { transactionInputSchema } from '@finora/contracts';

export const favouriteSchema = z
  .object({ id: z.uuid(), name: z.string().trim().min(1).max(60), body: transactionInputSchema })
  .strict();
