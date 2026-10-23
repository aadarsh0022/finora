import { preferencesSchema, userSchema } from '@finora/contracts';
import { z } from 'zod';

export const userRecordSchema = z.object({
  id: z.uuid(),
  email: z.email(),
  name: z.string(),
  preferences: preferencesSchema,
  passwordHash: z.string(),
  authVersion: z.number().int().nonnegative(),
  settingsVersion: z.number().int().positive().default(1),
  createdAt: z.date(),
  updatedAt: z.date(),
  onboardingCompletedAt: z.date().optional(),
  resetHash: z.string().optional(),
  resetExpiresAt: z.date().optional(),
});
export type UserRecord = z.infer<typeof userRecordSchema>;
export const sessionRecordSchema = z.object({
  id: z.uuid(),
  userId: z.uuid(),
  deviceName: z.string(),
  authVersion: z.number().int(),
  accessHash: z.string(),
  accessExpiresAt: z.date(),
  refreshHash: z.string(),
  usedRefreshHashes: z.array(z.string()),
  rotations: z.number().int(),
  expiresAt: z.date(),
  revokedAt: z.date().optional(),
  createdAt: z.date(),
  updatedAt: z.date(),
});
export type SessionRecord = z.infer<typeof sessionRecordSchema>;
export interface RateLimitRecord {
  key: string;
  count: number;
  expiresAt: Date;
}

export function publicUser(record: UserRecord) {
  return userSchema.parse({
    id: record.id,
    email: record.email,
    name: record.name,
    preferences: record.preferences,
    createdAt: record.createdAt.toISOString(),
    updatedAt: record.updatedAt.toISOString(),
    ...(record.onboardingCompletedAt
      ? { onboardingCompletedAt: record.onboardingCompletedAt.toISOString() }
      : {}),
  });
}
