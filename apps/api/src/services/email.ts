import { mkdir, writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import path from 'node:path';
import { getEnv } from '../config/env';

export async function sendPasswordReset(email: string, token: string) {
  const env = getEnv();
  const link = new URL('/reset-password', env.APP_URL);
  link.hash = `token=${token}`;
  const message = {
    to: email,
    subject: 'Reset your Finora password',
    text: `Reset your password: ${link.toString()}\nThis link expires in 30 minutes. If you did not request it, ignore this message.`,
  };
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
    headers: { Authorization: `Bearer ${env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: env.EMAIL_FROM, ...message }),
    signal: AbortSignal.timeout(10000),
  });
  if (!response.ok) throw new Error('Email delivery failed');
}
