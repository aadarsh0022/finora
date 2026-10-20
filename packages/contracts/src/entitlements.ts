import { z } from 'zod';

export const entitlementSchema = z
  .object({
    tier: z.enum(['FREE', 'PREMIUM']),
    source: z.enum(['NONE', 'TRUSTED_PROVIDER']),
    expiresAt: z.iso.datetime().nullable(),
    billingAvailable: z.literal(false),
    manualTrackingAvailable: z.literal(true),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.tier === 'PREMIUM' && (value.source !== 'TRUSTED_PROVIDER' || !value.expiresAt))
      context.addIssue({
        code: 'custom',
        message: 'Premium requires a trusted expiring provider grant',
      });
    if (value.tier === 'FREE' && (value.source !== 'NONE' || value.expiresAt !== null))
      context.addIssue({ code: 'custom', message: 'Free access has no purchase grant' });
  });
export type Entitlement = z.infer<typeof entitlementSchema>;
