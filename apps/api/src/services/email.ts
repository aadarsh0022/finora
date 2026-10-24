import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { getEnv } from '../config/env';
import { ApiError } from '../utils/http';
import { passwordResetEmail } from './reset-email';
import { welcomeEmail } from './welcome-email';

export function requirePasswordRecovery() {
  const env = getEnv();
  if (env.EMAIL_TRANSPORT === 'disabled')
    throw new ApiError(503, 'RECOVERY_UNAVAILABLE', 'Password recovery is currently unavailable.');
  return env;
}

export async function sendPasswordReset(email: string, token: string) {
  const env = requirePasswordRecovery();
  const link = new URL('/reset-password', env.APP_URL);
  link.hash = `token=${token}`;
  const message = {
    to: email,
    ...passwordResetEmail(link.toString()),
  };
  await deliverEmail(message);
}

export async function sendWelcomeEmail(email: string, name: string, userId: string) {
  const env = getEnv();
  if (env.EMAIL_TRANSPORT === 'disabled') return;
  await deliverEmail({ to: email, ...welcomeEmail(name, env.APP_URL) }, `welcome/${userId}`);
}

async function deliverEmail(
  message: { to: string; subject: string; text: string; html: string },
  idempotencyKey?: string,
) {
  const env = getEnv();
  if (env.EMAIL_TRANSPORT === 'local') {
    if (env.NODE_ENV === 'production') throw new Error('Local outbox is prohibited in production');
    const directory = path.resolve(process.cwd(), '.local', 'outbox');
    await mkdir(directory, { recursive: true });
    await writeFile(path.join(directory, `${randomUUID()}.json`), JSON.stringify(message), {
      mode: 0o600,
      flag: 'wx',
    });
    return;
  }
  if (!env.RESEND_API_KEY || !env.EMAIL_FROM) throw new Error('Email delivery is not configured');
  const response = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
      ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
    },
    body: JSON.stringify({ from: env.EMAIL_FROM, ...message }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Email delivery failed');
}
