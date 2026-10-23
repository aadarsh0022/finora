import { z } from 'zod';
import { currencySchema } from './primitives';

export * from './finance';
export * from './primitives';
export * from './advanced';
export * from './backup';
export * from './debts';

export const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));
export const passwordSchema = z.string().min(12, 'Use at least 12 characters').max(128);
export const timezoneSchema = z
  .string()
  .max(100)
  .refine((zone) => {
    try {
      new Intl.DateTimeFormat('en', { timeZone: zone });
      return true;
    } catch {
      return false;
    }
  }, 'Choose a valid IANA timezone');
export const localeSchema = z
  .string()
  .max(40)
  .refine((locale) => {
    try {
      return Intl.DateTimeFormat.supportedLocalesOf([locale]).length === 1;
    } catch {
      return false;
    }
  }, 'Choose a supported locale');
export const preferencesSchema = z
  .object({
    baseCurrency: currencySchema.default('INR'),
    locale: localeSchema.default('en-IN'),
    timezone: timezoneSchema.default('Asia/Kolkata'),
    preferredDateFormat: z.enum(['DD/MM/YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD']).default('DD/MM/YYYY'),
    firstDayOfWeek: z.union([z.literal(0), z.literal(1)]).default(1),
    preferredTheme: z.enum(['system', 'light', 'dark']).default('light'),
  })
  .strict();
export const registerSchema = z
  .object({
    email: emailSchema,
    password: passwordSchema,
    name: z.string().trim().min(1).max(80),
    preferences: preferencesSchema.default(() => preferencesSchema.parse({})),
    deviceName: z.string().trim().min(1).max(80).default('Mobile'),
  })
  .strict();
export const loginSchema = z
  .object({
    email: emailSchema,
    password: z.string().min(1).max(128),
    deviceName: z.string().trim().min(1).max(80).default('Mobile'),
  })
  .strict();
export const tokenSchema = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
export const refreshSchema = z.object({ refreshToken: tokenSchema }).strict();
export const forgotPasswordSchema = z.object({ email: emailSchema }).strict();
export const resetPasswordSchema = z
  .object({ token: tokenSchema, password: passwordSchema })
  .strict();
export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1).max(128), newPassword: passwordSchema })
  .strict();
export const deleteAccountSchema = z
  .object({ password: z.string().min(1).max(128), confirmation: z.literal('DELETE') })
  .strict();
export const settingsUpdateSchema = z
  .object({ preferences: preferencesSchema, version: z.number().int().positive() })
  .strict();
export const settingsSchema = z.object({
  preferences: preferencesSchema,
  version: z.number().int().positive(),
});
export const userSchema = z.object({
  id: z.uuid(),
  email: emailSchema,
  name: z.string(),
  preferences: preferencesSchema,
  createdAt: z.iso.datetime(),
  updatedAt: z.iso.datetime(),
});
export const sessionTokensSchema = z.object({
  accessToken: tokenSchema,
  refreshToken: tokenSchema,
  expiresIn: z.literal(900),
  user: userSchema,
});
export type Preferences = z.infer<typeof preferencesSchema>;
export type User = z.infer<typeof userSchema>;
export type SessionTokens = z.infer<typeof sessionTokensSchema>;
export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type Currency = z.infer<typeof currencySchema>;
export type ApiResponse<T> =
  | { success: true; data: T; meta: { requestId: string } }
  | {
      success: false;
      error: { code: string; message: string; details?: Record<string, string[]> };
      meta: { requestId: string };
    };
export * from './reports';
export * from './entitlements';
export * from './outlook';
