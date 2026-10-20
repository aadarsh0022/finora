'use client';

import { useState, type FormEvent } from 'react';
import { passwordSchema } from '@finora/contracts';

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [done, setDone] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const valid = passwordSchema.safeParse(password);
    if (!valid.success) {
      setMessage(valid.error.issues[0]?.message ?? 'Check your password.');
      return;
    }
    setBusy(true);
    setMessage('');
    try {
      const token = new URLSearchParams(window.location.search).get('token');
      const response = await fetch('/api/v1/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
        signal: AbortSignal.timeout(20000),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error?.message ?? 'Unable to reset password.');
      setPassword('');
      setDone(true);
      setMessage('Your password is reset. Sign in again in Finora.');
      window.history.replaceState({}, '', '/reset-password');
    } catch (error) {
      setMessage(error instanceof Error ? error.message : 'Connection failed. Please retry.');
    } finally {
      setBusy(false);
    }
  }
  return (
    <>
      <h1>Reset your password</h1>
      {!done && (
        <form onSubmit={submit}>
          <label htmlFor="password">New password (12–128 characters)</label>
          <p>
            <input
              id="password"
              type="password"
              autoComplete="new-password"
              required
              minLength={12}
              maxLength={128}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
            />
          </p>
          <button disabled={busy} type="submit">
            {busy ? 'Saving…' : 'Reset password'}
          </button>
        </form>
      )}
      <p role="status">{message}</p>
    </>
  );
}
