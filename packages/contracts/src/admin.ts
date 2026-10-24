import { z } from 'zod';
export const assistantUsageSchema = z.object({
  day: z.string(),
  resetsAt: z.iso.datetime(),
  used: z.number().int().nonnegative(),
  limit: z.number().int().positive().nullable(),
});
export const adminOverviewSchema = z.object({
  totalUsers: z.number().int().nonnegative(),
  signedInUsers: z.number().int().nonnegative(),
  day: z.string(),
  resetsAt: z.iso.datetime(),
  page: z.number().int().positive(),
  pageSize: z.literal(50),
  users: z
    .array(
      z.object({
        id: z.uuid(),
        name: z.string(),
        email: z.email(),
        createdAt: z.iso.datetime(),
        used: z.number().int().nonnegative(),
        limit: z.number().int().positive().nullable(),
        activeSessions: z.number().int().nonnegative(),
        lastSessionAt: z.iso.datetime().nullable(),
      }),
    )
    .max(50),
});
