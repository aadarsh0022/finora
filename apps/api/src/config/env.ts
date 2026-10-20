import { z } from 'zod';

const environmentSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  MONGODB_URI: z.string().min(1),
  MONGODB_DB: z.string().regex(/^[a-zA-Z0-9_-]+$/),
  APP_URL: z.url(),
  EMAIL_TRANSPORT: z.enum(['local', 'resend']).default('local'),
  RESEND_API_KEY: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  TRUST_PROXY: z.enum(['true', 'false']).default('false'),
  RATE_LIMIT_SECRET: z.string().min(32),
});

export function getEnv() {
  const parsed = environmentSchema.safeParse(process.env);
  if (!parsed.success) throw new Error('Server configuration is incomplete');
  const env = parsed.data;
  if (env.NODE_ENV === 'production') {
    if (!env.APP_URL.startsWith('https://')) throw new Error('Production requires HTTPS');
    if (env.EMAIL_TRANSPORT !== 'resend' || !env.RESEND_API_KEY || !env.EMAIL_FROM)
      throw new Error('Production email is not configured');
    if (env.TRUST_PROXY !== 'true')
      throw new Error('Production requires a trusted reverse proxy for rate limiting');
  }
  return env;
}
