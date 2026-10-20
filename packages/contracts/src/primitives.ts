import { z } from 'zod';

export const currencySchema = z.enum(['USD', 'CAD', 'GBP', 'AUD', 'INR', 'JPY', 'KWD']);
export const minorSchema = z
  .string()
  .regex(/^(0|-?[1-9]\d{0,29})$/, 'Enter a canonical integer amount');
export const positiveMinorSchema = minorSchema.refine(
  (value) => BigInt(value) > 0n,
  'Amount must be greater than zero',
);
