import { deleteAccountSchema, loginSchema, sessionTokensSchema } from '@finora/contracts';
import { z } from 'zod';

const loginResponseSchema = z.object({ success: z.literal(true), data: sessionTokensSchema });
type Fetcher = (input: string, init: RequestInit) => Promise<Response>;

/** Uses a temporary session only; credentials and tokens are never persisted. */
export async function deleteWebAccount(
  input: { email: string; password: string; confirmation: string },
  transport: Fetcher = fetch,
) {
  const credentials = loginSchema.parse({
    email: input.email,
    password: input.password,
    deviceName: 'Account deletion website',
  });
  const deletion = deleteAccountSchema.parse({
    password: input.password,
    confirmation: input.confirmation,
  });
  const options: RequestInit = {
    headers: { 'Content-Type': 'application/json' },
    cache: 'no-store',
    credentials: 'omit',
    redirect: 'error',
  };
  const login = await transport('/api/v1/auth/login', {
    ...options,
    method: 'POST',
    body: JSON.stringify(credentials),
    signal: AbortSignal.timeout(20000),
  });
  if (!login.ok)
    throw new Error(
      login.status === 429
        ? 'Too many attempts. Please try again in ten minutes.'
        : 'Unable to sign in. Check your email and password, or reset your password.',
    );
  const session = loginResponseSchema.parse(await login.json()).data;
  const headers = {
    'Content-Type': 'application/json',
    Authorization: `Bearer ${session.accessToken}`,
  };
  try {
    const response = await transport('/api/v1/auth/account', {
      ...options,
      method: 'DELETE',
      headers,
      body: JSON.stringify(deletion),
      signal: AbortSignal.timeout(20000),
    });
    if (!response.ok) throw new Error('Deletion could not be completed. Please try again.');
  } finally {
    // Deletion removes all sessions. Revoke this temporary session if deletion failed.
    await transport('/api/v1/auth/logout', {
      ...options,
      method: 'POST',
      headers,
      body: '{}',
      signal: AbortSignal.timeout(10000),
    }).catch(() => undefined);
  }
}
